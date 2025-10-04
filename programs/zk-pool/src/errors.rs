use anchor_lang::prelude::*;

#[error_code]
pub enum ZkPoolError {
    #[msg("Invalid Merkle depth: must be between 1 and MAX_MERKLE_DEPTH")]
    InvalidMerkleDepth,

    #[msg("Invalid root window size: must be between 1 and MAX_ROOT_WINDOW")]
    InvalidRootWindow,

    #[msg("Invalid circuit type: must be 0 (shield), 1 (transfer), or 2 (unshield)")]
    InvalidCircuitType,

    #[msg("Verification key hash mismatch")]
    VkHashMismatch,

    #[msg("ABI hash mismatch")]
    AbiHashMismatch,

    #[msg("Invalid number of public inputs")]
    InvalidPublicInputCount,

    #[msg("Proof verification failed")]
    ProofVerificationFailed,

    #[msg("Merkle root not found in recent roots")]
    RootNotFound,

    #[msg("Nullifier already spent")]
    NullifierSpent,

    #[msg("Invalid recipient address encoding")]
    InvalidRecipient,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Unauthorized: admin only")]
    Unauthorized,

    #[msg("Verification key not set for this circuit")]
    VkNotSet,

    #[msg("Invalid verification key data")]
    InvalidVkData,

    #[msg("Invalid proof data")]
    InvalidProofData,

    #[msg("Field element out of range")]
    FieldOutOfRange,

    #[msg("Amount exceeds maximum allowed (2^64)")]
    AmountTooLarge,

    #[msg("Fee exceeds amount")]
    FeeExceedsAmount,

    #[msg("Insufficient balance in treasury")]
    InsufficientBalance,

    #[msg("Invalid nullifier shard")]
    InvalidNullifierShard,

    #[msg("Pool is paused by admin")]
    PoolPaused,

    #[msg("Nullifier storage capacity exceeded")]
    NullifierCapacityExceeded,

    #[msg("Invalid encoding: field element or coordinate out of BN254 range")]
    InvalidEncoding,
}
