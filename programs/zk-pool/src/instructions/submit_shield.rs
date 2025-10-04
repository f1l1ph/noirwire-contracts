use crate::constants::*;
use crate::errors::ZkPoolError;
use crate::events::NewCommitment;
use crate::state::*;
use crate::verifier::verify_proof;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SubmitShield<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, PoolConfig>,

    #[account(
        seeds = [VK_SEED, &[CIRCUIT_SHIELD]],
        bump = vk_account.bump
    )]
    pub vk_account: Account<'info, VerificationKeyAccount>,

    pub user: Signer<'info>,
}

pub fn submit_shield(
    ctx: Context<SubmitShield>,
    proof: Vec<u8>,
    public_inputs: Vec<[u8; 32]>,
) -> Result<()> {
    // Check pool is not paused
    require!(!ctx.accounts.config.paused, ZkPoolError::PoolPaused);

    // Validate public input count (shield expects 1: commitment)
    require!(
        public_inputs.len() == SHIELD_PUBLIC_INPUTS,
        ZkPoolError::InvalidPublicInputCount
    );

    // Verify VK hash matches config
    require!(
        ctx.accounts.vk_account.vk_hash == ctx.accounts.config.vk_hashes.shield,
        ZkPoolError::VkHashMismatch
    );

    // Verify VK is set (not zero hash)
    require!(
        ctx.accounts.config.vk_hashes.shield != [0u8; 32],
        ZkPoolError::VkNotSet
    );

    // Verify proof
    verify_proof(
        &ctx.accounts.vk_account,
        &proof,
        &public_inputs,
        &ctx.accounts.config.abi_hash,
    )?;

    // Extract commitment (index 0)
    let commitment = public_inputs[0];

    emit!(NewCommitment {
        commitment,
        circuit: CIRCUIT_SHIELD,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
