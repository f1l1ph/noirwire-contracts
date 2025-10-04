use anchor_lang::prelude::*;

/// Emitted when the pool is initialized
#[event]
pub struct Initialized {
    pub admin: Pubkey,
    pub merkle_depth: u8,
    pub root_window: u16,
    pub abi_hash: [u8; 32],
    pub timestamp: i64,
}

/// Emitted when a verification key is set or updated
#[event]
pub struct VerificationKeySet {
    pub circuit: u8,
    pub vk_hash: [u8; 32],
    pub timestamp: i64,
}

/// Emitted when a new Merkle root is added
#[event]
pub struct RootAdded {
    pub root: [u8; 32],
    pub index: u16,
    pub timestamp: i64,
}

/// Emitted when a new commitment is created
#[event]
pub struct NewCommitment {
    pub commitment: [u8; 32],
    pub circuit: u8, // 0=shield, 1=transfer, 2=unshield (for indexing)
    pub timestamp: i64,
}

/// Emitted when a nullifier is spent
#[event]
pub struct NullifierSpent {
    pub nullifier: [u8; 32],
    pub circuit: u8, // 1=transfer, 2=unshield
    pub timestamp: i64,
}

/// Emitted when funds are unshielded to a public recipient
#[event]
pub struct Unshielded {
    pub recipient: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub nullifier: [u8; 32],
    pub timestamp: i64,
}

/// Emitted when pool pause state changes
#[event]
pub struct PoolPausedChanged {
    pub paused: bool,
    pub admin: Pubkey,
    pub timestamp: i64,
}
