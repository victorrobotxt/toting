import { useState } from "react";
import { ethers } from "ethers";
import { useRouter } from "next/router";
import { bundleSubmitVote } from "../lib/accountAbstraction";
import withAuth from "../components/withAuth";
import NavBar from "../components/NavBar";
import { useAuth } from "../lib/AuthProvider";

function VotePage() {
    const router = useRouter();
    const { token, eligibility, logout } = useAuth();
    const [receipt, setReceipt] = useState<string>();
    const id = router.query.id as string | undefined;

    const cast = async (option: 0 | 1) => {
        const provider = new ethers.providers.Web3Provider((window as any).ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const payload = { credits: [option], nonce: 1 };
        const res = await fetch(`http://localhost:8000/api/zk/voice`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });
        if (res.status === 429) {
            setReceipt('quota exceeded');
            return;
        }
        const job = await res.json();
        const out = await fetch(`http://localhost:8000/api/zk/voice/${job.job_id}`).then(r => r.json());
        if (out.status !== 'done') {
            setReceipt('proof error');
            return;
        }
        const vcProof = out.proof;
        const nonce = payload.nonce;
        try {
            const userOpHash = await bundleSubmitVote(signer, option, nonce, vcProof);
            setReceipt(userOpHash);
        } catch (e:any) {
            setReceipt("error: " + e.message);
        }
    };

    return (
        <>
            <NavBar />
            <div style={{padding:'1rem'}}>
                <h2>Vote on election {id}</h2>
                <button onClick={() => cast(0)} disabled={!eligibility}>Vote A</button>
                <button onClick={() => cast(1)} disabled={!eligibility}>Vote B</button>
                {!eligibility && <p style={{color:'red'}}>Not eligible to vote</p>}
                {receipt && <p>Your vote receipt: {receipt}</p>}
            </div>
        </>
    );
}

export default withAuth(VotePage);
