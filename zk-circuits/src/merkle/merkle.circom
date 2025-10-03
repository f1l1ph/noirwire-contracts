pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/mux1.circom";

/*
 * MerkleTreeInclusionProof
 * 
 * Verifies that a leaf is included in a Merkle tree with a given root
 * Uses Poseidon hash for combining nodes: hash(left, right)
 * 
 * Parameters:
 *   - DEPTH: Height of the Merkle tree (number of levels)
 * 
 * Inputs:
 *   - leaf: The leaf value (commitment) to verify
 *   - path_elements[DEPTH]: Sibling hashes along the path from leaf to root
 *   - path_indices[DEPTH]: 0 = leaf is left child, 1 = leaf is right child
 * 
 * Output:
 *   - root: The computed Merkle root
 * 
 * Constraints:
 *   - Verifies path_indices are binary (0 or 1)
 *   - Computes root by hashing up the tree
 */
template MerkleTreeInclusionProof(DEPTH) {
    signal input leaf;
    signal input path_elements[DEPTH];
    signal input path_indices[DEPTH];
    signal output root;

    // Start with the leaf
    signal hashes[DEPTH + 1];
    hashes[0] <== leaf;

    // Hash up the tree level by level
    component hashers[DEPTH];
    component mux[DEPTH];

    for (var i = 0; i < DEPTH; i++) {
        // Ensure path_indices is binary (0 or 1)
        path_indices[i] * (1 - path_indices[i]) === 0;

        // Use mux to select left/right based on path_indices[i]
        // If path_indices[i] == 0: current is left, sibling is right
        // If path_indices[i] == 1: current is right, sibling is left
        
        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== hashes[i];           // left if index=0
        mux[i].c[0][1] <== path_elements[i];    // left if index=1
        mux[i].c[1][0] <== path_elements[i];    // right if index=0
        mux[i].c[1][1] <== hashes[i];           // right if index=1
        mux[i].s <== path_indices[i];

        // Hash the pair
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== mux[i].out[0];  // left
        hashers[i].inputs[1] <== mux[i].out[1];  // right
        
        hashes[i + 1] <== hashers[i].out;
    }

    // Final hash is the root
    root <== hashes[DEPTH];
}
