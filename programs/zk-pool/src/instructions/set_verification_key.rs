use crate::constants::*;
use crate::errors::ZkPoolError;
use crate::events::VerificationKeySet;
use crate::state::*;
use anchor_lang::prelude::*;
use sha2::{Digest, Sha256};

#[derive(Accounts)]
#[instruction(circuit: u8)]
pub struct SetVerificationKey<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ ZkPoolError::Unauthorized
    )]
    pub config: Account<'info, PoolConfig>,

    /// VK account must be pre-created with proper space via init instruction
    #[account(
        mut,
        seeds = [VK_SEED, &[circuit]],
        bump
    )]
    pub vk_account: Account<'info, VerificationKeyAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn set_verification_key(
    ctx: Context<SetVerificationKey>,
    circuit: u8,
    vk_data: Vec<u8>,
    vk_hash: [u8; 32],
) -> Result<()> {
    // Validate circuit type
    require!(circuit <= CIRCUIT_UNSHIELD, ZkPoolError::InvalidCircuitType);

    // Determine expected public input count
    let n_public = match circuit {
        CIRCUIT_SHIELD => SHIELD_PUBLIC_INPUTS as u32,
        CIRCUIT_TRANSFER => TRANSFER_PUBLIC_INPUTS as u32,
        CIRCUIT_UNSHIELD => UNSHIELD_PUBLIC_INPUTS as u32,
        _ => return Err(ZkPoolError::InvalidCircuitType.into()),
    };

    // Validate VK data length
    let expected_len = VerificationKeyAccount::vk_data_len(n_public);
    require!(vk_data.len() == expected_len, ZkPoolError::InvalidVkData);

    // Verify hash
    let computed_hash = Sha256::digest(&vk_data);
    require!(
        computed_hash.as_slice() == vk_hash,
        ZkPoolError::VkHashMismatch
    );

    // Store VK
    let vk_account = &mut ctx.accounts.vk_account;
    vk_account.circuit = circuit;
    vk_account.n_public = n_public;
    vk_account.vk_data = vk_data;
    vk_account.vk_hash = vk_hash;
    vk_account.bump = ctx.bumps.vk_account;

    // Validate n_public matches circuit expectations
    vk_account.validate_n_public()?;

    // Update config
    let config = &mut ctx.accounts.config;
    match circuit {
        CIRCUIT_SHIELD => config.vk_hashes.shield = vk_hash,
        CIRCUIT_TRANSFER => config.vk_hashes.transfer = vk_hash,
        CIRCUIT_UNSHIELD => config.vk_hashes.unshield = vk_hash,
        _ => unreachable!(),
    }

    emit!(VerificationKeySet {
        circuit,
        vk_hash,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
