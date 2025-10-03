#!/usr/bin/env node

/**
 * make_vectors.js
 * 
 * Generates coherent test vectors for shield, transfer, and unshield circuits.
 * Uses circomlibjs Poseidon to compute commitments and build a test Merkle tree.
 * 
 * This script is portable and works on any platform with Node.js installed.
 * Uses only relative paths and standard Node.js modules.
 */

const { buildPoseidon } = require('circomlibjs');
const fs = require('fs');
const path = require('path');

// Configuration - all paths relative to script location
const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const TEST_VECTORS_DIR = path.join(PROJECT_ROOT, 'test_vectors');

// Utility to convert bigint to string for JSON
function bigintToString(obj) {
    if (typeof obj === 'bigint') {
        return obj.toString();
    } else if (Array.isArray(obj)) {
        return obj.map(bigintToString);
    } else if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (const key in obj) {
            result[key] = bigintToString(obj[key]);
        }
        return result;
    }
    return obj;
}

// Build a simple binary Merkle tree
class MerkleTree {
    constructor(poseidon, depth) {
        this.poseidon = poseidon;
        this.depth = depth;
        this.leaves = [];
        this.zero = 0n; // Zero leaf
    }

    insert(leaf) {
        this.leaves.push(leaf);
    }

    hash(left, right) {
        return this.poseidon.F.toString(this.poseidon([left, right]));
    }

    getRoot() {
        if (this.leaves.length === 0) {
            // Empty tree - hash zeros up to root
            let current = this.zero;
            for (let i = 0; i < this.depth; i++) {
                current = this.hash(current, current);
            }
            return current;
        }

        // Build tree bottom-up
        let currentLevel = [...this.leaves];
        
        for (let level = 0; level < this.depth; level++) {
            const nextLevel = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : this.zero;
                nextLevel.push(this.hash(left, right));
            }
            currentLevel = nextLevel;
        }

        return currentLevel[0];
    }

    getProof(index) {
        if (index >= this.leaves.length) {
            throw new Error('Leaf index out of bounds');
        }

        const path = [];
        const positions = [];
        let currentLevel = [...this.leaves];
        let currentIndex = index;

        for (let level = 0; level < this.depth; level++) {
            const isLeft = currentIndex % 2 === 0;
            const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;
            
            const sibling = siblingIndex < currentLevel.length 
                ? currentLevel[siblingIndex] 
                : this.zero;
            
            path.push(sibling);
            positions.push(isLeft ? 0 : 1);

            // Move to next level
            const nextLevel = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : this.zero;
                nextLevel.push(this.hash(left, right));
            }
            currentLevel = nextLevel;
            currentIndex = Math.floor(currentIndex / 2);
        }

        return { path, positions };
    }
}

