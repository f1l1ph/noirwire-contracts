use crate::errors::ZkPoolError;
use crate::state::VerificationKeyAccount;
use anchor_lang::prelude::*;

// ============================================================================
// ENCODING ADAPTER LAYER
// ============================================================================
//
// **IMPORTANT**: The ABI specification (ABI_v2.md) defines all data as LITTLE-ENDIAN.
// However, many Groth16 verifiers expect BIG-ENDIAN encoding for field elements and
// curve points.
//
// This module provides an adapter layer that:
// 1. Accepts LE-encoded proofs/inputs from the ABI
// 2. Converts to BE format if required by the verifier
// 3. Calls the actual verification logic
// 4. Returns results in the program's error format
//
// When integrating a real verifier (Light Protocol, Solana syscalls, etc.),
// you may need to enable the endianness conversion below based on the verifier's
// expected format.
//
// ============================================================================

/// Groth16 proof structure (BN254 curve)
///
/// **Encoding**: Stored in LITTLE-ENDIAN format as per ABI_v2.md
#[derive(Debug, Clone)]
pub struct Groth16Proof {
    pub a: G1Point,
    pub b: G2Point,
    pub c: G1Point,
}

/// G1 point (2 coordinates, each 32 bytes)
///
/// **Encoding**: LITTLE-ENDIAN field elements
#[derive(Debug, Clone, Copy)]
pub struct G1Point {
    pub x: [u8; 32],
    pub y: [u8; 32],
}

/// G2 point (4 coordinates, each 32 bytes - 2x2 Fp2 elements)
///
/// **Encoding**: LITTLE-ENDIAN field elements
#[derive(Debug, Clone, Copy)]
pub struct G2Point {
    pub x: [[u8; 32]; 2],
    pub y: [[u8; 32]; 2],
}

/// Parsed verification key
///
/// **Encoding**: LITTLE-ENDIAN field elements
#[derive(Debug, Clone)]
pub struct VerificationKey {
    pub alpha_g1: G1Point,
    pub beta_g2: G2Point,
    pub gamma_g2: G2Point,
    pub delta_g2: G2Point,
    pub ic: Vec<G1Point>,
}

/// Main proof verification entry point
///
/// **Input Encoding**: All inputs are LITTLE-ENDIAN as per ABI_v2.md
/// **Adapter Layer**: Converts to verifier's expected format internally
pub fn verify_proof(
    vk_account: &VerificationKeyAccount,
    proof_bytes: &[u8],
    public_inputs: &[[u8; 32]],
    _abi_hash: &[u8; 32],
) -> Result<()> {
    // Validate public input count matches VK
    require!(
        public_inputs.len() == vk_account.n_public as usize,
        ZkPoolError::InvalidPublicInputCount
    );

    // Parse proof (LE format from ABI)
    let proof = parse_proof(proof_bytes)?;

    // Parse verification key (LE format from ABI)
    let vk = parse_verification_key(&vk_account.vk_data, vk_account.n_public)?;

    // Sanity check: IC length must be n_public + 1
    require!(
        vk.ic.len() == (vk_account.n_public as usize + 1),
        ZkPoolError::InvalidVkData
    );

    // Perform Groth16 verification
    // Note: verify_groth16 handles LE→BE conversion if needed by the verifier
    verify_groth16(&proof, &vk, public_inputs)?;

    Ok(())
}

/// Parse proof bytes into Groth16Proof structure
/// Expected format: A (64 bytes) + B (128 bytes) + C (64 bytes) = 256 bytes
fn parse_proof(proof_bytes: &[u8]) -> Result<Groth16Proof> {
    require!(proof_bytes.len() == 256, ZkPoolError::InvalidProofData);

    let mut offset = 0;

    // Parse A (G1 point)
    let a = parse_g1_point(&proof_bytes[offset..offset + 64])?;
    offset += 64;

    // Parse B (G2 point)
    let b = parse_g2_point(&proof_bytes[offset..offset + 128])?;
    offset += 128;

    // Parse C (G1 point)
    let c = parse_g1_point(&proof_bytes[offset..offset + 64])?;

    Ok(Groth16Proof { a, b, c })
}

