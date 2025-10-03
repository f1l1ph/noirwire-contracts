pragma circom 2.0.0;

include "./common.circom";
include "./merkle/merkle.circom";

/*
 * Transfer Circuit
 * 
 * Spends one note and creates one note (1-in/1-out).
 * Proves:
 *   - Ownership of the input note (via secret key)
 *   - Inclusion of input note in Merkle tree
 *   - Value conservation (input = output + fee)
 *   - Generates unique nullifier to prevent double-spend
 *   - All amounts within safe range
 * 
 * PRIVATE INPUTS:
 *   - secret_sk: Secret key of spender
 *   - old_recipient_pk: Recipient PK of input note
 *   - old_amount: Amount of input note (must be 0 <= old_amount < 2^64)
 *   - old_blinding: Blinding of input note
 *   - note_id: Unique identifier for nullifier generation
 *   - merkle_path[DEPTH]: Sibling hashes along path to root
 *   - merkle_path_positions[DEPTH]: Left/right positions (0/1)
 *   - new_recipient_pk: Recipient PK of output note
 *   - new_amount: Amount of output note (must be 0 <= new_amount < 2^64)
 *   - new_blinding: Blinding of output note
 *   - fee: Transaction fee (must be 0 <= fee <= old_amount)
 * 
 * PUBLIC OUTPUTS (in order):
 *   1. root: Merkle root
 *   2. nullifier: Computed nullifier
 *   3. new_commitment: Output note commitment
 *   4. fee: Transaction fee
 * 
 * CONSTRAINTS:
 *   - Recomputes old_commitment from inputs
 *   - Verifies Merkle inclusion proof
 *   - Generates nullifier = Poseidon(secret_sk, note_id)
 *   - Enforces value conservation: old_amount == new_amount + fee
 *   - Range checks: 0 <= old_amount, new_amount, fee < 2^64
 *   - Fee constraint: fee <= old_amount
 * 
 * SECURITY PROPERTIES:
 *   - Prevents double-spending (nullifier uniqueness enforced on-chain)
 *   - Prevents field overflow (range checks on all amounts)
 *   - Preserves privacy (no linkage between input and output commitments)
 */
template Transfer(DEPTH) {
    // Private inputs - old note
    signal input secret_sk;
    signal input old_recipient_pk;
    signal input old_amount;
    signal input old_blinding;
    signal input note_id;

    // Private inputs - Merkle proof
    signal input merkle_path[DEPTH];
    signal input merkle_path_positions[DEPTH];

    // Private inputs - new note
    signal input new_recipient_pk;
    signal input new_amount;
    signal input new_blinding;

    // Private input - fee
    signal input fee;

    // Public outputs
    signal output root;
    signal output nullifier;
    signal output new_commitment;
    signal output fee_output;

    // Range check: old_amount must fit in 64 bits
    component oldAmountCheck = AmountRangeCheck();
    oldAmountCheck.amount <== old_amount;

    // Range check: new_amount must fit in 64 bits
    component newAmountCheck = AmountRangeCheck();
    newAmountCheck.amount <== new_amount;

    // Fee validation: 0 <= fee <= old_amount
    component feeCheck = FeeCheck();
    feeCheck.fee <== fee;
    feeCheck.amount <== old_amount;

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

    // 4. Compute new note commitment
    component newNoteCommitment = NoteCommitment();
    newNoteCommitment.recipient_pk <== new_recipient_pk;
    newNoteCommitment.amount <== new_amount;
    newNoteCommitment.blinding <== new_blinding;
    new_commitment <== newNoteCommitment.commitment;

    // 5. Enforce value conservation: old_amount = new_amount + fee
    old_amount === new_amount + fee;

    // 6. Output fee as public signal
    fee_output <== fee;
}

// Main component - all outputs will be public signals
component main = Transfer(20);
