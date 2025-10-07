/// Maximum Merkle tree depth supported
pub const MAX_MERKLE_DEPTH: u8 = 32;

/// Default Merkle tree depth
pub const DEFAULT_MERKLE_DEPTH: u8 = 20;

/// Default root window size (number of recent roots to keep)
pub const DEFAULT_ROOT_WINDOW: u16 = 64;

/// Maximum root window size
pub const MAX_ROOT_WINDOW: u16 = 256;

/// BN254 scalar field modulus
pub const BN254_SCALAR_FIELD: &str =
    "21888242871839275222246405745257275088548364400416034343698204186575808495617";

/// PDA seeds
pub const CONFIG_SEED: &[u8] = b"config";
pub const VK_SEED: &[u8] = b"vk";
pub const ROOTS_SEED: &[u8] = b"roots";
pub const NULLIFIERS_SEED: &[u8] = b"nullifiers";
pub const TREASURY_SEED: &[u8] = b"treasury";

/// Circuit type identifiers
// Circuit identifiers
pub const CIRCUIT_SHIELD: u8 = 0;
pub const CIRCUIT_TRANSFER: u8 = 1;
pub const CIRCUIT_UNSHIELD: u8 = 2;

/// Number of public inputs per circuit (from ABI.md)
pub const SHIELD_PUBLIC_INPUTS: usize = 1;
pub const TRANSFER_PUBLIC_INPUTS: usize = 4;
pub const UNSHIELD_PUBLIC_INPUTS: usize = 6;

/// Maximum verification key size in bytes (conservative estimate)
pub const MAX_VK_SIZE: usize = 8192;

/// Domain separator for ABI hash computation
pub const ABI_VERSION: u8 = 2;

/// Nullifier shard size (start with single shard for MVP)
pub const NULLIFIER_SHARD_SIZE: usize = 10000;

/// Maximum nullifier capacity before requiring new shard (safety limit)
pub const MAX_NULLIFIERS_PER_SHARD: usize = 100000;

/// Poseidon domain separation tags (circuit-side constants)
/// These should match the circuit implementation
pub const POSEIDON_COMMIT_TAG: &str = "NoirWire-Commitment-v1";
pub const POSEIDON_NULLIFIER_TAG: &str = "NoirWire-Nullifier-v1";

/// Encoding specification
/// All field elements use LITTLE-ENDIAN byte order
/// G1 points: (x, y) each 32 bytes LE
/// G2 points: ((x0, x1), (y0, y1)) each 32 bytes LE
/// Recipient address: split into (lo, hi) each 16 bytes, LE within limbs
pub const ENCODING_ENDIANNESS: &str = "LITTLE_ENDIAN";
