#!/usr/bin/env node

/**
 * export_vk.js
 * 
 * Exports verification keys and constants in Solana-friendly format.
 * Converts verification keys from snarkjs JSON to constants that can be
 * used in Solana Groth16 verifier programs.
 * 
 * Output format is compatible with common Solana ZK verifier implementations.
 */

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const BUILD_DIR = path.join(PROJECT_ROOT, 'build');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'solana_export');

// ANSI colors
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function log(msg, color = RESET) {
    console.log(`${color}${msg}${RESET}`);
}

/**
 * Parse G1 point from snarkjs format to affine coordinates
 */
function parseG1Point(point) {
    if (!point || point.length !== 3) {
        throw new Error('Invalid G1 point format');
    }
    return {
        x: point[0],
        y: point[1],
        // z: point[2] is typically "1" for affine coordinates
    };
}

/**
 * Parse G2 point from snarkjs format to affine coordinates
 */
function parseG2Point(point) {
    if (!point || point.length !== 3) {
        throw new Error('Invalid G2 point format');
    }
    // G2 points have coordinates in Fp2 (pairs of field elements)
    return {
        x: point[0], // [x_c0, x_c1]
        y: point[1], // [y_c0, y_c1]
        // z: point[2] is typically ["1", "0"] for affine coordinates
    };
}

/**
 * Export verification key for a circuit
 */
function exportVerificationKey(circuit) {
    const vkPath = path.join(BUILD_DIR, circuit, 'vk.json');
    
    if (!fs.existsSync(vkPath)) {
        log(`  ⚠️  Verification key not found: ${circuit}`, YELLOW);
        return null;
    }
    
    log(`  Processing: ${circuit}`, BLUE);
    
    const vk = JSON.parse(fs.readFileSync(vkPath, 'utf8'));
    
    // Parse verification key components
    const alpha = parseG1Point(vk.vk_alpha_1);
    const beta = parseG2Point(vk.vk_beta_2);
    const gamma = parseG2Point(vk.vk_gamma_2);
    const delta = parseG2Point(vk.vk_delta_2);
    
    // IC (input commitments) - array of G1 points
    const ic = vk.IC.map(point => parseG1Point(point));
    
    const exported = {
        protocol: vk.protocol,
        curve: vk.curve,
        nPublic: vk.nPublic,
        
        // Verification key components (BN254 Groth16)
        alpha_g1: alpha,
        beta_g2: beta,
        gamma_g2: gamma,
        delta_g2: delta,
        
        // Input commitments (one per public input + 1)
        ic: ic,
        
        // Metadata
        circuit: circuit,
        version: '1.0.0',
        exportedAt: new Date().toISOString()
    };
    
    log(`    ✓ Alpha G1: (${alpha.x.substring(0, 20)}..., ${alpha.y.substring(0, 20)}...)`, GREEN);
    log(`    ✓ IC points: ${ic.length} (for ${vk.nPublic} public inputs)`, GREEN);
    
    return exported;
}

/**
 * Generate Rust constants (for Solana program)
 */
function generateRustConstants(vkData) {
    const circuit = vkData.circuit.toUpperCase();
    
    let rust = `// Auto-generated verification key constants for ${vkData.circuit} circuit
// Generated: ${vkData.exportedAt}
// Curve: BN254 (bn128)
// Protocol: Groth16

use solana_program::pubkey::Pubkey;

`;

    rust += `// Number of public inputs\n`;
    rust += `pub const ${circuit}_N_PUBLIC: usize = ${vkData.nPublic};\n\n`;
    
    rust += `// Alpha G1 (x, y)\n`;
    rust += `pub const ${circuit}_ALPHA_G1_X: &str = "${vkData.alpha_g1.x}";\n`;
    rust += `pub const ${circuit}_ALPHA_G1_Y: &str = "${vkData.alpha_g1.y}";\n\n`;
    
    rust += `// Beta G2 (x0, x1, y0, y1)\n`;
    rust += `pub const ${circuit}_BETA_G2_X0: &str = "${vkData.beta_g2.x[0]}";\n`;
    rust += `pub const ${circuit}_BETA_G2_X1: &str = "${vkData.beta_g2.x[1]}";\n`;
    rust += `pub const ${circuit}_BETA_G2_Y0: &str = "${vkData.beta_g2.y[0]}";\n`;
    rust += `pub const ${circuit}_BETA_G2_Y1: &str = "${vkData.beta_g2.y[1]}";\n\n`;
    
    rust += `// Gamma G2 (x0, x1, y0, y1)\n`;
    rust += `pub const ${circuit}_GAMMA_G2_X0: &str = "${vkData.gamma_g2.x[0]}";\n`;
    rust += `pub const ${circuit}_GAMMA_G2_X1: &str = "${vkData.gamma_g2.x[1]}";\n`;
    rust += `pub const ${circuit}_GAMMA_G2_Y0: &str = "${vkData.gamma_g2.y[0]}";\n`;
    rust += `pub const ${circuit}_GAMMA_G2_Y1: &str = "${vkData.gamma_g2.y[1]}";\n\n`;
    
    rust += `// Delta G2 (x0, x1, y0, y1)\n`;
    rust += `pub const ${circuit}_DELTA_G2_X0: &str = "${vkData.delta_g2.x[0]}";\n`;
    rust += `pub const ${circuit}_DELTA_G2_X1: &str = "${vkData.delta_g2.x[1]}";\n`;
    rust += `pub const ${circuit}_DELTA_G2_Y0: &str = "${vkData.delta_g2.y[0]}";\n`;
    rust += `pub const ${circuit}_DELTA_G2_Y1: &str = "${vkData.delta_g2.y[1]}";\n\n`;
    
    rust += `// IC (Input Commitments) - array of G1 points\n`;
    rust += `pub const ${circuit}_IC: &[(&str, &str)] = &[\n`;
    vkData.ic.forEach((point, i) => {
        rust += `    ("${point.x}", "${point.y}")`;
        if (i < vkData.ic.length - 1) rust += ',';
        rust += '\n';
    });
    rust += `];\n`;
    
    return rust;
}

