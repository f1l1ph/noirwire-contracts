use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod verifier;

use instructions::*;

declare_id!("Hza5rjYmJnoYsjsgsuxLkyxLoWVo6RCUZxCB3x17v8qz");

#[program]
pub mod zk_pool {
    use super::*;

    /// Initialize the privacy pool with configuration
    pub fn initialize(
        ctx: Context<Initialize>,
        merkle_depth: u8,
        root_window: u16,
        abi_hash: [u8; 32],
    ) -> Result<()> {
        instructions::initialize(ctx, merkle_depth, root_window, abi_hash)
    }

    /// Set or update verification key for a circuit (admin only)
    pub fn set_verification_key(
        ctx: Context<SetVerificationKey>,
        circuit: u8,
        vk_data: Vec<u8>,
        vk_hash: [u8; 32],
    ) -> Result<()> {
        instructions::set_verification_key(ctx, circuit, vk_data, vk_hash)
    }

    /// Add a new Merkle root to the ring buffer (admin or authorized relayer)
    pub fn add_root(ctx: Context<AddRoot>, root: [u8; 32]) -> Result<()> {
        instructions::add_root(ctx, root)
    }

    /// Set pause state (admin only)
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        instructions::set_paused(ctx, paused)
    }

    /// Submit a shield proof (deposit into shielded pool)
    pub fn submit_shield(
        ctx: Context<SubmitShield>,
        proof: Vec<u8>,
        public_inputs: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::submit_shield(ctx, proof, public_inputs)
    }

    /// Submit a transfer proof (private transfer within pool)
    pub fn submit_transfer(
        ctx: Context<SubmitTransfer>,
        proof: Vec<u8>,
        public_inputs: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::submit_transfer(ctx, proof, public_inputs)
    }

    /// Submit an unshield proof (withdrawal from pool)
    pub fn submit_unshield(
        ctx: Context<SubmitUnshield>,
        proof: Vec<u8>,
        public_inputs: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::submit_unshield(ctx, proof, public_inputs)
    }
}
