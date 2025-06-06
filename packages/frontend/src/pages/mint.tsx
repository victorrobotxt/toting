import { useState } from "react";
import { ethers } from "ethers";
import { bundleCreateWallet } from "../lib/accountAbstraction";

export default function MintPage() {
    const [txHash, setTxHash] = useState<string>();
    const onMint = async () => {
        if (!(window as any).ethereum) {
            alert('No Ethereum wallet detected');
            return;
        }
        const provider = new ethers.providers.Web3Provider((window as any).ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const { proof, pubSignals } = await fetch("/api/zk/mintProof").then(r => r.json());

        // now returns the string hash directly
        const userOpHash = await bundleCreateWallet(signer, proof, pubSignals, await signer.getAddress());
        setTxHash(userOpHash);
    };
    return (
        <div>
            <button onClick={onMint}>Mint Wallet</button>
            {txHash && <p>Your mint-receipt: {txHash}</p>}
        </div>
    );
}
