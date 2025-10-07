use crate::constants::*;
use crate::errors::ZkPoolError;
use crate::events::{NullifierSpent, Unshielded};
use crate::state::*;
use crate::verifier::verify_proof;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SubmitUnshield<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, PoolConfig>,

    #[account(
        seeds = [VK_SEED, &[CIRCUIT_UNSHIELD]],
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

    /// Treasury PDA (program-owned, holds pooled SOL/tokens)
    #[account(
        mut,
        seeds = [TREASURY_SEED],
        bump
    )]
    pub treasury: SystemAccount<'info>,

    /// Recipient's wallet (decoded from public inputs)
    /// CHECK: Derived from proof public inputs
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn submit_unshield(
    ctx: Context<SubmitUnshield>,
    proof: Vec<u8>,
    public_inputs: Vec<[u8; 32]>,
) -> Result<()> {
    // Check pool is not paused
    require!(!ctx.accounts.config.paused, ZkPoolError::PoolPaused);

    // Validate public input count (unshield expects 6: root, nullifier, recipient_lo, recipient_hi, amount, fee)
    require!(
        public_inputs.len() == UNSHIELD_PUBLIC_INPUTS,
        ZkPoolError::InvalidPublicInputCount
    );

    // Verify VK hash matches config
    require!(
        ctx.accounts.vk_account.vk_hash == ctx.accounts.config.vk_hashes.unshield,
        ZkPoolError::VkHashMismatch
    );

    // Verify VK is set (not zero hash)
    require!(
        ctx.accounts.config.vk_hashes.unshield != [0u8; 32],
        ZkPoolError::VkNotSet
    );

    // Extract public inputs per ABI.md ordering
    let root = public_inputs[0];
    let nullifier = public_inputs[1];
    let recipient_lo = public_inputs[2];
    let recipient_hi = public_inputs[3];
    let public_amount = public_inputs[4];
    let fee = public_inputs[5];

    // Reconstruct recipient address from two-limb encoding (LE within limbs)
    let recipient_pubkey = reconstruct_recipient(recipient_lo, recipient_hi)?;

    // Verify recipient matches the provided account
    require!(
        recipient_pubkey == ctx.accounts.recipient.key(),
        ZkPoolError::InvalidRecipient
    );

    // Validate recipient address round-trip (sanity check)
    validate_recipient_roundtrip(&recipient_pubkey, recipient_lo, recipient_hi)?;

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

    // Convert field elements to u64 amounts
    let amount = field_to_u64(&public_amount)?;
    let fee_amount = field_to_u64(&fee)?;

    // Validate amounts
    require!(fee_amount <= amount, ZkPoolError::FeeExceedsAmount);

    // Transfer funds to recipient (SOL for MVP)
    // In production, this would handle SPL tokens via treasury ATA
    let transfer_amount = amount
        .checked_sub(fee_amount)
        .ok_or(ZkPoolError::ArithmeticOverflow)?;

    if transfer_amount > 0 {
        // Safe CPI transfer using System Program (instead of manual lamport mutation)
        // Treasury is a PDA owned by this program, so we use invoke_signed
        let treasury_seeds = &[TREASURY_SEED, &[ctx.bumps.treasury]];
        let signer_seeds = &[&treasury_seeds[..]];

        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.treasury.to_account_info(),
                to: ctx.accounts.recipient.to_account_info(),
            },
            signer_seeds,
        );

        anchor_lang::system_program::transfer(cpi_context, transfer_amount)?;
    }

    let timestamp = Clock::get()?.unix_timestamp;

    emit!(NullifierSpent {
        nullifier,
        circuit: CIRCUIT_UNSHIELD,
        timestamp,
    });

    emit!(Unshielded {
        recipient: recipient_pubkey,
        amount,
        fee: fee_amount,
        nullifier,
        timestamp,
    });

    Ok(())
}

/// Reconstruct 32-byte Solana pubkey from two 128-bit limbs
fn reconstruct_recipient(lo: [u8; 32], hi: [u8; 32]) -> Result<Pubkey> {
    // Take lower 16 bytes from lo and upper 16 bytes from hi
    let mut addr_bytes = [0u8; 32];
    addr_bytes[..16].copy_from_slice(&lo[..16]);
    addr_bytes[16..].copy_from_slice(&hi[..16]);

    Ok(Pubkey::new_from_array(addr_bytes))
}

/// Validate recipient address round-trip (sanity check)
fn validate_recipient_roundtrip(pubkey: &Pubkey, lo: [u8; 32], hi: [u8; 32]) -> Result<()> {
    // Reconstruct address from limbs
    let reconstructed = reconstruct_recipient(lo, hi)?;

    // Verify round-trip matches
    require!(reconstructed == *pubkey, ZkPoolError::InvalidRecipient);

    // Verify upper bytes of limbs are zero (must be valid 16-byte limbs)
    for &b in &lo[16..] {
        require!(b == 0, ZkPoolError::InvalidEncoding);
    }
    for &b in &hi[16..] {
        require!(b == 0, ZkPoolError::InvalidEncoding);
    }

    Ok(())
}

/// Convert field element bytes to u64 (assuming little-endian encoding)
fn field_to_u64(field: &[u8; 32]) -> Result<u64> {
    // Take first 8 bytes as little-endian u64
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&field[..8]);
    let value = u64::from_le_bytes(bytes);

    // Verify remaining bytes are zero (amount must fit in u64)
    for &b in &field[8..] {
        require!(b == 0, ZkPoolError::AmountTooLarge);
    }

    Ok(value)
}
