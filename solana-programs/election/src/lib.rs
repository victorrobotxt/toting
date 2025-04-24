use anchor_lang::prelude::*;

declare_id!("AdemcJyFzDyiCTyuCQuhkWQHQdQUkaqj15nwAPgsARmj");

#[program]
pub mod election_mirror {
    use super::*;

    /// Initialise a mirror election. `metadata` is the same blake2b-hash you
    /// emit from `ElectionManager.createElection` on the EVM side.
    pub fn initialise(ctx: Context<Initialise>, metadata: [u8; 32]) -> Result<()> {
        let e = &mut ctx.accounts.election;
        e.authority = *ctx.accounts.authority.key;
        e.metadata  = metadata;
        Ok(())
    }

    /// One-shot setter called **once** after the Groth16 proof is accepted on
    /// Ethereum. Only the authority (bridge relayer) can call it.
    pub fn set_tally(ctx: Context<SetTally>, votes_a: u64, votes_b: u64) -> Result<()> {
        let e = &mut ctx.accounts.election;
        require!(ctx.accounts.authority.key == &e.authority, ErrorCode::Unauthorised);
        require!(!e.finalised,                                ErrorCode::AlreadyDone);
        e.votes_a   = votes_a;
        e.votes_b   = votes_b;
        e.finalised = true;
        Ok(())
    }
}

#[account]
pub struct Election {
    pub authority: Pubkey,   // bridge signer
    pub metadata:  [u8; 32], // same as EVM meta hash
    pub votes_a:   u64,
    pub votes_b:   u64,
    pub finalised: bool,
}

#[derive(Accounts)]
pub struct Initialise<'info> {
    #[account(init, payer = authority, space = 8 + 32 + 32 + 8 + 8 + 1)]
    pub election: Account<'info, Election>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetTally<'info> {
    #[account(mut)]
    pub election: Account<'info, Election>,
    pub authority: Signer<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("caller is not authorised bridge signer")]
    Unauthorised,
    #[msg("tally already written")]
    AlreadyDone,
}
