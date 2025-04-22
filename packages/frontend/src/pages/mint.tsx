import { useState } from "react";
import { ethers } from "ethers";
import { bundleCreateWallet } from "../lib/accountAbstraction";

export default function MintPage() {
    const [txHash, setTxHash] = useState<string>();
    const onMint = async () => {
        const provider = new ethers.providers.Web3Provider((window as any).ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        // assume you’ve already fetched `proof` & `pubSignals` from your ZK prover
        const { proof, pubSignals } = await fetch("/api/zk/mintProof").then(r => r.json());
        const resp = await bundleCreateWallet(signer, proof, pubSignals, await signer.getAddress());
        setTxHash(resp.userOpHash);
    };
    return (
        <div>
            <button onClick={onMint}>Mint Wallet</button>
            {txHash && <p>Your mint‑receipt: {txHash}</p>}
        </div>
    );
}
