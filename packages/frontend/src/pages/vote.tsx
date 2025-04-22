import { useState } from "react";
import { ethers } from "ethers";
import { bundleSubmitVote } from "../lib/accountAbstraction";

export default function VotePage() {
    const [receipt, setReceipt] = useState<string>();
    const cast = async (option: 0 | 1) => {
        const provider = new ethers.providers.Web3Provider((window as any).ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        // fetch your MACI voice‑credit proof
        const { nonce, vcProof } = await fetch("/api/maci/getProof").then(r => r.json());
        const resp = await bundleSubmitVote(signer, option, nonce, vcProof);
        setReceipt(resp.userOpHash);
    };
    return (
        <div>
            <button onClick={() => cast(0)}>Vote A</button>
            <button onClick={() => cast(1)}>Vote B</button>
            {receipt && <p>Your vote receipt: {receipt}</p>}
        </div>
    );
}
