// packages/frontend/src/pages/mint.tsx
import { useState } from "react";
import { ethers } from "ethers";
import { bundleUserOp } from "../lib/accountAbstraction";
import { ZkProof } from "../lib/ProofWalletAPI";
import { useAuth } from "../lib/AuthProvider";
import { useToast } from "../lib/ToastProvider";
import { apiUrl, jsonFetcher } from "../lib/api";
import NavBar from "../components/NavBar";

type ProofResult = {
    proof: ZkProof;
    pubSignals: string[];
    status?: string; // Required by the pollForResult constraint
    job_id?: string;
};

// Helper to poll for proof job completion
async function pollForResult<T extends { status?: string }>(url: string, token: string | null, interval = 2000, maxAttempts = 30): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, interval));
    const data = await jsonFetcher([url, token || '']);
    if (data.status === 'done') return data as T;
  }
  throw new Error(`Polling timed out for ${url}`);
};

export default function MintPage() {
    const { token } = useAuth();
    const { showToast } = useToast();
    const [txHash, setTxHash] = useState<string>();
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");

    const onMint = async () => {
        if (!(window as any).ethereum) {
            return showToast({ type: 'error', message: 'No Ethereum wallet detected' });
        }
        if (!token) {
            return showToast({ type: 'error', message: 'You must be logged in to mint a wallet.' });
        }

        setLoading(true);
        setStatus("Requesting eligibility proof...");

        try {
            const provider = new ethers.providers.Web3Provider((window as any).ethereum);
            await provider.send("eth_requestAccounts", []);
            const net = await provider.getNetwork();
            console.log(`[mint.tsx] connected chainId: ${net.chainId}`);
            const signer = provider.getSigner();

            // 1. Fetch the eligibility proof required for minting.
            const eligibilityPayload = { country: "US", dob: "1990-01-01", residency: "CA" };
            const proofRequestRes = await fetch(apiUrl('/api/zk/eligibility'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(eligibilityPayload),
            });
            
            if (!proofRequestRes.ok) {
                const errData = await proofRequestRes.json();
                throw new Error(errData.detail || 'Failed to request proof.');
            }
            const proofRequest: ProofResult = await proofRequestRes.json();
            
            if (!proofRequest.job_id) throw new Error("Failed to get proof job ID.");
            
            setStatus("Generating proof...");
            const { proof, pubSignals } = await pollForResult<ProofResult>(apiUrl(`/api/zk/eligibility/${proofRequest.job_id}`), token);

            // 2. Prepare a "no-op" transaction to trigger wallet creation.
            setStatus("Submitting to bundler...");
            const userAddress = await signer.getAddress();
            const userOpHash = await bundleUserOp(signer, userAddress, "0x", proof, pubSignals);
            
            setTxHash(userOpHash);
            showToast({ type: 'success', message: 'Wallet mint UserOp submitted!' });

        } catch (err: any) {
            console.error(err);
            const message = err.info?.detail || err.message || 'An error occurred during minting.';
            showToast({ type: 'error', message });
        } finally {
            setLoading(false);
            setStatus("");
        }
    };

    return (
        <>
            <NavBar />
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <button onClick={onMint} disabled={loading}>
                    {loading ? 'Minting...' : 'Mint Smart Wallet'}
                </button>
                {status && <p>{status}</p>}
                {txHash && <div style={{ marginTop: '1rem', wordBreak: 'break-all' }}>
                    <p><b>UserOp Hash:</b></p> 
                    <p>{txHash}</p>
                </div>}
            </div>
        </>
    );
}
