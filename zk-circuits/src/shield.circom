pragma circom 2.0.0;

include "./common.circom";

/*
 * Shield Circuit
 * 
 * Creates a new shielded note commitment.
 * This is used when depositing into the shielded pool.
 * 
 * PRIVATE INPUTS:
 *   - recipient_pk: Public key of the note recipient
 *   - amount: Note amount (integer, no decimals, must be 0 <= amount < 2^64)
 *   - blinding: Random blinding factor
 * 
 * PUBLIC OUTPUTS (in order):
 *   1. commitment: The note commitment
 * 
 * CONSTRAINTS:
 *   - Computes commitment = Poseidon(recipient_pk, amount, blinding)
 *   - Enforces 0 <= amount < 2^64 (prevents field overflow attacks)
 * 
 * SECURITY:
 *   - Range checks prevent malicious amounts that wrap around the prime field
 *   - Commitment hiding: blinding factor ensures same (pk, amount) produces different commitments
 */
template Shield() {
    // Private inputs
    signal input recipient_pk;
    signal input amount;
    signal input blinding;

    // Public output
    signal output commitment;

    // Range check: amount must fit in 64 bits
    component amountCheck = AmountRangeCheck();
    amountCheck.amount <== amount;

    // Compute note commitment
    component noteCommitment = NoteCommitment();
    noteCommitment.recipient_pk <== recipient_pk;
    noteCommitment.amount <== amount;
    noteCommitment.blinding <== blinding;

    commitment <== noteCommitment.commitment;
}

// Main component - commitment will be public by default (it's the only output)
component main = Shield();
