import { SimpleAccountAPI } from "@account-abstraction/sdk";
import { ethers } from "ethers";

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
    // Use a pure JsonRpcProvider pointed at your bundler
    const bundler = new ethers.providers.JsonRpcProvider(BUNDLER_RPC_URL);
    // eth_sendUserOperation takes [UserOperation, EntryPointAddress] and returns the hash
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

    // 1) build & sign the UserOp
    const unsignedOp = await api.createSignedUserOp({
        target: WALLET_FACTORY_ADDRESS,
        data: initData,
    });
    const signedOp = await api.signUserOp(unsignedOp);

    // 2) send it to your bundler via eth_sendUserOperation
    return sendUserOpToBundler(signedOp);
}

export async function bundleSubmitVote(
    signer: ethers.Signer,
    voteOption: number,
    nonce: number,
    vcProof: Uint8Array | string
): Promise<string> {
    const api = await getAccountAPI(signer);

    const managerIface = new ethers.utils.Interface([
        "function enqueueMessage(uint256,uint256,bytes)"
    ]);

    // The backend returns dummy proofs as strings like
    // "proof-<hash>" which are not valid hex bytes. Convert any
    // non-hex string proof to bytes so ethers can encode it.
    const proofBytes =
        typeof vcProof === "string" && !ethers.utils.isHexString(vcProof)
            ? ethers.utils.toUtf8Bytes(vcProof)
            : vcProof;

    const data = managerIface.encodeFunctionData("enqueueMessage", [
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