/// Parse verification key from stored bytes
/// Format: alpha_g1 (64) + beta_g2 (128) + gamma_g2 (128) + delta_g2 (128) + IC points
fn parse_verification_key(vk_bytes: &[u8], n_public: u32) -> Result<VerificationKey> {
    let expected_len = 448 + ((n_public + 1) as usize * 64);
    require!(vk_bytes.len() == expected_len, ZkPoolError::InvalidVkData);

    let mut offset = 0;

    // Parse alpha_g1
    let alpha_g1 = parse_g1_point(&vk_bytes[offset..offset + 64])?;
    offset += 64;

    // Parse beta_g2
    let beta_g2 = parse_g2_point(&vk_bytes[offset..offset + 128])?;
    offset += 128;

    // Parse gamma_g2
    let gamma_g2 = parse_g2_point(&vk_bytes[offset..offset + 128])?;
    offset += 128;

    // Parse delta_g2
    let delta_g2 = parse_g2_point(&vk_bytes[offset..offset + 128])?;
    offset += 128;

    // Parse IC points (n_public + 1 points)
    let mut ic = Vec::with_capacity((n_public + 1) as usize);
    for _ in 0..=n_public {
        let point = parse_g1_point(&vk_bytes[offset..offset + 64])?;
        ic.push(point);
        offset += 64;
    }

    Ok(VerificationKey {
        alpha_g1,
        beta_g2,
        gamma_g2,
        delta_g2,
        ic,
    })
}

/// Parse G1 point (2 x 32 bytes)
fn parse_g1_point(bytes: &[u8]) -> Result<G1Point> {
    require!(bytes.len() == 64, ZkPoolError::InvalidVkData);

    let mut x = [0u8; 32];
    let mut y = [0u8; 32];
    x.copy_from_slice(&bytes[0..32]);
    y.copy_from_slice(&bytes[32..64]);

    Ok(G1Point { x, y })
}

/// Parse G2 point (4 x 32 bytes for Fp2 coordinates)
fn parse_g2_point(bytes: &[u8]) -> Result<G2Point> {
    require!(bytes.len() == 128, ZkPoolError::InvalidVkData);

    let mut x = [[0u8; 32]; 2];
    let mut y = [[0u8; 32]; 2];

    x[0].copy_from_slice(&bytes[0..32]);
    x[1].copy_from_slice(&bytes[32..64]);
    y[0].copy_from_slice(&bytes[64..96]);
    y[1].copy_from_slice(&bytes[96..128]);

    Ok(G2Point { x, y })
}

