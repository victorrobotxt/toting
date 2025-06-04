import { useState } from "react";
import { ethers } from "ethers";
import { useRouter } from "next/router";
import { bundleSubmitVote } from "../lib/accountAbstraction";
import withAuth from "../components/withAuth";
import NavBar from "../components/NavBar";
import { useAuth } from "../lib/AuthProvider";

function VotePage() {
    const router = useRouter();
    const { token, logout } = useAuth();
    const [receipt, setReceipt] = useState<string>();
    const id = router.query.id as string | undefined;

    const cast = async (option: 0 | 1) => {
        const provider = new ethers.providers.Web3Provider((window as any).ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const proofRes = await fetch(`http://localhost:8000/api/maci/getProof`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!proofRes.ok) {
            logout();
            return;
        }
        const { nonce, vcProof } = await proofRes.json();
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
                <button onClick={() => cast(0)}>Vote A</button>
                <button onClick={() => cast(1)}>Vote B</button>
                {receipt && <p>Your vote receipt: {receipt}</p>}
            </div>
        </>
    );
}

export default withAuth(VotePage);
