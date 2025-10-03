# Solana Verification Key Exports

Auto-generated verification keys for on-chain Groth16 verification.

## Files

- `*_vk.json`: Full verification key in JSON format
- `*_vk.rs`: Rust constants for Solana programs
- `*_vk.ts`: TypeScript definitions for off-chain code
- `all_vks.json`: Combined export of all circuits

## Circuits

- **shield**: 1 public inputs
- **transfer**: 4 public inputs
- **unshield**: 6 public inputs

## Usage in Solana Program

```rust
// Import the constants
mod shield_vk;
use shield_vk::*;

// Use in verifier
let alpha_g1 = parse_g1(SHIELD_ALPHA_G1_X, SHIELD_ALPHA_G1_Y)?;
// ... construct full verification key
```

## Public Input Ordering

**CRITICAL**: The order of public inputs must match the ABI specification.
See `../ABI.md` for the exact ordering for each circuit.

## Curve: BN254 (bn128)

All points are on the BN254 curve, also known as bn128 or alt_bn128.
This is the standard curve used by Ethereum and supported by various Solana ZK verifier programs.

Field prime: 21888242871839275222246405745257275088548364400416034343698204186575808495617

## Generated

2025-10-03T17:33:58.675Z
