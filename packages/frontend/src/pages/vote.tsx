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
    const { token, eligibility, logout } = useAuth();
    const { showToast } = useToast();
    const [receipt, setReceipt] = useState<string>();
    const [jobId, setJobId] = useState<string>();
    const [loading, setLoading] = useState(false);
    const id = router.query.id as string | undefined;

    const cast = async (option: 0 | 1) => {
        const provider = new ethers.providers.Web3Provider((window as any).ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const payload = { credits: [option], nonce: 1 };
        const res = await fetch(apiUrl('/api/zk/voice'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });
        if (res.status === 429) {
            showToast({ type: 'error', message: 'quota exceeded' });
            return;
        }
        const job = await res.json();
        setJobId(job.job_id);
        setLoading(true);
        const out = await fetch(`${apiUrl('/api/zk/voice/')}${job.job_id}`).then(r => r.json());
        if (out.status !== 'done') {
            showToast({ type: 'error', message: 'proof error' });
            setLoading(false);
            setJobId(undefined);
            return;
        }
        const vcProof = out.proof;
        const nonce = payload.nonce;
        try {
            const userOpHash = await bundleSubmitVote(signer, option, nonce, vcProof);
            setReceipt(userOpHash);
        } catch (e:any) {
            showToast({ type: 'error', message: e.message });
        }
        setLoading(false);
        setJobId(undefined);
    };

    const overlay = jobId && loading ? (
        <ProgressOverlay jobId={jobId} onDone={() => { setJobId(undefined); setLoading(false); }} />
    ) : null;

    return (
        <>
            <NavBar />
            <div style={{padding:'1rem'}}>
                <h2>Vote on election {id} <HelpTip content="Voice credits decide weight" /></h2>
                {eligibility ? (
                  <div style={{display:'flex',gap:'1rem'}}>
                    <button
                      onClick={() => cast(0)}
                      style={{flex:1,minHeight:48,background:'#e5e7eb',borderRadius:8}}
                    >Vote A</button>
                    <button
                      onClick={() => cast(1)}
                      style={{flex:1,minHeight:48,background:'#e5e7eb',borderRadius:8}}
                    >Vote B</button>
                  </div>
                ) : (
                  <NotEligible />
                )}
                {receipt && <p>Your vote receipt: {receipt}</p>}
            </div>
            {overlay}
        </>
    );
}

export default withAuth(VotePage);
