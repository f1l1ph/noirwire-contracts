use crate::errors::ZkPoolError;
use anchor_lang::prelude::*;

/// Main pool configuration
#[account]
pub struct PoolConfig {
    /// Administrator public key
    pub admin: Pubkey,

    /// Merkle tree depth (1-32)
    pub merkle_depth: u8,

    /// Number of recent roots to keep
    pub root_window: u16,

    /// Hash of the ABI specification (for versioning)
    pub abi_hash: [u8; 32],

    /// Verification key hashes for each circuit
    pub vk_hashes: VkHashes,

    /// Emergency pause flag (gates all submit_* operations)
    pub paused: bool,

    /// PDA bump
    pub bump: u8,
}

impl PoolConfig {
    pub const LEN: usize = 8 + // discriminator
        32 + // admin
        1 +  // merkle_depth
        2 +  // root_window
        32 + // abi_hash
        96 + // vk_hashes (3 * 32)
        1 +  // paused
        1; // bump
}

/// Verification key hashes for all circuits
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct VkHashes {
    pub shield: [u8; 32],
    pub transfer: [u8; 32],
    pub unshield: [u8; 32],
}

/// Verification key storage for a single circuit
#[account]
pub struct VerificationKeyAccount {
    /// Circuit identifier (0=shield, 1=transfer, 2=unshield)
    pub circuit: u8,

    /// Number of public inputs expected
    pub n_public: u32,

    /// Verification key data (serialized in Groth16 format)
    /// Format: alpha_g1 (64 bytes) + beta_g2 (128 bytes) +
    ///         gamma_g2 (128 bytes) + delta_g2 (128 bytes) +
    ///         IC points (n_public+1) * 64 bytes
    pub vk_data: Vec<u8>,

    /// Hash of verification key (for integrity checks)
    pub vk_hash: [u8; 32],

    /// PDA bump
    pub bump: u8,
}

impl VerificationKeyAccount {
    pub const BASE_LEN: usize = 8 + // discriminator
        1 +  // circuit
        4 +  // n_public
        4 +  // vk_data vec length
        32 + // vk_hash
        1; // bump

    pub fn space_for(n_public: u32) -> usize {
        Self::BASE_LEN + Self::vk_data_len(n_public)
    }

    /// Calculate expected VK data length for Groth16
    /// alpha_g1 (64) + beta_g2 (128) + gamma_g2 (128) + delta_g2 (128) + IC[(n_public+1) * 64]
    pub fn vk_data_len(n_public: u32) -> usize {
        448 + (n_public as usize + 1) * 64
    }

    /// Validate n_public matches expected count for circuit type
    pub fn validate_n_public(&self) -> Result<()> {
        use crate::constants::*;

        let expected = match self.circuit {
            CIRCUIT_SHIELD => SHIELD_PUBLIC_INPUTS,
            CIRCUIT_TRANSFER => TRANSFER_PUBLIC_INPUTS,
            CIRCUIT_UNSHIELD => UNSHIELD_PUBLIC_INPUTS,
            _ => return Err(ZkPoolError::InvalidCircuitType.into()),
        };

        require!(
            self.n_public as usize == expected,
            ZkPoolError::InvalidPublicInputCount
        );

        Ok(())
    }
}

/// Ring buffer of recent Merkle roots
#[account]
pub struct RootsAccount {
    /// Ring buffer of roots
    pub roots: Vec<[u8; 32]>,

    /// Current write cursor
    pub cursor: u16,

    /// Number of roots currently stored
    pub size: u16,

    /// Maximum capacity (from PoolConfig.root_window)
    pub capacity: u16,

    /// PDA bump
    pub bump: u8,
}

impl RootsAccount {
    pub const BASE_LEN: usize = 8 + // discriminator
        4 +  // roots vec length
        2 +  // cursor
        2 +  // size
        2 +  // capacity
        1; // bump

    pub fn space_for(capacity: u16) -> usize {
        Self::BASE_LEN + (capacity as usize * 32)
    }

    /// Check if a root exists in the ring buffer
    pub fn contains_root(&self, root: &[u8; 32]) -> bool {
        self.roots
            .iter()
            .take(self.size as usize)
            .any(|r| r == root)
    }

    /// Add a new root to the ring buffer
    pub fn add_root(&mut self, root: [u8; 32]) {
        let idx = self.cursor as usize;
        if idx < self.roots.len() {
            self.roots[idx] = root;
        }

        self.cursor = (self.cursor + 1) % self.capacity;
        if self.size < self.capacity {
            self.size += 1;
        }
    }
}

/// Nullifier storage (sharded for scalability)
#[account]
pub struct NullifiersAccount {
    /// Shard identifier
    pub shard: u16,

    /// Spent nullifiers in this shard
    pub nullifiers: Vec<[u8; 32]>,

    /// PDA bump
    pub bump: u8,
}

impl NullifiersAccount {
    pub const BASE_LEN: usize = 8 + // discriminator
        2 +  // shard
        4 +  // nullifiers vec length
        1; // bump

    pub fn space_for(capacity: usize) -> usize {
        Self::BASE_LEN + (capacity * 32)
    }

    /// Check if a nullifier is spent
    pub fn is_spent(&self, nullifier: &[u8; 32]) -> bool {
        self.nullifiers.iter().any(|n| n == nullifier)
    }

    /// Mark a nullifier as spent
    pub fn mark_spent(&mut self, nullifier: [u8; 32]) -> Result<()> {
        use crate::constants::MAX_NULLIFIERS_PER_SHARD;

        if self.is_spent(&nullifier) {
            return Err(ZkPoolError::NullifierSpent.into());
        }

        // Check capacity limit
        require!(
            self.nullifiers.len() < MAX_NULLIFIERS_PER_SHARD,
            ZkPoolError::NullifierCapacityExceeded
        );

        self.nullifiers.push(nullifier);

        // TODO: For production, migrate to bitmap/bloom filter for better scalability
        // Current linear storage is MVP-only and suitable for ~100k nullifiers

        Ok(())
    }
}

/// Helper to determine which shard a nullifier belongs to
pub fn get_nullifier_shard(_nullifier: &[u8; 32]) -> u16 {
    // Use first 2 bytes as shard identifier (supports 65k shards)
    // For MVP, always return shard 0
    0
}
