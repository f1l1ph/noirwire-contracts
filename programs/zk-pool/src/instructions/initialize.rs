use crate::constants::*;
use crate::errors::ZkPoolError;
use crate::events::Initialized;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(merkle_depth: u8, root_window: u16)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = PoolConfig::LEN,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, PoolConfig>,

    #[account(
        init,
        payer = admin,
        space = RootsAccount::space_for(root_window),
        seeds = [ROOTS_SEED],
        bump
    )]
    pub roots: Account<'info, RootsAccount>,

    #[account(
        init,
        payer = admin,
        space = NullifiersAccount::space_for(NULLIFIER_SHARD_SIZE),
        seeds = [NULLIFIERS_SEED, &[0u8, 0u8]], // Shard 0 for MVP
        bump
    )]
    pub nullifiers: Account<'info, NullifiersAccount>,

    #[account(
        init,
        payer = admin,
        space = VerificationKeyAccount::space_for(SHIELD_PUBLIC_INPUTS as u32),
        seeds = [VK_SEED, &[CIRCUIT_SHIELD]],
        bump
    )]
    pub vk_shield: Account<'info, VerificationKeyAccount>,

    #[account(
        init,
        payer = admin,
        space = VerificationKeyAccount::space_for(TRANSFER_PUBLIC_INPUTS as u32),
        seeds = [VK_SEED, &[CIRCUIT_TRANSFER]],
        bump
    )]
    pub vk_transfer: Account<'info, VerificationKeyAccount>,

    #[account(
        init,
        payer = admin,
        space = VerificationKeyAccount::space_for(UNSHIELD_PUBLIC_INPUTS as u32),
        seeds = [VK_SEED, &[CIRCUIT_UNSHIELD]],
        bump
    )]
    pub vk_unshield: Account<'info, VerificationKeyAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize(
    ctx: Context<Initialize>,
    merkle_depth: u8,
    root_window: u16,
    abi_hash: [u8; 32],
) -> Result<()> {
    // Validate parameters
    require!(
        merkle_depth > 0 && merkle_depth <= MAX_MERKLE_DEPTH,
        ZkPoolError::InvalidMerkleDepth
    );
    require!(
        root_window > 0 && root_window <= MAX_ROOT_WINDOW,
        ZkPoolError::InvalidRootWindow
    );

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.merkle_depth = merkle_depth;
    config.root_window = root_window;
    config.abi_hash = abi_hash;
    config.vk_hashes = VkHashes::default();
    config.paused = false; // Start unpaused
    config.bump = ctx.bumps.config;

    // Initialize roots account
    let roots = &mut ctx.accounts.roots;
    roots.capacity = root_window;
    roots.roots = vec![[0u8; 32]; root_window as usize];
    roots.cursor = 0;
    roots.size = 0;
    roots.bump = ctx.bumps.roots;

    // Initialize nullifiers account (shard 0)
    let nullifiers = &mut ctx.accounts.nullifiers;
    nullifiers.shard = 0;
    nullifiers.nullifiers = Vec::new();
    nullifiers.bump = ctx.bumps.nullifiers;

    // Initialize VK accounts (empty, to be filled by set_verification_key)
    let vk_shield = &mut ctx.accounts.vk_shield;
    vk_shield.circuit = CIRCUIT_SHIELD;
    vk_shield.n_public = SHIELD_PUBLIC_INPUTS as u32;
    vk_shield.vk_data = Vec::new();
    vk_shield.vk_hash = [0u8; 32];
    vk_shield.bump = ctx.bumps.vk_shield;

    let vk_transfer = &mut ctx.accounts.vk_transfer;
    vk_transfer.circuit = CIRCUIT_TRANSFER;
    vk_transfer.n_public = TRANSFER_PUBLIC_INPUTS as u32;
    vk_transfer.vk_data = Vec::new();
    vk_transfer.vk_hash = [0u8; 32];
    vk_transfer.bump = ctx.bumps.vk_transfer;

    let vk_unshield = &mut ctx.accounts.vk_unshield;
    vk_unshield.circuit = CIRCUIT_UNSHIELD;
    vk_unshield.n_public = UNSHIELD_PUBLIC_INPUTS as u32;
    vk_unshield.vk_data = Vec::new();
    vk_unshield.vk_hash = [0u8; 32];
    vk_unshield.bump = ctx.bumps.vk_unshield;

    emit!(Initialized {
        admin: config.admin,
        merkle_depth,
        root_window,
        abi_hash,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