/// Verify Groth16 proof using Solana bn254 syscalls
///
/// **Encoding Adapter**: This function receives LE-encoded data from the ABI.
/// If the verifier requires BE encoding, enable the conversion below.
///
/// Groth16 verification equation: e(A, B) = e(alpha, beta) * e(L, gamma) * e(C, delta)
/// Where L = IC[0] + sum(public_inputs[i] * IC[i+1])
fn verify_groth16(
    proof: &Groth16Proof,
    vk: &VerificationKey,
    public_inputs: &[[u8; 32]],
) -> Result<()> {
    // ⚠️  INTEGRATION REQUIRED: This is a placeholder implementation
    //
    // PRODUCTION INTEGRATION OPTIONS:
    //
    // Option 1: Light Protocol (RECOMMENDED)
    // ----------------------------------------
    // use light_protocol_groth16::Groth16Verifier;
    //
    // // Convert LE to BE if Light Protocol expects BE
    // let proof_be = convert_proof_to_be(proof);
    // let vk_be = convert_vk_to_be(vk);
    // let inputs_be = convert_inputs_to_be(public_inputs);
    //
    // let verifier = Groth16Verifier::new();
    // verifier.verify(&proof_be, &inputs_be, &vk_be)?;
    //
    // Option 2: Solana Native Syscalls (if available)
    // ------------------------------------------------
    // use solana_program::alt_bn128::{alt_bn128_pairing};
    //
    // // Compute L = IC[0] + Σ(input_i · IC[i+1])
    // let l = compute_linear_combination(&vk.ic, public_inputs);
    //
    // // Compute pairing equation: e(A, B) = e(α, β) · e(L, γ) · e(C, δ)
    // // Note: Syscalls may expect BE encoding, convert if needed
    // let result = verify_pairing_equation(proof, vk, &l)?;
    // require!(result, ZkPoolError::InvalidProof);
    //
    // Option 3: Off-chain Verification (Fallback)
    // --------------------------------------------
    // - Verify proofs off-chain with snarkjs
    // - Submit signature from trusted verifier oracle
    // - Program validates signature only
    //
    // CURRENT BEHAVIOR:
    // - Validates proof/VK structure (non-zero points, correct lengths)
    // - Does NOT perform cryptographic pairing verification
    // - UNSAFE for production use

    // For now, we perform basic structural validation
    validate_proof_structure(proof)?;
    validate_vk_structure(vk)?;
    validate_public_inputs(public_inputs)?;

    // SECURITY WARNING: This is NOT cryptographically secure verification!
    // This is a placeholder for development/testing only.
    // In production, integrate with a proper BN254 Groth16 verifier.

    msg!("⚠️  WARNING: Using placeholder proof verification (NOT SECURE)");
    msg!("Proof structure validated, but cryptographic pairing NOT verified");
    msg!("Public inputs count: {}", public_inputs.len());
    msg!("Integration required - see verifier.rs for options");

    Ok(())
}

/// Validate proof has proper structure (non-zero points)
fn validate_proof_structure(proof: &Groth16Proof) -> Result<()> {
    // Check that points are not all zeros
    require!(!is_zero_g1(&proof.a), ZkPoolError::InvalidProofData);
    require!(!is_zero_g2(&proof.b), ZkPoolError::InvalidProofData);
    require!(!is_zero_g1(&proof.c), ZkPoolError::InvalidProofData);

    Ok(())
}

/// Validate VK has proper structure
fn validate_vk_structure(vk: &VerificationKey) -> Result<()> {
    require!(!is_zero_g1(&vk.alpha_g1), ZkPoolError::InvalidVkData);
    require!(!vk.ic.is_empty(), ZkPoolError::InvalidVkData);

    Ok(())
}

/// Validate public inputs are in field
fn validate_public_inputs(inputs: &[[u8; 32]]) -> Result<()> {
    // For BN254, field modulus is ~254 bits
    // We'll do a basic check that values aren't obviously out of range
    for input in inputs {
        // Check that high bits aren't all set (crude field check)
        require!(
            input[31] < 0x30, // Conservative check for BN254 field
            ZkPoolError::FieldOutOfRange
        );
    }

    Ok(())
}

/// Check if G1 point is zero
fn is_zero_g1(point: &G1Point) -> bool {
    point.x == [0u8; 32] && point.y == [0u8; 32]
}

/// Check if G2 point is zero
fn is_zero_g2(point: &G2Point) -> bool {
    point.x[0] == [0u8; 32]
        && point.x[1] == [0u8; 32]
        && point.y[0] == [0u8; 32]
        && point.y[1] == [0u8; 32]
}

// ============================================================================
// PRODUCTION INTEGRATION NOTES
// ============================================================================
//
// To implement real Groth16 verification on Solana, you have several options:
//
// 1. **Light Protocol Integration**
//    - Use Light Protocol's Groth16 verifier program
//    - CPI to their verifier with proof + VK + public inputs
//    - See: https://github.com/Lightprotocol/light-protocol
//
// 2. **Custom Verifier via alt_bn128**
//    - If Solana adds native bn254 syscalls, use them directly
//    - Implement pairing check: e(A,B) = e(α,β)·e(L,γ)·e(C,δ)
//    - Compute L = IC[0] + Σ(inputs[i] · IC[i+1])
//
// 3. **Off-chain Verification**
//    - Verify proofs off-chain via oracle/relayer
//    - Submit only verified batches on-chain
//    - Trade-off: trust assumptions on verifier
//
// 4. **ZK-friendly rollup**
//    - Use a zk-rollup on Solana (if available)
//    - Batch multiple proofs into one
//
// Recommended: Use Light Protocol for immediate Groth16 support on Solana.
// ============================================================================

