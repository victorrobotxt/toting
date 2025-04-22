import { EntryPoint, UserOperationBuilder } from "@account-abstraction/sdk";
import { ethers } from "ethers";

const ENTRY_POINT_ADDRESS = process.env.NEXT_PUBLIC_ENTRYPOINT!;
const WALLET_FACTORY = process.env.NEXT_PUBLIC_WALLET_FACTORY!;
const ELECTION_MANAGER = process.env.NEXT_PUBLIC_ELECTION_MANAGER!;

export const ep = new EntryPoint({
    provider: new ethers.providers.Web3Provider((window as any).ethereum),
    entryPointAddress: ENTRY_POINT_ADDRESS,
});

export async function bundleCreateWallet(
    signer: ethers.Signer,
    proof: { a: [string, string], b: [[string, string], [string, string]], c: [string, string] },
    pubSignals: string[],
    owner: string
) {
    const initOp = await UserOperationBuilder.createWalletOp({
        factoryAddress: WALLET_FACTORY,
        owner,
        initData: { a: proof.a, b: proof.b, c: proof.c, pubSignals },
    });
    return ep.sendUserOperation(initOp, signer);
}

export async function bundleSubmitVote(
    signer: ethers.Signer,
    voteOption: number,
    nonce: number,
    vcProof: Uint8Array
) {
    const iface = new ethers.utils.Interface([
        "function enqueueMessage(uint256,uint256,bytes)",
    ]);
    const data = iface.encodeFunctionData("enqueueMessage", [
        voteOption,
        nonce,
        vcProof,
    ]);
    const voteOp = await UserOperationBuilder.accountOp({
        target: ELECTION_MANAGER,
        data,
    });
    return ep.sendUserOperation(voteOp, signer);
}
