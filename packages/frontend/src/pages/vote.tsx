import { useState } from "react";
import { ethers } from "ethers";
import { useRouter } from "next/router";
import { useEffect } from "react";
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
    const [jobId, setJobId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const id = router.query.id as string | undefined;

    const cast = async (option: 0 | 1) => {
      if (!(window as any).ethereum) {
        showToast({ type: 'error', message: 'No Ethereum wallet detected' });
        return;
      }
      const provider = new ethers.providers.Web3Provider((window as any).ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();

      // 1a) POST to /api/zk/voice
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

      const { job_id } = await res.json(); // { job_id: "…" }
      setJobId(job_id);
      setLoading(true);

      // At this point, `ProgressOverlay` will appear. Once it signals onDone(), we'll fetch the result.
    };

    // 2) Once ProgressOverlay calls onDone(), fetch final proof and do the wallet operation:
    const onProofDone = async () => {
      if (!jobId) return;
      try {
        const out = await fetch(`${apiUrl('/api/zk/voice/')}${jobId}`).then(r => r.json());
        if (out.status !== 'done' || !out.proof) {
          showToast({ type: 'error', message: 'proof error' });
          return;
        }
        // we have a valid proof now:
        if (!(window as any).ethereum) {
          showToast({ type: 'error', message: 'No Ethereum wallet detected' });
          return;
        }
        const provider = new ethers.providers.Web3Provider((window as any).ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const vcProof = out.proof;
        const nonce = 1; // (the same nonce you passed above)

        const userOpHash = await bundleSubmitVote(
          signer,
          Number(id!),
          /* option= */ out.pubSignals![0], // or your stored option
          nonce,
          vcProof
        );
        setReceipt(userOpHash);
      } catch (err: any) {
        // Extract revert reason when possible
        const m = /reverted with reason string '([^']+)'/.exec(err.message || "");
        showToast({ type: 'error', message: m ? m[1] : 'tx reverted' });
      } finally {
        setLoading(false);
        setJobId(null);
      }
    };

    // 3) Render:
    const overlay = jobId && loading ? (
     <ProgressOverlay jobId={jobId} onDone={onProofDone} />
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
