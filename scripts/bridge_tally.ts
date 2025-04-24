// ts-node scripts/bridge_tally.ts <EVM_RPC> <EVENT_TX_HASH>
import { ethers } from "ethers";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { Program, AnchorProvider, setProvider } from "@coral-xyz/anchor";
import idl from "../solana-programs/election/target/idl/election_mirror.json" assert { type: "json" };

const [, evmRpc, evmTx] = process.argv;
async function main() {
    // 1. fetch Ethereum event
    const provider = new ethers.JsonRpcProvider(evmRpc);
    const receipt = await provider.getTransactionReceipt(evmTx);
    const iface = new ethers.Interface(["event Tally(uint256,uint256)"]);
    const [log] = receipt.logs.filter(l => iface.parseLog(l));
    const { args: [A, B] } = iface.parseLog(log);

    // 2. push to Solana
    const conn = new Connection("http://localhost:8899", "confirmed");
    const wallet = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(process.env.SOLANA_BRIDGE_SK!))
    );
    const providerSol = new AnchorProvider(conn, { publicKey: wallet.publicKey, signAllTransactions: txs => txs.map(tx => { tx.partialSign(wallet); return tx; }) } as any, {});
    setProvider(providerSol);
    const program = new Program(idl as any, new PublicKey(idl.metadata.address));
    const election = (await PublicKey.findProgramAddressSync(
        [Buffer.from("election"), receipt.blockHash.slice(0, 32)],
        program.programId
    ))[0];

    const tx = await program.methods
        .setTally(BigInt(A), BigInt(B))
        .accounts({ election, authority: wallet.publicKey })
        .rpc();
    console.log("✅ tally bridged; solana tx =", tx);
}
main();
