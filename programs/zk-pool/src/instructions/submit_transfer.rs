use crate::constants::*;
use crate::errors::ZkPoolError;
use crate::events::{NewCommitment, NullifierSpent};
use crate::state::*;
use crate::verifier::verify_proof;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SubmitTransfer<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, PoolConfig>,

    #[account(
        seeds = [VK_SEED, &[CIRCUIT_TRANSFER]],
        bump = vk_account.bump
    )]
    pub vk_account: Account<'info, VerificationKeyAccount>,

    #[account(
        seeds = [ROOTS_SEED],
        bump = roots.bump
    )]
    pub roots: Account<'info, RootsAccount>,

    #[account(
        mut,
        seeds = [NULLIFIERS_SEED, &[0u8, 0u8]], // Shard 0 for MVP
        bump
    )]
    pub nullifiers: Account<'info, NullifiersAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn submit_transfer(
    ctx: Context<SubmitTransfer>,
    proof: Vec<u8>,
    public_inputs: Vec<[u8; 32]>,
) -> Result<()> {
    // Check pool is not paused
    require!(!ctx.accounts.config.paused, ZkPoolError::PoolPaused);

    // Validate public input count (transfer expects 4: root, nullifier, new_commitment, fee)
    require!(
        public_inputs.len() == TRANSFER_PUBLIC_INPUTS,
        ZkPoolError::InvalidPublicInputCount
    );

    // Verify VK hash matches config
    require!(
        ctx.accounts.vk_account.vk_hash == ctx.accounts.config.vk_hashes.transfer,
        ZkPoolError::VkHashMismatch
    );

    // Verify VK is set (not zero hash)
    require!(
        ctx.accounts.config.vk_hashes.transfer != [0u8; 32],
        ZkPoolError::VkNotSet
    );

    // Extract public inputs per ABI.md ordering
    let root = public_inputs[0];
    let nullifier = public_inputs[1];
    let new_commitment = public_inputs[2];
    let _fee = public_inputs[3];

    // Check root is in recent roots (must exist before proof submission)
    require!(
        ctx.accounts.roots.contains_root(&root),
        ZkPoolError::RootNotFound
    );

    // Initialize nullifiers account if needed
    let nullifiers = &mut ctx.accounts.nullifiers;
    if nullifiers.nullifiers.is_empty() {
        let shard = get_nullifier_shard(&nullifier);
        nullifiers.shard = shard;
        nullifiers.nullifiers = Vec::new();
        nullifiers.bump = ctx.bumps.nullifiers;
    }

    // Check nullifier not spent
    require!(
        !nullifiers.is_spent(&nullifier),
        ZkPoolError::NullifierSpent
    );

    // Verify proof
    verify_proof(
        &ctx.accounts.vk_account,
        &proof,
        &public_inputs,
        &ctx.accounts.config.abi_hash,
    )?;

    // Mark nullifier as spent
    nullifiers.mark_spent(nullifier)?;

    let timestamp = Clock::get()?.unix_timestamp;

    emit!(NullifierSpent {
        nullifier,
        circuit: CIRCUIT_TRANSFER,
        timestamp,
    });

    emit!(NewCommitment {
        commitment: new_commitment,
        circuit: CIRCUIT_TRANSFER,
        timestamp,
    });

    Ok(())
}
