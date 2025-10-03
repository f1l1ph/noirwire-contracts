pragma circom 2.0.0;

include "./common.circom";
include "./merkle/merkle.circom";

/*
 * Unshield Circuit
 * 
 * Spends a shielded note to pay a public L1 recipient.
 * This is used for withdrawals from the shielded pool.
 * 
 * PRIVATE INPUTS:
 *   - secret_sk: Secret key of spender
 *   - old_recipient_pk: Recipient PK of input note
 *   - old_amount: Amount of input note (must be 0 <= old_amount < 2^64)
 *   - old_blinding: Blinding of input note
 *   - note_id: Unique identifier for nullifier generation
 *   - merkle_path[DEPTH]: Sibling hashes along path to root
 *   - merkle_path_positions[DEPTH]: Left/right positions (0/1)
 *   - recipient_lo: Lower 128 bits of public recipient address
 *   - recipient_hi: Upper 128 bits of public recipient address
 *   - public_amount: Amount to send to recipient (must be 0 <= public_amount < 2^64)
 *   - fee: Transaction fee (must be 0 <= fee <= old_amount)
 * 
 * PUBLIC OUTPUTS (in order):
 *   1. root: Merkle root
 *   2. nullifier: Computed nullifier
 *   3. recipient_lo: Lower 128 bits of recipient address
 *   4. recipient_hi: Upper 128 bits of recipient address
 *   5. public_amount: Amount to send to recipient
 *   6. fee: Transaction fee
 * 
 * CONSTRAINTS:
 *   - Recomputes old_commitment from inputs
 *   - Verifies Merkle inclusion proof
 *   - Generates nullifier = Poseidon(secret_sk, note_id)
 *   - Enforces value conservation: old_amount == public_amount + fee
 *   - Range checks: 0 <= old_amount, public_amount, fee < 2^64
 *   - Recipient encoding: each limb fits in 128 bits
 *   - Fee constraint: fee <= old_amount
 * 
 * RECIPIENT ENCODING:
 *   Solana addresses are 32 bytes (256 bits).
 *   We split them into two 128-bit limbs to fit safely in BN254 field elements (~254 bits).
 *   - recipient_lo: bytes 0-15 (lower 128 bits)
 *   - recipient_hi: bytes 16-31 (upper 128 bits)
 *   On-chain reconstruction: address_bytes = recipient_lo.to_le_bytes() || recipient_hi.to_le_bytes()
 * 
 * SECURITY PROPERTIES:
 *   - Prevents double-spending (nullifier uniqueness enforced on-chain)
 *   - Prevents field overflow (range checks on all amounts)
 *   - Preserves sender privacy (only nullifier and amount revealed, not input commitment)
 *   - Recipient address fully preserved (no truncation)
 */
template Unshield(DEPTH) {
    // Private inputs - old note
    signal input secret_sk;
    signal input old_recipient_pk;
    signal input old_amount;
    signal input old_blinding;
    signal input note_id;

    // Private inputs - Merkle proof
    signal input merkle_path[DEPTH];
    signal input merkle_path_positions[DEPTH];

    // Private inputs - public outputs (values)
    signal input recipient_lo;
    signal input recipient_hi;
    signal input public_amount;
    signal input fee;

    // Public outputs
    signal output root;
    signal output nullifier;
    signal output recipient_lo_output;
    signal output recipient_hi_output;
    signal output amount_output;
    signal output fee_output;

    // Range check: old_amount must fit in 64 bits
    component oldAmountCheck = AmountRangeCheck();
    oldAmountCheck.amount <== old_amount;

    // Range check: public_amount must fit in 64 bits
    component publicAmountCheck = AmountRangeCheck();
    publicAmountCheck.amount <== public_amount;

    // Fee validation: 0 <= fee <= old_amount
    component feeCheck = FeeCheck();
    feeCheck.fee <== fee;
    feeCheck.amount <== old_amount;

    // Recipient encoding validation: each limb must fit in 128 bits
    component recipientEncoding = RecipientEncoding();
    recipientEncoding.recipient_lo <== recipient_lo;
    recipientEncoding.recipient_hi <== recipient_hi;

    // 1. Recompute old note commitment
    component oldNoteCommitment = NoteCommitment();
    oldNoteCommitment.recipient_pk <== old_recipient_pk;
    oldNoteCommitment.amount <== old_amount;
    oldNoteCommitment.blinding <== old_blinding;
    signal old_commitment;
    old_commitment <== oldNoteCommitment.commitment;

    // 2. Verify Merkle inclusion proof
    component merkleProof = MerkleTreeInclusionProof(DEPTH);
    merkleProof.leaf <== old_commitment;
    for (var i = 0; i < DEPTH; i++) {
        merkleProof.path_elements[i] <== merkle_path[i];
        merkleProof.path_indices[i] <== merkle_path_positions[i];
    }
    root <== merkleProof.root;

    // 3. Generate nullifier (prevents double-spending)
    component nullifierGen = NoteNullifier();
    nullifierGen.secret_sk <== secret_sk;
    nullifierGen.note_id <== note_id;
    nullifier <== nullifierGen.nullifier;

    // 4. Enforce value conservation: old_amount = public_amount + fee
    old_amount === public_amount + fee;

    // 5. Output public recipient address (two limbs) and amount
    recipient_lo_output <== recipient_lo;
    recipient_hi_output <== recipient_hi;
    amount_output <== public_amount;
    fee_output <== fee;
}

// Main component - all outputs will be public signals
component main = Unshield(20);