/**
 * Generate TypeScript constants
 */
function generateTypeScriptConstants(vkData) {
    const circuit = vkData.circuit;
    
    let ts = `// Auto-generated verification key constants for ${circuit} circuit
// Generated: ${vkData.exportedAt}
// Curve: BN254 (bn128)
// Protocol: Groth16

export interface G1Point {
  x: string;
  y: string;
}

export interface G2Point {
  x: [string, string];
  y: [string, string];
}

export interface VerificationKey {
  protocol: string;
  curve: string;
  nPublic: number;
  alpha_g1: G1Point;
  beta_g2: G2Point;
  gamma_g2: G2Point;
  delta_g2: G2Point;
  ic: G1Point[];
}

export const ${circuit}VerificationKey: VerificationKey = ${JSON.stringify(vkData, null, 2)};
`;
    
    return ts;
}

function main() {
    log('📤 Exporting Verification Keys for Solana\n', BLUE);
    
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        log(`📁 Created directory: ${OUTPUT_DIR}\n`);
    }
    
    const circuits = ['shield', 'transfer', 'unshield'];
    const exported = {};
    
    // Export each circuit
    for (const circuit of circuits) {
        const vkData = exportVerificationKey(circuit);
        if (vkData) {
            exported[circuit] = vkData;
            
            // Write JSON
            const jsonPath = path.join(OUTPUT_DIR, `${circuit}_vk.json`);
            fs.writeFileSync(jsonPath, JSON.stringify(vkData, null, 2));
            log(`    ✓ Exported JSON: ${path.relative(PROJECT_ROOT, jsonPath)}`, GREEN);
            
            // Write Rust constants
            const rustPath = path.join(OUTPUT_DIR, `${circuit}_vk.rs`);
            fs.writeFileSync(rustPath, generateRustConstants(vkData));
            log(`    ✓ Exported Rust: ${path.relative(PROJECT_ROOT, rustPath)}`, GREEN);
            
            // Write TypeScript constants
            const tsPath = path.join(OUTPUT_DIR, `${circuit}_vk.ts`);
            fs.writeFileSync(tsPath, generateTypeScriptConstants(vkData));
            log(`    ✓ Exported TypeScript: ${path.relative(PROJECT_ROOT, tsPath)}`, GREEN);
            
            log('');
        }
    }
    
    // Create combined export
    const combinedPath = path.join(OUTPUT_DIR, 'all_vks.json');
    fs.writeFileSync(combinedPath, JSON.stringify(exported, null, 2));
    log(`✓ Combined export: ${path.relative(PROJECT_ROOT, combinedPath)}`, GREEN);
    
    // Create README
    const readme = `# Solana Verification Key Exports

Auto-generated verification keys for on-chain Groth16 verification.

## Files

- \`*_vk.json\`: Full verification key in JSON format
- \`*_vk.rs\`: Rust constants for Solana programs
- \`*_vk.ts\`: TypeScript definitions for off-chain code
- \`all_vks.json\`: Combined export of all circuits

## Circuits

${circuits.map(c => `- **${c}**: ${exported[c] ? exported[c].nPublic : '?'} public inputs`).join('\n')}

## Usage in Solana Program

\`\`\`rust
// Import the constants
mod shield_vk;
use shield_vk::*;

// Use in verifier
let alpha_g1 = parse_g1(SHIELD_ALPHA_G1_X, SHIELD_ALPHA_G1_Y)?;
// ... construct full verification key
\`\`\`

## Public Input Ordering

**CRITICAL**: The order of public inputs must match the ABI specification.
See \`../ABI.md\` for the exact ordering for each circuit.

## Curve: BN254 (bn128)

All points are on the BN254 curve, also known as bn128 or alt_bn128.
This is the standard curve used by Ethereum and supported by various Solana ZK verifier programs.

Field prime: 21888242871839275222246405745257275088548364400416034343698204186575808495617

## Generated

${new Date().toISOString()}
`;
    
    fs.writeFileSync(path.join(OUTPUT_DIR, 'README.md'), readme);
    log(`✓ Documentation: ${path.relative(PROJECT_ROOT, path.join(OUTPUT_DIR, 'README.md'))}`, GREEN);
    
    log('\n✅ Export complete!\n', GREEN);
    log('📋 Next steps:', BLUE);
    log('   1. Copy the Rust constants to your Solana program');
    log('   2. Implement BN254 Groth16 verifier (or use existing library)');
    log('   3. Parse public inputs according to ABI.md');
    log('   4. Test verification with generated proofs\n');
}

main();
