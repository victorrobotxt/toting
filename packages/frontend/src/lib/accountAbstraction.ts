// packages/frontend/src/lib/accountAbstraction.ts

import { ethers, BigNumber, BigNumberish } from "ethers";
import { SimpleAccountAPI } from "@account-abstraction/sdk";
import ElectionManagerV2 from "../contracts/ElectionManagerV2.json";
import { ProofWalletAPI, ZkProof } from "./ProofWalletAPI";
import { getConfig } from "../networks";

const ENTRY_POINT_ABI = [
    "function depositTo(address account) payable",
    "function balanceOf(address account) view returns (uint256)"
];


// This is the type we get from the SDK, which can contain promises for some fields.
// We derive it from the SimpleAccountAPI to ensure it's always correct.
type UserOperation = Parameters<SimpleAccountAPI['signUserOp']>[0];

async function sendUserOpToBundler(userOpWithPromises: UserOperation, cfg: ReturnType<typeof getConfig>): Promise<string> {
    const bundler = new ethers.providers.JsonRpcProvider(cfg.bundlerUrl);
    const bundlerNetwork = await bundler.getNetwork();
    console.log(`[accountAbstraction] sending to bundler on chain ${bundlerNetwork.chainId}`);

    // 1. Resolve all promise-based fields. The result is an object with concrete values.
    const resolvedUserOp = await ethers.utils.resolveProperties(userOpWithPromises);

    // 2. Manually serialize the now-resolved object into a plain JSON object with hex strings,
    //    using `ethers.utils.hexValue` to correctly format QUANTITY types (e.g., no extra padded zeros).
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
        [serializedUserOp, cfg.entryPoint]
    );
    console.log(`[accountAbstraction] bundler returned hash: ${userOpHash}`);
    return userOpHash;
}

async function ensurePrefund(api: ProofWalletAPI, signer: ethers.Signer, cfg: ReturnType<typeof getConfig>) {
    const entryPoint = new ethers.Contract(cfg.entryPoint, ENTRY_POINT_ABI, signer);
    const account = await api.getAccountAddress();
    const deposit: BigNumber = await entryPoint.balanceOf(account);
    if (deposit.eq(0)) {
        console.log(`[accountAbstraction] Depositing 0.01 ETH for ${account}`);
        const tx = await entryPoint.depositTo(account, {
            value: ethers.utils.parseEther('0.01'),
        });
        await tx.wait();
    }
}

export async function bundleUserOp(
    signer: ethers.Signer,
    target: string,
    data: string,
    eligibilityProof?: ZkProof,
    eligibilityPubSignals?: string[]
): Promise<string> {
    const provider = signer.provider!;

    const network = await provider.getNetwork();
    const cfg = getConfig(network.chainId);
    if (!cfg.entryPoint || !cfg.bundlerUrl) {
        throw new Error("Bundler/EntryPoint not configured for chain " + network.chainId);
    }

    const bundlerProvider = new ethers.providers.JsonRpcProvider(cfg.bundlerUrl);
    const bundlerNetwork = await bundlerProvider.getNetwork();
    console.log(
        `[accountAbstraction] signer network: ${network.chainId}, bundler network: ${bundlerNetwork.chainId}`
    );

    if (network.chainId !== bundlerNetwork.chainId) {
        throw new Error(
            `Wallet connected to wrong chain (chainId ${network.chainId}). ` +
            `Please switch to chain ${bundlerNetwork.chainId}.`
        );
    }

    console.log("Submitting UserOp via Account Abstraction...");

    const api = new ProofWalletAPI({
        provider,
        entryPointAddress: cfg.entryPoint,
        owner: signer,
        zkProof: eligibilityProof,
        pubSignals: eligibilityPubSignals,
    });

    await ensurePrefund(api, signer, cfg);

    const unsignedOp = await api.createUnsignedUserOp({
        target,
        data,
    });
    
    // Await the initCode before checking its properties
    const initCode = await unsignedOp.initCode;
    
    // --- THIS IS THE FIX ---
    // Check if this is a wallet-creation UserOp (it will have a non-empty initCode).
    if (initCode && initCode !== '0x' && initCode.length > 2) {
      // Bundler gas estimation for wallet creation with ZK proof verification
      // is often too low. We'll set a higher, fixed verificationGasLimit to ensure
      // the initCode has enough gas to execute the factory's `createAccount` method,
      // which includes the expensive `verifyProof` call.
      console.log('Wallet creation detected. Overriding verificationGasLimit to 2,000,000.');
      unsignedOp.verificationGasLimit = 2_000_000;
    }

    const signedOp = await api.signUserOp(unsignedOp);
    
    // Pass the signed operation (which may contain promises) to our robust sending function.
    return sendUserOpToBundler(signedOp, cfg);
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

    const provider = signer.provider!;
    const network = await provider.getNetwork();
    const cfg = getConfig(network.chainId);

    return bundleUserOp(
        signer,
        cfg.electionManager,
        callData,
        eligibilityProof,
        eligibilityPubSignals
    );
}