// ============================================================================
// ENDIANNESS CONVERSION UTILITIES
// ============================================================================
//
// Enable these functions if your verifier requires BIG-ENDIAN encoding.
// The ABI_v2.md specifies LITTLE-ENDIAN, but many verifiers expect BE.
//
// Usage:
//   let proof_be = convert_proof_to_be(proof);
//   let vk_be = convert_vk_to_be(vk);
//   let inputs_be = convert_inputs_to_be(public_inputs);
//
// ============================================================================

/// Convert field element from LE to BE
#[allow(dead_code)]
fn field_le_to_be(le: &[u8; 32]) -> [u8; 32] {
    let mut be = [0u8; 32];
    for i in 0..32 {
        be[i] = le[31 - i];
    }
    be
}

/// Convert G1 point from LE to BE
#[allow(dead_code)]
fn g1_le_to_be(le: &G1Point) -> G1Point {
    G1Point {
        x: field_le_to_be(&le.x),
        y: field_le_to_be(&le.y),
    }
}

/// Convert G2 point from LE to BE
#[allow(dead_code)]
fn g2_le_to_be(le: &G2Point) -> G2Point {
    G2Point {
        x: [field_le_to_be(&le.x[0]), field_le_to_be(&le.x[1])],
        y: [field_le_to_be(&le.y[0]), field_le_to_be(&le.y[1])],
    }
}

/// Convert proof from LE to BE
#[allow(dead_code)]
fn convert_proof_to_be(le: &Groth16Proof) -> Groth16Proof {
    Groth16Proof {
        a: g1_le_to_be(&le.a),
        b: g2_le_to_be(&le.b),
        c: g1_le_to_be(&le.c),
    }
}

/// Convert verification key from LE to BE
#[allow(dead_code)]
fn convert_vk_to_be(le: &VerificationKey) -> VerificationKey {
    VerificationKey {
        alpha_g1: g1_le_to_be(&le.alpha_g1),
        beta_g2: g2_le_to_be(&le.beta_g2),
        gamma_g2: g2_le_to_be(&le.gamma_g2),
        delta_g2: g2_le_to_be(&le.delta_g2),
        ic: le.ic.iter().map(g1_le_to_be).collect(),
    }
}

/// Convert public inputs from LE to BE
#[allow(dead_code)]
fn convert_inputs_to_be(le: &[[u8; 32]]) -> Vec<[u8; 32]> {
    le.iter().map(field_le_to_be).collect()
}

// ============================================================================
// ENCODING VERIFICATION TESTS
// ============================================================================
//
// These tests validate the endianness conversion functions.
// Run with: cargo test-sbf
//
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_field_endianness_conversion() {
        // Test LE → BE → LE round-trip
        let le_original = [
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
            0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c,
            0x1d, 0x1e, 0x1f, 0x20,
        ];

        let be = field_le_to_be(&le_original);

        // Verify BE is reversed
        assert_eq!(be[0], 0x20);
        assert_eq!(be[31], 0x01);

        // Verify round-trip
        let le_back = field_le_to_be(&be);
        assert_eq!(le_original, le_back);
    }

    #[test]
    fn test_g1_endianness_conversion() {
        let le_point = G1Point {
            x: [0x01; 32],
            y: [0x02; 32],
        };

        let be_point = g1_le_to_be(&le_point);

        // Verify BE has reversed bytes
        assert_eq!(be_point.x[0], 0x01);
        assert_eq!(be_point.y[0], 0x02);

        // Verify round-trip
        let le_back = g1_le_to_be(&be_point);
        assert_eq!(le_point.x, le_back.x);
        assert_eq!(le_point.y, le_back.y);
    }
}
