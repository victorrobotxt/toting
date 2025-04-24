import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ElectionMirror } from "../target/types/election_mirror";

describe("election-mirror", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.ElectionMirror as Program<ElectionMirror>;
    const wallet = provider.wallet as anchor.Wallet;

    it("bridges a tally", async () => {
        const meta = Buffer.alloc(32, 1);
        const [election] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("election"), meta],
            program.programId
        );
        await program.methods.initialise([...meta] as any)
            .accounts({ election, authority: wallet.publicKey })
            .rpc();

        await program.methods.setTally(new anchor.BN(42), new anchor.BN(58))
            .accounts({ election, authority: wallet.publicKey })
            .rpc();

        const acc = await program.account.election.fetch(election);
        expect(acc.votesA.toNumber()).toBe(42);
        expect(acc.finalised).toBe(true);
    });
});
