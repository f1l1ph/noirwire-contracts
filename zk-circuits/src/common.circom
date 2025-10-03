pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

/*
 * NoteCommitment
 * 
 * Computes a commitment to a note using Poseidon hash
 * commitment = Poseidon(recipient_pk, amount, blinding)
 * 
 * Inputs:
 *   - recipient_pk: Public key of note recipient
 *   - amount: Note amount (integer, no decimals)
 *   - blinding: Random blinding factor for privacy
 * 
 * Output:
 *   - commitment: The Poseidon hash commitment
 */
template NoteCommitment() {
    signal input recipient_pk;
    signal input amount;
    signal input blinding;
    signal output commitment;

    // Use Poseidon with 3 inputs
    component hasher = Poseidon(3);
    hasher.inputs[0] <== recipient_pk;
    hasher.inputs[1] <== amount;
    hasher.inputs[2] <== blinding;
    
    commitment <== hasher.out;
}

/*
 * NoteNullifier (Renamed from Nullifier for clarity)
 * 
 * Computes a nullifier to prevent double-spending.
 * The nullifier uniquely identifies a spent note without revealing which note was spent.
 * 
 * SPECIFICATION:
 *   nullifier = Poseidon(secret_sk, note_id)
 * 
 * Where:
 *   - secret_sk: Secret key of the note owner (proves ownership)
 *   - note_id: Unique identifier for the note (typically Merkle leaf index or unique salt)
 * 
 * SECURITY PROPERTIES:
 *   - Same note_id with same secret_sk always produces same nullifier (deterministic)
 *   - Different notes produce different nullifiers (uniqueness)
 *   - Cannot derive secret_sk or note_id from nullifier (hiding)
 *   - Cannot link nullifier to original commitment (unlinkability)
 * 
 * Inputs:
 *   - secret_sk: Secret key of note owner
 *   - note_id: Unique identifier for the note (e.g., leaf index or salt)
 * 
 * Output:
 *   - nullifier: The computed nullifier
 */
template NoteNullifier() {
    signal input secret_sk;
    signal input note_id;
    signal output nullifier;

    // Use Poseidon with 2 inputs for deterministic nullifier generation
    component hasher = Poseidon(2);
    hasher.inputs[0] <== secret_sk;
    hasher.inputs[1] <== note_id;
    
    nullifier <== hasher.out;
}

/*
 * RangeCheck
 * 
 * Enforces that a value is within a specified bit range: 0 <= value < 2^bits
 * Uses bit decomposition to ensure the value fits in the specified number of bits.
 * 
 * SECURITY: Prevents field overflow attacks where values wrap around the prime field.
 * 
 * Parameters:
 *   - bits: Maximum number of bits (e.g., 64 for amounts up to 2^64 - 1)
 * 
 * Input:
 *   - value: The value to range check
 * 
 * Constraints:
 *   - Decomposes value into bits and verifies it equals the sum of bit decomposition
 *   - Ensures value < 2^bits
 */
template RangeCheck(bits) {
    signal input value;
    
    // Decompose value into bits
    // Num2Bits ensures value < 2^bits by constraint
    component n2b = Num2Bits(bits);
    n2b.in <== value;
    
    // Recompose to ensure value matches decomposition
    // This is implicit in Num2Bits but we make it explicit for clarity
    signal sum;
    sum <== n2b.out[0];
    
    var lc = 0;
    var bit_value = 1;
    for (var i = 0; i < bits; i++) {
        lc += n2b.out[i] * bit_value;
        bit_value *= 2;
    }
    
    // Verify reconstruction matches input
    lc === value;
}

/*
 * AmountRangeCheck
 * 
 * Specialized range check for transaction amounts.
 * Enforces: 0 <= amount < 2^64 (safe for u64 Solana amounts)
 * 
 * Input:
 *   - amount: The amount to check
 */
template AmountRangeCheck() {
    signal input amount;
    
    // Check amount fits in 64 bits
    component rangeCheck = RangeCheck(64);
    rangeCheck.value <== amount;
}

/*
 * FeeCheck
 * 
 * Validates that fee is within acceptable range and not greater than amount.
 * Enforces:
 *   - 0 <= fee < 2^64
 *   - fee <= amount
 * 
 * Inputs:
 *   - fee: Transaction fee
 *   - amount: Total amount (fee must not exceed this)
 */
template FeeCheck() {
    signal input fee;
    signal input amount;
    
    // Range check fee
    component rangeCheck = RangeCheck(64);
    rangeCheck.value <== fee;
    
    // Ensure fee <= amount using LessEqThan
    component feeLeqAmount = LessEqThan(64);
    feeLeqAmount.in[0] <== fee;
    feeLeqAmount.in[1] <== amount;
    feeLeqAmount.out === 1;
}

/*
 * RecipientEncoding
 * 
 * Encodes a 32-byte Solana public key as two field elements.
 * Splits 256 bits into two 128-bit limbs: recipient_lo (lower 128 bits) and recipient_hi (upper 128 bits)
 * 
 * This encoding is necessary because BN254 field elements are ~254 bits,
 * but we want to preserve the full 32-byte address without truncation.
 * 
 * Inputs:
 *   - recipient_lo: Lower 128 bits (bytes 0-15)
 *   - recipient_hi: Upper 128 bits (bytes 16-31)
 * 
 * Constraints:
 *   - Each limb must fit in 128 bits
 *   - On-chain verifier reconstructs: address = recipient_lo | (recipient_hi << 128)
 */
template RecipientEncoding() {
    signal input recipient_lo;
    signal input recipient_hi;
    
    // Ensure each limb fits in 128 bits
    component rangeLo = RangeCheck(128);
    rangeLo.value <== recipient_lo;
    
    component rangeHi = RangeCheck(128);
    rangeHi.value <== recipient_hi;
}
