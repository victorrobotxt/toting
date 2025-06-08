// packages/frontend/src/lib/accountAbstraction.ts

import { ethers, BigNumber, BigNumberish } from "ethers";
import { SimpleAccountAPI } from "@account-abstraction/sdk";
import ElectionManagerV2 from "../contracts/ElectionManagerV2.json";
import { ProofWalletAPI, ZkProof } from "./ProofWalletAPI";

const ENTRY_POINT_ADDRESS = process.env.NEXT_PUBLIC_ENTRYPOINT!;
const ELECTION_MANAGER_ADDR = process.env.NEXT_PUBLIC_ELECTION_MANAGER!;
const BUNDLER_RPC_URL = process.env.NEXT_PUBLIC_BUNDLER_URL!;

// This is the type we get from the SDK, which can contain promises for some fields.
// We derive it from the SimpleAccountAPI to ensure it's always correct.
type UserOperation = Parameters<SimpleAccountAPI['signUserOp']>[0];

async function sendUserOpToBundler(userOpWithPromises: UserOperation): Promise<string> {
    const bundler = new ethers.providers.JsonRpcProvider(BUNDLER_RPC_URL);

    // --- The Fix ---
    // 1. Resolve all promise-based fields. The result is an object with concrete values.
    const resolvedUserOp = await ethers.utils.resolveProperties(userOpWithPromises);

    // 2. Manually serialize the now-resolved object into a plain JSON object with hex strings,
    //    using `ethers.utils.hexValue` to correctly format QUANTITY types (no padded zeros).
    const serializedUserOp = {
        sender: resolvedUserOp.sender,
        nonce: ethers.utils.hexValue(resolvedUserOp.nonce),
        initCode: resolvedUserOp.initCode,
        callData: resolvedUserOp.callData,
        callGasLimit: ethers.utils.hexValue(resolvedUserOp.callGasLimit),
        verificationGasLimit: ethers.utils.hexValue(resolvedUserOp.verificationGasLimit),
        preVerificationGas: ethers.utils.hexValue(resolvedUserOp.preVerificationGas),
        maxFeePerGas: ethers.utils.hexValue(resolvedUserOp.maxFeePerGas),
        maxPriorityFeePerGas: ethers.utils.hexValue(resolvedUserOp.maxPriorityFeePerGas),
        paymasterAndData: resolvedUserOp.paymasterAndData,
        signature: resolvedUserOp.signature,
    };

    console.log("Sending serialized UserOp to bundler:", serializedUserOp);

    const userOpHash: string = await bundler.send(
        "eth_sendUserOperation",
        [serializedUserOp, ENTRY_POINT_ADDRESS]
    );
    return userOpHash;
}

export async function bundleUserOp(
    signer: ethers.Signer,
    target: string,
    data: string,
    eligibilityProof?: ZkProof,
    eligibilityPubSignals?: string[]
): Promise<string> {
    const provider = signer.provider!;

    if (!ENTRY_POINT_ADDRESS || !BUNDLER_RPC_URL) {
        throw new Error("Bundler/EntryPoint not configured in environment variables.");
    }
    
    console.log("Submitting UserOp via Account Abstraction...");

    const api = new ProofWalletAPI({
        provider,
        entryPointAddress: ENTRY_POINT_ADDRESS,
        owner: signer,
        zkProof: eligibilityProof,
        pubSignals: eligibilityPubSignals,
    });

    const unsignedOp = await api.createUnsignedUserOp({
        target,
        data,
    });

    const signedOp = await api.signUserOp(unsignedOp);
    
    // Pass the signed operation (which may contain promises) to our robust sending function.
    return sendUserOpToBundler(signedOp);
}

/**
 * A specialized function for submitting a vote.
 */
export async function bundleSubmitVote(
    signer: ethers.Signer,
    electionId: number,
    voteOption: number,
    voteProof: ethers.BytesLike,
    votePubSignals: string[],
    eligibilityProof?: ZkProof,
    eligibilityPubSignals?: string[]
): Promise<string> {
    const nonce = votePubSignals.length > 0 ? parseInt(votePubSignals[0], 10) : Date.now();
    
    const proofBytes = ethers.utils.arrayify(voteProof);
    
    const managerIface = new ethers.utils.Interface(ElectionManagerV2.abi);

    const callData = managerIface.encodeFunctionData("enqueueMessage", [
        electionId,
        voteOption,
        nonce,
        proofBytes,
    ]);

    return bundleUserOp(
        signer,
        ELECTION_MANAGER_ADDR,
        callData,
        eligibilityProof,
        eligibilityPubSignals
    );
}
