// packages/frontend/src/lib/accountAbstraction.ts
import { SimpleAccountAPI } from "@account-abstraction/sdk";
import { ethers } from "ethers";
import ElectionManagerV2 from "../contracts/ElectionManagerV2.json";

const ENTRY_POINT_ADDRESS = process.env.NEXT_PUBLIC_ENTRYPOINT!;
const WALLET_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_WALLET_FACTORY!;
const ELECTION_MANAGER_ADDR = process.env.NEXT_PUBLIC_ELECTION_MANAGER!;
const BUNDLER_RPC_URL = process.env.NEXT_PUBLIC_BUNDLER_URL!;

async function getAccountAPI(signer: ethers.Signer) {
    const provider = signer.provider ?? new ethers.providers.Web3Provider((window as any).ethereum);
    return new SimpleAccountAPI({
        provider: provider as ethers.providers.Web3Provider,
        entryPointAddress: ENTRY_POINT_ADDRESS,
        owner: signer,
        factoryAddress: WALLET_FACTORY_ADDRESS,
    });
}

async function sendUserOpToBundler(userOp: any): Promise<string> {
    const bundler = new ethers.providers.JsonRpcProvider(BUNDLER_RPC_URL);
    const userOpHash: string = await bundler.send(
        "eth_sendUserOperation",
        [userOp, ENTRY_POINT_ADDRESS]
    );
    return userOpHash;
}

export async function bundleCreateWallet(
    signer: ethers.Signer,
    proof: { a: [string, string]; b: [[string, string], [string, string]]; c: [string, string] },
    pubSignals: string[],
    owner: string
): Promise<string> {
    const api = await getAccountAPI(signer);

    const factoryIface = new ethers.utils.Interface([
        "function mintWallet(uint256[2],uint256[2][2],uint256[2],uint256[],address) returns (address)"
    ]);
    const initData = factoryIface.encodeFunctionData("mintWallet", [
        proof.a, proof.b, proof.c, pubSignals, owner
    ]);

    const unsignedOp = await api.createSignedUserOp({
        target: WALLET_FACTORY_ADDRESS,
        data: initData,
    });
    const signedOp = await api.signUserOp(unsignedOp);

    return sendUserOpToBundler(signedOp);
}

export async function bundleSubmitVote(
    signer: ethers.Signer,
    electionId: number,
    voteOption: number,
    nonce: number,
    vcProof: Uint8Array | string
): Promise<string> {
    const proofBytes =
        typeof vcProof === "string" && !ethers.utils.isHexString(vcProof)
            ? ethers.utils.toUtf8Bytes(vcProof)
            : vcProof;

    if (
        !ENTRY_POINT_ADDRESS || ENTRY_POINT_ADDRESS === "0x" + "0".repeat(40) ||
        !BUNDLER_RPC_URL
    ) {
        // --- DIRECT TRANSACTION PATH (for local dev) ---
        const manager = new ethers.Contract(
            ELECTION_MANAGER_ADDR,
            ElectionManagerV2.abi,
            signer
        );

        console.log("Submitting vote via direct transaction (legacy gas)...");
        
        // FIX: Explicitly set a legacy gasPrice to avoid EIP-1559 estimation issues on local testnets.
        // This is a much more reliable method for development environments like Anvil.
        try {
            const tx = await manager.enqueueMessage(
                electionId,
                voteOption,
                nonce,
                proofBytes,
                {
                    gasLimit: 500_000,
                    // Use a hardcoded or fetched legacy gas price.
                    gasPrice: await signer.provider!.getGasPrice(),
                }
            );
            
            console.log("Transaction sent to wallet:", tx.hash);
            const receipt = await tx.wait();
            console.log("Transaction confirmed in block:", receipt.blockNumber);
            return tx.hash;

        } catch (error) {
            console.error("Error sending direct transaction:", error);
            // Re-throw the error so the UI toast can display it.
            throw error;
        }
    }

    // --- ACCOUNT ABSTRACTION PATH ---
    console.log("Submitting vote via Account Abstraction UserOp...");
    const api = await getAccountAPI(signer);
    const managerIface = new ethers.utils.Interface(ElectionManagerV2.abi);
    const data = managerIface.encodeFunctionData("enqueueMessage", [
        electionId,
        voteOption,
        nonce,
        proofBytes,
    ]);
    const unsignedOp = await api.createSignedUserOp({
        target: ELECTION_MANAGER_ADDR,
        data,
    });
    const signedOp = await api.signUserOp(unsignedOp);
    return sendUserOpToBundler(signedOp);
}
