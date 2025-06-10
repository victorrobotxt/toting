// frontend/components/VoteHandler.tsx
import { useState } from 'react';
import { ethers } from 'ethers';
import ElectionManagerABI from '../src/contracts/ElectionManagerV2.json';
import { getConfig } from '../src/networks';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

interface VoteHandlerProps {
  electionId: number;
}

interface ProofResult {
  status?: string; // Required by the pollForResult constraint
  proof: any;
  pubSignals: string[];
}

// Helper function to poll for proof results
async function pollForResult<T extends { status?: string }>(url: string, interval = 2000, maxAttempts = 30): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        // The backend returns a status field. We need to poll until it's 'done'.
        if (data.status === 'done') {
            return data as T;
        }
      }
    } catch (e) {
      console.warn('Polling failed, will retry...');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error('Polling timed out.');
};


export default function VoteHandler({ electionId }: VoteHandlerProps) {
  const [vote, setVote] = useState<'1' | '0' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');

  const handleVote = async () => {
    if (!vote) {
      setError('Please select an option to vote.');
      return;
    }

    if (!window.ethereum) {
      setError('MetaMask is not installed. Please use a Web3-enabled browser.');
      return;
    }

    setIsLoading(true);
    setError('');
    setTxHash('');

    try {
      // Step 1: Generate ZK Proof from our backend
      setStatusMessage('Generating your private proof... This may take a moment.');
      
      const proofPayload = {
          credits: vote === '1' ? [0, 1] : [1, 0], // Example mapping for a two-option vote
          nonce: Date.now()
      };
      
      const proofResponse = await fetch(`${BACKEND_URL}/api/zk/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proofPayload),
      });

      if (!proofResponse.ok) {
        const err = await proofResponse.json();
        throw new Error(err.detail || 'Failed to start proof generation.');
      }

      const { job_id } = await proofResponse.json();
      
      if (!job_id) {
        throw new Error("Proof job ID not received from backend.");
      }

      // Step 2: Poll for the proof result
      setStatusMessage('Waiting for proof to be verified by the worker...');
      const proofResult = await pollForResult<ProofResult>(
        `${BACKEND_URL}/api/zk/voice/${job_id}`
      );
      
      const { proof, pubSignals } = proofResult;
      
      // Step 3: Connect to MetaMask and send the transaction
      setStatusMessage('Please confirm the transaction in your wallet (MetaMask)...');
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send('eth_requestAccounts', []); // Prompts user to connect wallet
      const signer = provider.getSigner();

      const network = await provider.getNetwork();
      const cfg = getConfig(network.chainId);

      const contract = new ethers.Contract(
        cfg.electionManager,
        ElectionManagerABI.abi,
        signer
      );

      // Step 4: Call the smart contract's `enqueueMessage` function
      const nonce = pubSignals.length > 0 ? parseInt(pubSignals[0], 10) : Date.now();
      const tx = await contract.enqueueMessage(electionId, parseInt(vote, 10), nonce, proof);

      setStatusMessage('Submitting your vote to the blockchain... waiting for confirmation.');
      setTxHash(tx.hash);

      await tx.wait(); // Wait for the transaction to be mined

      setStatusMessage('✅ Success! Your vote has been securely and privately cast.');

    } catch (err: any) {
      console.error(err);
      setError(err.reason || err.message || 'An unexpected error occurred.');
      setStatusMessage('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-6 bg-gray-800 rounded-lg shadow-lg">
      <h3 className="text-2xl font-bold text-white mb-4">Cast Your Vote</h3>
      <p className="text-gray-400 mb-6">Your vote is private and secured with Zero-Knowledge Proofs.</p>

      <div className="flex justify-around mb-6">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="radio"
            name="vote"
            value="1"
            className="radio radio-success"
            onChange={(e) => setVote(e.target.value as '1' | '0')}
            disabled={isLoading}
          />
          <span className="text-lg text-green-400">Yes</span>
        </label>
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="radio"
            name="vote"
            value="0"
            className="radio radio-error"
            onChange={(e) => setVote(e.target.value as '1' | '0')}
            disabled={isLoading}
          />
          <span className="text-lg text-red-400">No</span>
        </label>
      </div>
      
      <button 
        className="btn btn-primary w-full"
        onClick={handleVote}
        disabled={isLoading || !vote}
      >
        {isLoading ? <span className="loading loading-spinner"></span> : 'Cast Secure Vote'}
      </button>

      {statusMessage && <p className="text-blue-400 mt-4 text-center">{statusMessage}</p>}
      {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
      {txHash && (
        <p className="text-green-400 mt-4 text-center break-all">
          Success! Tx: <a href={`https://etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline">{txHash}</a>
        </p>
      )}
    </div>
  );
}