async function main() {
    console.log('🔧 Generating test vectors...\n');

    // Initialize Poseidon
    const poseidon = await buildPoseidon();

    // Helper to compute commitment
    function computeCommitment(recipientPk, amount, blinding) {
        return poseidon.F.toString(poseidon([recipientPk, amount, blinding]));
    }

    // Helper to compute nullifier
    function computeNullifier(secretSk, noteId) {
        return poseidon.F.toString(poseidon([secretSk, noteId]));
    }

    // ========== SHIELD TEST VECTOR ==========
    console.log('📝 Generating shield_input.json...');
    
    const shieldInput = {
        recipient_pk: "123456789",
        amount: "1000",
        blinding: "42"
    };

    const shieldCommitment = computeCommitment(
        BigInt(shieldInput.recipient_pk),
        BigInt(shieldInput.amount),
        BigInt(shieldInput.blinding)
    );

    console.log(`   Commitment: ${shieldCommitment}\n`);

    // ========== TRANSFER TEST VECTOR ==========
    console.log('📝 Generating transfer_input.json...');

    // Old note parameters
    const transferOldPk = 111n;
    const transferOldAmount = 1000n;
    const transferOldBlinding = 7n;
    const transferSecretSk = 555n;
    const transferNoteId = 13n;

    // New note parameters
    const transferNewPk = 222n;
    const transferNewAmount = 1000n;
    const transferNewBlinding = 9n;
    const transferFee = 0n;

    // Compute old commitment
    const transferOldCommitment = computeCommitment(
        transferOldPk,
        transferOldAmount,
        transferOldBlinding
    );

    // Build a small Merkle tree (depth 20 for circuit, but we'll use smaller for test)
    const transferTree = new MerkleTree(poseidon, 20);
    
    // Insert some dummy leaves, then our commitment at index 3
    transferTree.insert(computeCommitment(100n, 500n, 1n));
    transferTree.insert(computeCommitment(101n, 600n, 2n));
    transferTree.insert(computeCommitment(102n, 700n, 3n));
    transferTree.insert(transferOldCommitment); // Index 3
    
    const transferRoot = transferTree.getRoot();
    const transferProof = transferTree.getProof(3);

    // Compute nullifier
    const transferNullifier = computeNullifier(transferSecretSk, transferNoteId);

    // Compute new commitment
    const transferNewCommitment = computeCommitment(
        transferNewPk,
        transferNewAmount,
        transferNewBlinding
    );

    const transferInput = {
        secret_sk: transferSecretSk.toString(),
        old_recipient_pk: transferOldPk.toString(),
        old_amount: transferOldAmount.toString(),
        old_blinding: transferOldBlinding.toString(),
        note_id: transferNoteId.toString(),
        merkle_path: transferProof.path.map(x => x.toString()),
        merkle_path_positions: transferProof.positions.map(x => x.toString()),
        new_recipient_pk: transferNewPk.toString(),
        new_amount: transferNewAmount.toString(),
        new_blinding: transferNewBlinding.toString(),
        fee: transferFee.toString()
    };

    console.log(`   Root: ${transferRoot}`);
    console.log(`   Nullifier: ${transferNullifier}`);
    console.log(`   New commitment: ${transferNewCommitment}\n`);

    // Unshield - valid case with proper recipient encoding
    console.log('📝 Generating unshield_input.json...');

    // Old note parameters
    const unshieldOldPk = 111n;
    const unshieldOldAmount = 1000n;
    const unshieldOldBlinding = 5n;
    const unshieldSecretSk = 777n;
    const unshieldNoteId = 21n;

    // Public output parameters - encode recipient as two 128-bit limbs
    // Example: simple encoding for testing (in practice, encode actual Solana address)
    const unshieldRecipientLo = 333n; // Lower 128 bits
    const unshieldRecipientHi = 0n;   // Upper 128 bits (0 for small test values)
    const unshieldPublicAmount = 1000n;
    const unshieldFee = 0n;

    // Compute old commitment
    const unshieldOldCommitment = computeCommitment(
        unshieldOldPk,
        unshieldOldAmount,
        unshieldOldBlinding
    );

    // Build Merkle tree
    const unshieldTree = new MerkleTree(poseidon, 20);
    
    // Insert dummy leaves and our commitment at index 2
    unshieldTree.insert(computeCommitment(200n, 800n, 4n));
    unshieldTree.insert(computeCommitment(201n, 900n, 5n));
    unshieldTree.insert(unshieldOldCommitment); // Index 2
    
    const unshieldRoot = unshieldTree.getRoot();
    const unshieldProof = unshieldTree.getProof(2);

    // Compute nullifier
    const unshieldNullifier = computeNullifier(unshieldSecretSk, unshieldNoteId);

    const unshieldInput = {
        secret_sk: unshieldSecretSk.toString(),
        old_recipient_pk: unshieldOldPk.toString(),
        old_amount: unshieldOldAmount.toString(),
        old_blinding: unshieldOldBlinding.toString(),
        note_id: unshieldNoteId.toString(),
        merkle_path: unshieldProof.path.map(x => x.toString()),
        merkle_path_positions: unshieldProof.positions.map(x => x.toString()),
        recipient_lo: unshieldRecipientLo.toString(),
        recipient_hi: unshieldRecipientHi.toString(),
        public_amount: unshieldPublicAmount.toString(),
        fee: unshieldFee.toString()
    };

    console.log(`   Root: ${unshieldRoot}`);
    console.log(`   Nullifier: ${unshieldNullifier}`);
    console.log(`   Recipient Lo: ${unshieldRecipientLo}`);
    console.log(`   Recipient Hi: ${unshieldRecipientHi}`);
    console.log(`   Public amount: ${unshieldPublicAmount}\n`);

    // ========== WRITE FILES ==========
    // Ensure test_vectors directory exists
    if (!fs.existsSync(TEST_VECTORS_DIR)) {
        console.log(`📁 Creating directory: ${TEST_VECTORS_DIR}`);
        fs.mkdirSync(TEST_VECTORS_DIR, { recursive: true });
    }
    
    const files = {
        'shield_input.json': shieldInput,
        'transfer_input.json': transferInput,
        'unshield_input.json': unshieldInput
    };
    
    for (const [filename, data] of Object.entries(files)) {
        const filepath = path.join(TEST_VECTORS_DIR, filename);
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`   ✓ ${path.relative(PROJECT_ROOT, filepath)}`);
    }

    console.log('\n✅ Test vectors generated successfully!');
    console.log(`   Location: ${path.relative(PROJECT_ROOT, TEST_VECTORS_DIR)}/`);
    console.log(`\n💡 These vectors are portable - you can:`);
    console.log(`   1. Use them on any machine with the same circuit versions`);
    console.log(`   2. Regenerate them anytime with: npm run make:vectors`);
    console.log(`   3. Create your own by modifying this script`);
}

main().catch(console.error);
