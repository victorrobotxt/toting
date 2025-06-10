// packages/frontend/src/lib/accountAbstraction.ts

import { ethers, BigNumber, BigNumberish } from "ethers";
import { SimpleAccountAPI } from "@account-abstraction/sdk";
import ElectionManagerV2 from "../contracts/ElectionManagerV2.json";
import { ProofWalletAPI, ZkProof } from "./ProofWalletAPI";
import { apiUrl } from "./api";

const ENTRY_POINT_ABI = [
    "function depositTo(address account) payable",
    "function balanceOf(address account) view returns (uint256)"
];

const ENTRY_POINT_ADDRESS = process.env.NEXT_PUBLIC_ENTRYPOINT!;
const ELECTION_MANAGER_ADDR = process.env.NEXT_PUBLIC_ELECTION_MANAGER!;
const BUNDLER_RPC_URL = process.env.NEXT_PUBLIC_BUNDLER_URL!;
const PAYMASTER_ADDR = process.env.NEXT_PUBLIC_PAYMASTER;

// This is the type we get from the SDK, which can contain promises for some fields.
// We derive it from the SimpleAccountAPI to ensure it's always correct.
type UserOperation = Parameters<SimpleAccountAPI['signUserOp']>[0];

async function sendUserOpToBundler(userOpWithPromises: UserOperation): Promise<string> {
    const bundler = new ethers.providers.JsonRpcProvider(BUNDLER_RPC_URL);
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
        [serializedUserOp, ENTRY_POINT_ADDRESS]
    );
    console.log(`[accountAbstraction] bundler returned hash: ${userOpHash}`);
    return userOpHash;
}

async function ensurePrefund(api: ProofWalletAPI, signer: ethers.Signer) {
    if (!PAYMASTER_ADDR) {
        const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, ENTRY_POINT_ABI, signer);
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

    const network = await provider.getNetwork();
    const bundlerProvider = new ethers.providers.JsonRpcProvider(BUNDLER_RPC_URL);
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
        entryPointAddress: ENTRY_POINT_ADDRESS,
        owner: signer,
        zkProof: eligibilityProof,
        pubSignals: eligibilityPubSignals,
    });

    await ensurePrefund(api, signer);

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

    if (PAYMASTER_ADDR) {
        const resolved = await ethers.utils.resolveProperties({
            sender: unsignedOp.sender,
            nonce: unsignedOp.nonce,
            initCode: unsignedOp.initCode,
            callData: unsignedOp.callData,
            callGasLimit: unsignedOp.callGasLimit,
            verificationGasLimit: unsignedOp.verificationGasLimit,
            preVerificationGas: unsignedOp.preVerificationGas,
            maxFeePerGas: unsignedOp.maxFeePerGas,
            maxPriorityFeePerGas: unsignedOp.maxPriorityFeePerGas,
        });
        const serialized = {
            sender: resolved.sender,
            nonce: ethers.utils.hexValue(resolved.nonce as BigNumberish),
            initCode: resolved.initCode,
            callData: resolved.callData,
            callGasLimit: ethers.utils.hexValue(resolved.callGasLimit as BigNumberish),
            verificationGasLimit: ethers.utils.hexValue(resolved.verificationGasLimit as BigNumberish),
            preVerificationGas: ethers.utils.hexValue(resolved.preVerificationGas as BigNumberish),
            maxFeePerGas: ethers.utils.hexValue(resolved.maxFeePerGas as BigNumberish),
            maxPriorityFeePerGas: ethers.utils.hexValue(resolved.maxPriorityFeePerGas as BigNumberish),
            target,
        };
        const resp = await fetch(apiUrl('/api/paymaster'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(serialized)
        });
        if (!resp.ok) {
            throw new Error('Paymaster signing failed');
        }
        const dataResp = await resp.json();
        unsignedOp.paymasterAndData = dataResp.paymasterAndData;
    }

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
