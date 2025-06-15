// packages/frontend/src/pages/vote.tsx
import { useState } from "react";
import { ethers } from "ethers";
import { useRouter } from "next/router";
import useSWR from 'swr';
import { bundleSubmitVote } from "../lib/accountAbstraction";
import { ZkProof } from "../lib/ProofWalletAPI"; // Keep this for eligibility proof
import withAuth from "../components/withAuth";
import NavBar from "../components/NavBar";
import Skeleton from "../components/Skeleton";
import { useAuth } from "../lib/AuthProvider";
import { useToast } from "../lib/ToastProvider";
import { NotEligible, NoElections } from "../components/ZeroState";
import HelpTip from "../components/HelpTip";
import { apiUrl, jsonFetcher } from "../lib/api";

// --- Types for API responses ---
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

// --- Types for our Data ---
interface ElectionOption {
  id: string;
  label: string;
}

interface ElectionMetadata {
  title: string;
  description: string;
  options: ElectionOption[];
}

interface ElectionDetails {
    id: number;
    meta: string; // This is the hash
    status: string;
    verifier?: string;
}

// --- SWR Fetchers ---
// Fetches from our backend API
const apiFetcher = ([url, token]: [string, string?]) => jsonFetcher([url, token]);

// --- FIX: Renamed fetcher for clarity, used for public-accessible URLs ---
const publicJsonFetcher = (url: string) => fetch(url).then(res => {
    if (!res.ok) throw new Error(`Failed to fetch metadata: ${res.statusText}`);
    return res.json();
});


function VotePage() {
    const router = useRouter();
    const { token, eligibility } = useAuth();
    const { showToast } = useToast();
    
    const [receipt, setReceipt] = useState<string>();
    const [loading, setLoading] = useState(false);
    const [statusText, setStatusText] = useState("");
    
    const { id: electionId } = router.query;

    // --- Data Fetching Logic ---
    // 1. Fetch the core election details from our API
    const { 
        data: election, 
        error: electionError 
    } = useSWR<ElectionDetails>(
        (electionId && token) ? [`/elections/${electionId}`, token] : null, 
        apiFetcher
    );
    
    // 2. If the election exists, fetch its metadata from our OWN backend
    // --- THIS IS THE FIX: Use the correct API endpoint for metadata ---
    const { 
        data: metadata, 
        error: metadataError 
    } = useSWR<ElectionMetadata>(
        election ? apiUrl(`/elections/${election.id}/meta`) : null,
        publicJsonFetcher
    );

    // --- Loading and Error Handling ---
    if (!router.isReady) {
        return <><NavBar /><div style={{ padding: '1rem', textAlign: 'center' }}>Loading...</div></>;
    }

    if (electionError) {
        // This handles cases where the electionId is invalid (e.g., /vote?id=10000)
        return <><NavBar /><NoElections /></>;
    }

    // --- Main Action: Cast Vote ---
    const cast = async (optionIndex: number) => {
        if (!electionId || !(window as any).ethereum || !metadata) {
            showToast({ type: 'error', message: 'Required data missing or no wallet detected' });
            return;
        }

        setLoading(true);
        setReceipt("");
        setStatusText("Requesting proofs from server...");

        // Create a one-hot encoded array for the vote credits
        const credits = metadata.options.map((_, index) => (index === optionIndex ? 1 : 0));

        const provider = new ethers.providers.Web3Provider((window as any).ethereum);
        await provider.send("eth_requestAccounts", []);
        const net = await provider.getNetwork();
        console.log(`[vote.tsx] connected chainId: ${net.chainId}`);

        const voicePayload = { credits, nonce: Date.now() };
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

            // Note: The `bundleSubmitVote` function's second argument `voteOption` is now just for logging/debugging.
            // The actual vote is encoded in the proof, derived from the `credits` array. We'll pass the index.
            const userOpHash = await bundleSubmitVote(
                signer,
                Number(electionId),
                optionIndex,
                voteProofResult.proof,
                voteProofResult.pubSignals,
                eligibilityProofResult.proof,
                eligibilityProofResult.pubSignals,
                election?.verifier
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
                {!election || !metadata || metadataError ? (
                    <div>
                        <h2><Skeleton width={300} height={36} /></h2>
                        <Skeleton style={{marginTop: '1rem'}} width="80%" height={20} />
                        <Skeleton style={{marginTop: '1.5rem'}} width="100%" height={48} />
                        <Skeleton style={{marginTop: '1rem'}} width="100%" height={48} />
                    </div>
                ) : (
                    <>
                        <h2>
                            {metadata.title}
                            <HelpTip content="Your vote is private. The first vote also creates your smart wallet." />
                        </h2>
                        <p style={{ marginTop: '0.5rem', color: '#aaa' }}>{metadata.description}</p>
                        
                        {!eligibility ? (
                            <NotEligible />
                        ) : election.status !== 'open' ? (
                            <div style={{ marginTop: '2rem', padding: '1rem', background: '#fefcbf', textAlign: 'center' }}>
                                This election is not currently open for voting. (Status: {election.status})
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4 mt-6">
                                {metadata.options.map((option, index) => {
                                    const colors = [
                                        'bg-green-600 hover:bg-green-700 focus:ring-green-300',
                                        'bg-red-600 hover:bg-red-700 focus:ring-red-300',
                                        'bg-blue-600 hover:bg-blue-700 focus:ring-blue-300',
                                        'bg-purple-600 hover:bg-purple-700 focus:ring-purple-300'
                                    ];
                                    const colour = colors[index % colors.length];
                                    return (
                                        <button
                                            key={option.id}
                                            onClick={() => cast(index)}
                                            disabled={loading}
                                            className={
                                                `w-full p-6 rounded-lg shadow text-white text-lg font-semibold transition-colors focus:outline-none focus:ring-2 ${colour} disabled:opacity-50`
                                            }
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {loading && <div style={{marginTop: '2rem', textAlign: 'center'}}><span className="loading loading-dots loading-lg"></span><p>{statusText || "Loading..."}</p></div>}

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