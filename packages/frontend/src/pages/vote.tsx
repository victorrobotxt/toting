// packages/frontend/src/pages/vote.tsx
import { useState } from "react";
import { ethers } from "ethers";
import { useRouter } from "next/router";
import { bundleSubmitVote } from "../lib/accountAbstraction";
import { ZkProof } from "../lib/ProofWalletAPI"; // Keep this for eligibility proof
import withAuth from "../components/withAuth";
import NavBar from "../components/NavBar";
import { useAuth } from "../lib/AuthProvider";
import { useToast } from "../lib/ToastProvider";
import { NotEligible } from "../components/ZeroState";
import HelpTip from "../components/HelpTip";
import { apiUrl, jsonFetcher } from "../lib/api";

// The vote proof from the API is a flat string (hex), not the structured ZkProof object.
type VoteProofResult = {
    proof: string; // This will be a hex string like "0x..."
    pubSignals: string[];
    job_id?: string;
    status?: string;
};

// Eligibility proof IS the structured object
type EligibilityProofResult = {
    proof: ZkProof; 
    pubSignals: string[];
    job_id?: string;
    status?: string;
};


function VotePage() {
    const router = useRouter();
    const { token, eligibility } = useAuth();
    const { showToast } = useToast();
    
    const [receipt, setReceipt] = useState<string>();
    const [loading, setLoading] = useState(false);
    const [statusText, setStatusText] = useState("");
    
    const { id: electionId } = router.query;

    if (!router.isReady) {
        return <><NavBar /><div style={{ padding: '1rem', textAlign: 'center' }}>Loading...</div></>;
    }

    const cast = async (option: 0 | 1) => {
        if (!electionId || !(window as any).ethereum) {
            showToast({ type: 'error', message: 'Election ID missing or no wallet detected' });
            return;
        }

        setLoading(true);
        setReceipt("");
        setStatusText("Requesting proofs from server...");

        const provider = new ethers.providers.Web3Provider((window as any).ethereum);
        await provider.send("eth_requestAccounts", []);

        const voicePayload = { credits: [option === 0 ? 1 : 0, option === 1 ? 1 : 0], nonce: Date.now() };
        const eligibilityPayload = { country: "US", dob: "1990-01-01", residency: "CA" };

        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        };

        try {
            const [voiceRes, eligibilityRes] = await Promise.all([
                fetch(apiUrl('/api/zk/voice'), { method: 'POST', headers, body: JSON.stringify(voicePayload) }),
                fetch(apiUrl('/api/zk/eligibility'), { method: 'POST', headers, body: JSON.stringify(eligibilityPayload) })
            ]);

            if (voiceRes.status === 429 || eligibilityRes.status === 429) throw new Error('Proof quota exceeded');
            if (!voiceRes.ok || !eligibilityRes.ok) throw new Error('Failed to start proof generation');

            const { job_id: voiceJobId } = await voiceRes.json();
            const { job_id: eligibilityJobId } = await eligibilityRes.json();

            setStatusText("Generating ZK proofs... this may take a moment.");
            
            const [voteProofResult, eligibilityProofResult] = await Promise.all([
                pollForResult<VoteProofResult>(`${apiUrl('/api/zk/voice/')}${voiceJobId}`, token),
                pollForResult<EligibilityProofResult>(`${apiUrl('/api/zk/eligibility/')}${eligibilityJobId}`, token)
            ]);
            
            setStatusText("Proofs generated! Please confirm in your wallet...");

            const signer = provider.getSigner();

            const userOpHash = await bundleSubmitVote(
                signer,
                Number(electionId),
                option,
                voteProofResult.proof, // This is now correctly a string
                voteProofResult.pubSignals,
                eligibilityProofResult.proof,
                eligibilityProofResult.pubSignals
            );

            setReceipt(userOpHash);
            setStatusText("Success! Your UserOperation has been sent to the bundler.");
            showToast({ type: 'success', message: 'Vote submitted successfully!' });

        } catch (err: any) {
            console.error("Voting error:", err);
            const readableError = err.info?.detail || err.message || 'An unknown error occurred';
            showToast({ type: 'error', message: readableError });
            setStatusText("");
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <>
            <NavBar />
            <div style={{ padding: '1rem', maxWidth: '600px', margin: 'auto' }}>
                <h2>
                    Vote on election #{electionId}
                    <HelpTip content="Your vote is private. The first vote also creates your smart wallet." />
                </h2>
                
                {eligibility ? (
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                        <button onClick={() => cast(0)} disabled={loading}>Vote A</button>
                        <button onClick={() => cast(1)} disabled={loading}>Vote B</button>
                    </div>
                ) : (
                    <NotEligible />
                )}

                {loading && <p>{statusText || "Loading..."}</p>}

                {receipt && (
                    <div style={{ marginTop: '2rem', padding: '1rem', background: '#f0fdf4' }}>
                        <p><b>UserOp Hash:</b></p>
                        <p style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>{receipt}</p>
                    </div>
                )}
            </div>
        </>
    );
}

// Helper to poll for proof job completion
async function pollForResult<T extends { status?: string }>(url: string, token: string | null, interval = 2000, maxAttempts = 30): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, interval));
    const data = await jsonFetcher([url, token || '']);
    if (data.status === 'done') return data as T;
  }
  throw new Error(`Polling timed out for ${url}`);
};

export default withAuth(VotePage);
