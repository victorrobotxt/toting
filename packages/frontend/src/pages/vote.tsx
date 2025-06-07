// packages/frontend/src/pages/vote.tsx

import { useState } from "react";
import { ethers } from "ethers";
import { useRouter } from "next/router";
import { bundleSubmitVote } from "../lib/accountAbstraction";
import withAuth from "../components/withAuth";
import NavBar from "../components/NavBar";
import { useAuth } from "../lib/AuthProvider";
import { useToast } from "../lib/ToastProvider";
import { NotEligible } from "../components/ZeroState";
import HelpTip from "../components/HelpTip";
import ProgressOverlay from "../components/ProgressOverlay";
import { apiUrl } from "../lib/api";

function VotePage() {
    const router = useRouter();
    const { token, eligibility } = useAuth();
    const { showToast } = useToast();
    
    const [receipt, setReceipt] = useState<string>();
    const [jobId, setJobId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedOption, setSelectedOption] = useState<0 | 1 | null>(null);
    
    // Get the ID from the router query only when it's ready.
    const { id } = router.query;

    // Add a guard to wait for the router to be ready.
    if (!router.isReady) {
        return (
            <>
                <NavBar />
                <div style={{ padding: '1rem', textAlign: 'center' }}>
                    <p>Loading election...</p>
                </div>
            </>
        );
    }

    const cast = async (option: 0 | 1) => {
        // Add a guard to ensure `id` is present and wallet exists.
        if (!id || !(window as any).ethereum) {
            showToast({ type: 'error', message: 'Election ID is missing or no wallet detected' });
            return;
        }

        setSelectedOption(option);
        setLoading(true);

        const provider = new ethers.providers.Web3Provider((window as any).ethereum);
        await provider.send("eth_requestAccounts", []);

        const payload = { credits: [option === 0 ? 1 : 0, option === 1 ? 1 : 0], nonce: Date.now() };
        
        try {
            const res = await fetch(apiUrl('/api/zk/voice'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            if (res.status === 429) {
                showToast({ type: 'error', message: 'Proof quota exceeded' });
                setLoading(false);
                return;
            }

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Failed to start proof generation');
            }

            const { job_id } = await res.json();
            setJobId(job_id);

        } catch (err: any) {
            showToast({ type: 'error', message: err.message || 'An unknown error occurred' });
            setLoading(false);
        }
    };

    const onProofDone = async () => {
        // Add a guard to ensure `id` and other state is present.
        if (!jobId || selectedOption === null || !id) {
            setLoading(false);
            return; 
        }

        try {
            const proofResult = await fetch(`${apiUrl('/api/zk/voice/')}${jobId}`).then(r => r.json());

            if (proofResult.status !== 'done' || !proofResult.proof) {
                throw new Error('Proof generation failed on the server.');
            }
            
            if (!(window as any).ethereum) {
                throw new Error('No Ethereum wallet detected');
            }
            const provider = new ethers.providers.Web3Provider((window as any).ethereum);
            await provider.send("eth_requestAccounts", []);
            const signer = provider.getSigner();

            const userOpHash = await bundleSubmitVote(
                signer,
                Number(id), // `id` is now guaranteed to be a string from the URL.
                selectedOption,
                proofResult.pubSignals[0], 
                proofResult.proof
            );

            setReceipt(userOpHash);
            showToast({ type: 'success', message: 'Vote submitted successfully!' });

        } catch (err: any) {
            // Try to parse a meaningful revert reason from the error, including Hardhat/Anvil format.
            const reasonMatch = /reverted with reason string '([^']+)'/.exec(err.message || "") || /revert(?:ed)?(?: with)? "([^"]+)"/.exec(err.message || "");
            const readableError = reasonMatch ? reasonMatch[1] : (err.data?.message || err.message || 'Transaction reverted');
            showToast({ type: 'error', message: readableError });
        } finally {
            setLoading(false);
            setJobId(null);
            setSelectedOption(null);
        }
    };

    const overlay = jobId && loading ? (
        <ProgressOverlay jobId={jobId} onDone={onProofDone} />
    ) : null;

    return (
        <>
            <NavBar />
            <div style={{ padding: '1rem', maxWidth: '600px', margin: 'auto' }}>
                <h2>
                    Vote on election #{id}
                    <HelpTip content="Your vote is weighted by voice credits. This transaction is private." />
                </h2>
                
                {eligibility ? (
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                        <button
                            onClick={() => cast(0)}
                            style={{
                                flex: 1, minHeight: '60px', background: 'var(--muted)',
                                border: selectedOption === 0 ? '2px solid var(--primary)' : '2px solid transparent',
                                borderRadius: 8, fontSize: '1.2rem', cursor: 'pointer',
                            }}
                            disabled={loading}
                        >
                            Vote A
                        </button>
                        <button
                            onClick={() => cast(1)}
                            style={{
                                flex: 1, minHeight: '60px', background: 'var(--muted)',
                                border: selectedOption === 1 ? '2px solid var(--primary)' : '2px solid transparent',
                                borderRadius: 8, fontSize: '1.2rem', cursor: 'pointer',
                            }}
                            disabled={loading}
                        >
                            Vote B
                        </button>
                    </div>
                ) : (
                    <NotEligible />
                )}

                {receipt && (
                    <div style={{ marginTop: '2rem', padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px' }}>
                        <p style={{ fontWeight: 'bold' }}>Your vote receipt:</p>
                        <p style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.9rem' }}>{receipt}</p>
                    </div>
                )}
            </div>
            {overlay}
        </>
    );
}

export default withAuth(VotePage);
