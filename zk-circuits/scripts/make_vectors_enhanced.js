#!/usr/bin/env node

/**
 * make_vectors_enhanced.js
 * 
 * Generates comprehensive test vectors including:
 * - Valid (positive) test cases
 * - Invalid (negative) test cases for security validation
 * - Edge cases (max values, zero values, etc.)
 * 
 * Uses circomlibjs Poseidon to compute commitments and build test Merkle trees.
 * 
 * This script is portable and works on any platform with Node.js installed.
 */

const { buildPoseidon } = require('circomlibjs');
const fs = require('fs');
const path = require('path');

// Configuration - all paths relative to script location
const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const TEST_VECTORS_DIR = path.join(PROJECT_ROOT, 'test_vectors');
const NEGATIVE_TESTS_DIR = path.join(TEST_VECTORS_DIR, 'negative');

// Constants
const MAX_U64 = 2n ** 64n - 1n;
const MAX_U128 = 2n ** 128n - 1n;

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
        this.zero = 0n;
    }

    insert(leaf) {
        this.leaves.push(leaf);
    }

    hash(left, right) {
        return this.poseidon.F.toString(this.poseidon([left, right]));
    }

    getRoot() {
        if (this.leaves.length === 0) {
            let current = this.zero;
            for (let i = 0; i < this.depth; i++) {
                current = this.hash(current, current);
            }
            return current;
        }

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

// Helper to split 32-byte address into two 128-bit limbs
function encodeRecipient(addressBytes) {
    // addressBytes should be 32 bytes
    // Split into lower 16 bytes and upper 16 bytes
    const lo = BigInt('0x' + addressBytes.slice(0, 32)); // First 16 bytes (128 bits)
    const hi = BigInt('0x' + addressBytes.slice(32, 64)); // Second 16 bytes (128 bits)
    return { lo, hi };
}

// Example Solana address (32 bytes = 64 hex chars)
const EXAMPLE_SOLANA_ADDRESS = '4d3e7f8a2b1c9d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0';

async function main() {
    console.log('🔧 Generating enhanced test vectors...\n');

    const poseidon = await buildPoseidon();

    // Helper functions
    function computeCommitment(recipientPk, amount, blinding) {
        return poseidon.F.toString(poseidon([recipientPk, amount, blinding]));
    }

    function computeNullifier(secretSk, noteId) {
        return poseidon.F.toString(poseidon([secretSk, noteId]));
    }

    // Ensure directories exist
    [TEST_VECTORS_DIR, NEGATIVE_TESTS_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            console.log(`📁 Creating directory: ${dir}`);
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    // ========== POSITIVE TEST VECTORS ==========
    console.log('✅ Generating positive (valid) test vectors...\n');

    // Shield - valid case
    console.log('📝 shield_input.json (valid)');
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

    // Transfer - valid case
    console.log('📝 transfer_input.json (valid)');
    const transferOldPk = 111n;
    const transferOldAmount = 1000n;
    const transferOldBlinding = 7n;
    const transferSecretSk = 555n;
    const transferNoteId = 13n;
    const transferNewPk = 222n;
    const transferNewAmount = 1000n;
    const transferNewBlinding = 9n;
    const transferFee = 0n;

    const transferOldCommitment = computeCommitment(transferOldPk, transferOldAmount, transferOldBlinding);
    const transferTree = new MerkleTree(poseidon, 20);
    transferTree.insert(computeCommitment(100n, 500n, 1n));
    transferTree.insert(computeCommitment(101n, 600n, 2n));
    transferTree.insert(computeCommitment(102n, 700n, 3n));
    transferTree.insert(transferOldCommitment);
    
    const transferRoot = transferTree.getRoot();
    const transferProof = transferTree.getProof(3);
    const transferNullifier = computeNullifier(transferSecretSk, transferNoteId);
    const transferNewCommitment = computeCommitment(transferNewPk, transferNewAmount, transferNewBlinding);

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
    console.log(`   Nullifier: ${transferNullifier}\n`);

    // Unshield - valid case with proper recipient encoding
    console.log('📝 unshield_input.json (valid with 2-field recipient)');
    const unshieldOldPk = 111n;
    const unshieldOldAmount = 1000n;
    const unshieldOldBlinding = 5n;
    const unshieldSecretSk = 777n;
    const unshieldNoteId = 21n;
    
    const recipient = encodeRecipient(EXAMPLE_SOLANA_ADDRESS);
    const unshieldPublicAmount = 1000n;
    const unshieldFee = 0n;

    const unshieldOldCommitment = computeCommitment(unshieldOldPk, unshieldOldAmount, unshieldOldBlinding);
    const unshieldTree = new MerkleTree(poseidon, 20);
    unshieldTree.insert(computeCommitment(200n, 800n, 4n));
    unshieldTree.insert(computeCommitment(201n, 900n, 5n));
    unshieldTree.insert(unshieldOldCommitment);
    
    const unshieldRoot = unshieldTree.getRoot();
    const unshieldProof = unshieldTree.getProof(2);
    const unshieldNullifier = computeNullifier(unshieldSecretSk, unshieldNoteId);

    const unshieldInput = {
        secret_sk: unshieldSecretSk.toString(),
        old_recipient_pk: unshieldOldPk.toString(),
        old_amount: unshieldOldAmount.toString(),
        old_blinding: unshieldOldBlinding.toString(),
        note_id: unshieldNoteId.toString(),
        merkle_path: unshieldProof.path.map(x => x.toString()),
        merkle_path_positions: unshieldProof.positions.map(x => x.toString()),
        recipient_lo: recipient.lo.toString(),
        recipient_hi: recipient.hi.toString(),
        public_amount: unshieldPublicAmount.toString(),
        fee: unshieldFee.toString()
    };
    console.log(`   Root: ${unshieldRoot}`);
    console.log(`   Recipient Lo: ${recipient.lo}`);
    console.log(`   Recipient Hi: ${recipient.hi}\n`);

    // ========== NEGATIVE TEST VECTORS ==========
    console.log('❌ Generating negative (invalid) test vectors...\n');

    // Shield - amount overflow (exceeds 2^64)
    console.log('📝 shield_amount_overflow.json (should FAIL)');
    const shieldOverflow = {
        ...shieldInput,
        amount: (MAX_U64 + 1n).toString()
    };

    // Transfer - wrong Merkle path (should fail verification)
    console.log('📝 transfer_wrong_path.json (should FAIL)');
    const transferWrongPath = {
        ...transferInput,
        merkle_path: transferProof.path.map(x => (BigInt(x) + 1n).toString()) // Corrupt path
    };

    // Transfer - invalid root (commitment not in tree)
    console.log('📝 transfer_invalid_root.json (should FAIL)');
    const fakeCommitment = computeCommitment(999n, 888n, 777n);
    const fakeTree = new MerkleTree(poseidon, 20);
    fakeTree.insert(fakeCommitment);
    const fakeProof = fakeTree.getProof(0);
    
    const transferInvalidRoot = {
        ...transferInput,
        merkle_path: fakeProof.path.map(x => x.toString()),
        merkle_path_positions: fakeProof.positions.map(x => x.toString())
    };

    // Transfer - fee exceeds amount (should FAIL)
    console.log('📝 transfer_fee_exceeds_amount.json (should FAIL)');
    const transferFeeExceeds = {
        ...transferInput,
        fee: (transferOldAmount + 1n).toString(),
        new_amount: "0" // Even with new_amount=0, old_amount < fee
    };

    // Transfer - amount out of range
    console.log('📝 transfer_amount_overflow.json (should FAIL)');
    const transferAmountOverflow = {
        ...transferInput,
        old_amount: (MAX_U64 + 1n).toString()
    };

    // Unshield - fee > amount
    console.log('📝 unshield_fee_exceeds_amount.json (should FAIL)');
    const unshieldFeeExceeds = {
        ...unshieldInput,
        fee: (unshieldOldAmount + 1n).toString(),
        public_amount: "0"
    };

    // Unshield - recipient_lo overflow (exceeds 128 bits)
    console.log('📝 unshield_recipient_lo_overflow.json (should FAIL)');
    const unshieldRecipientOverflow = {
        ...unshieldInput,
        recipient_lo: (MAX_U128 + 1n).toString()
    };

    console.log('\n');

    // ========== WRITE FILES ==========
    const positiveFiles = {
        'shield_input.json': shieldInput,
        'transfer_input.json': transferInput,
        'unshield_input.json': unshieldInput
    };

    const negativeFiles = {
        'shield_amount_overflow.json': shieldOverflow,
        'transfer_wrong_path.json': transferWrongPath,
        'transfer_invalid_root.json': transferInvalidRoot,
        'transfer_fee_exceeds_amount.json': transferFeeExceeds,
        'transfer_amount_overflow.json': transferAmountOverflow,
        'unshield_fee_exceeds_amount.json': unshieldFeeExceeds,
        'unshield_recipient_lo_overflow.json': unshieldRecipientOverflow
    };

    console.log('💾 Writing positive test vectors...');
    for (const [filename, data] of Object.entries(positiveFiles)) {
        const filepath = path.join(TEST_VECTORS_DIR, filename);
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`   ✓ ${path.relative(PROJECT_ROOT, filepath)}`);
    }

    console.log('\n💾 Writing negative test vectors...');
    for (const [filename, data] of Object.entries(negativeFiles)) {
        const filepath = path.join(NEGATIVE_TESTS_DIR, filename);
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`   ✓ ${path.relative(PROJECT_ROOT, filepath)}`);
    }

    // Create README for negative tests
    const negativeReadme = `# Negative Test Vectors

These test vectors are designed to **FAIL** circuit constraints.
They test security properties like range checks, fee validation, and Merkle proof verification.

## Test Cases

1. **shield_amount_overflow.json**
   - Amount exceeds 2^64
   - Expected: Range check failure

2. **transfer_wrong_path.json**
   - Corrupted Merkle path
   - Expected: Merkle proof verification failure

3. **transfer_invalid_root.json**
   - Commitment not in Merkle tree
   - Expected: Root mismatch

4. **transfer_fee_exceeds_amount.json**
   - Fee > old_amount
   - Expected: Fee check failure or value conservation failure

5. **transfer_amount_overflow.json**
   - Amount exceeds 2^64
   - Expected: Range check failure

6. **unshield_fee_exceeds_amount.json**
   - Fee > old_amount
   - Expected: Fee check failure

7. **unshield_recipient_lo_overflow.json**
   - Recipient lower limb exceeds 128 bits
   - Expected: Recipient encoding range check failure

## Usage

These vectors are used to validate that the circuits correctly reject invalid inputs.
Do NOT use these for proof generation - they will fail by design.

Run validation tests with:
\`\`\`bash
node scripts/test_negative.js
\`\`\`
`;

    fs.writeFileSync(
        path.join(NEGATIVE_TESTS_DIR, 'README.md'),
        negativeReadme
    );
    console.log(`   ✓ ${path.relative(PROJECT_ROOT, path.join(NEGATIVE_TESTS_DIR, 'README.md'))}`);

    console.log('\n✅ Enhanced test vectors generated successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   Positive vectors: ${Object.keys(positiveFiles).length}`);
    console.log(`   Negative vectors: ${Object.keys(negativeFiles).length}`);
    console.log(`\n💡 Usage:`);
    console.log(`   Valid tests: make prove-all`);
    console.log(`   Security tests: node scripts/test_negative.js`);
}

main().catch(console.error);
