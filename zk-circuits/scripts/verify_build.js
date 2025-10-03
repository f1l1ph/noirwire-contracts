#!/usr/bin/env node

/**
 * verify_build.js
 * 
 * Verifies that all circuits are properly built and artifacts are in place.
 * This script is portable and works on any platform with Node.js installed.
 * 
 * Uses only:
 * - Node.js built-in modules (fs, path, crypto, child_process)
 * - Relative paths (no hard-coded absolute paths)
 * - Cross-platform compatible commands
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Configuration - relative to this script's location
const CIRCUITS = ['shield', 'transfer', 'unshield'];
const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const BUILD_DIR = path.join(PROJECT_ROOT, 'build');
const POT_DIR = path.join(PROJECT_ROOT, 'pot');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

// Detect if we're on Windows
const IS_WINDOWS = process.platform === 'win32';

// Helper to safely execute commands
function safeExec(command, fallback = null) {
    try {
        return execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim();
    } catch (error) {
        return fallback;
    }
}

// Check for required tools
function checkTools() {
    console.log(`${BLUE}🔧 Checking required tools...${RESET}`);
    
    const tools = [
        { name: 'Node.js', command: 'node --version', required: true },
        { name: 'circom', command: 'circom --version', required: true }
    ];
    
    // Check snarkjs separately (it's installed locally via npm)
    const snarkjsCheck = {
        name: 'snarkjs',
        path: path.join(PROJECT_ROOT, 'node_modules', '.bin', 'snarkjs'),
        required: true
    };
    
    let toolsOk = true;
    
    for (const tool of tools) {
        const version = safeExec(tool.command);
        if (version) {
            console.log(`  ${GREEN}✓${RESET} ${tool.name}: ${version}`);
        } else {
            const status = tool.required ? RED : YELLOW;
            const marker = tool.required ? '✗' : '⚠';
            console.log(`  ${status}${marker}${RESET} ${tool.name}: not found`);
            if (tool.required) {
                toolsOk = false;
            }
        }
    }
    
    // Check snarkjs (local npm package)
    if (fs.existsSync(snarkjsCheck.path)) {
        const version = safeExec(`node ${snarkjsCheck.path} --version`);
        console.log(`  ${GREEN}✓${RESET} ${snarkjsCheck.name}: ${version || 'installed'}`);
    } else {
        // Check if node_modules exists at all
        const nodeModulesPath = path.join(PROJECT_ROOT, 'node_modules');
        if (!fs.existsSync(nodeModulesPath)) {
            console.log(`  ${YELLOW}⚠${RESET} ${snarkjsCheck.name}: node_modules not found (run 'npm install')`);
        } else {
            console.log(`  ${RED}✗${RESET} ${snarkjsCheck.name}: not found (run 'npm install')`);
            if (snarkjsCheck.required) {
                toolsOk = false;
            }
        }
    }
    
    console.log();
    return toolsOk;
}

console.log(`${BLUE}🔍 Verifying ZK Circuit Build...${RESET}`);
console.log(`   Project root: ${PROJECT_ROOT}`);
console.log(`   Platform: ${process.platform} ${process.arch}\n`);

// Check tools first
if (!checkTools()) {
    console.log(`${RED}❌ Required tools missing. Please install:${RESET}`);
    console.log(`   - circom: https://docs.circom.io/getting-started/installation/`);
    console.log(`   - snarkjs: npm install (already in package.json)`);
    process.exit(1);
}

let allPassed = true;

for (const circuit of CIRCUITS) {
    console.log(`${BLUE}Checking ${circuit} circuit...${RESET}`);
    const circuitDir = path.join(BUILD_DIR, circuit);
    
    // Check if circuit directory exists
    if (!fs.existsSync(circuitDir)) {
        console.log(`  ${RED}✗ Directory not found: ${circuitDir}${RESET}`);
        allPassed = false;
        continue;
    }
    
    // Required files
    const requiredFiles = [
        `${circuit}.r1cs`,
        `${circuit}.sym`,
        `${circuit}_js/${circuit}.wasm`,
        `${circuit}_js/generate_witness.js`,
        `${circuit}_final.zkey`,
        'vk.json',
        'proof.json',
        'public.json',
        'VERSION',
        `${circuit}_final.zkey.sha256`
    ];
    
    let circuitPassed = true;
    
    for (const file of requiredFiles) {
        const filePath = path.join(circuitDir, file);
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            console.log(`  ${GREEN}✓${RESET} ${file} (${formatBytes(stats.size)})`);
        } else {
            console.log(`  ${RED}✗${RESET} ${file} - MISSING`);
            circuitPassed = false;
            allPassed = false;
        }
    }
    
    // Verify checksum
    const zkeyPath = path.join(circuitDir, `${circuit}_final.zkey`);
    const checksumPath = path.join(circuitDir, `${circuit}_final.zkey.sha256`);
    
    if (fs.existsSync(zkeyPath) && fs.existsSync(checksumPath)) {
        const zkeyData = fs.readFileSync(zkeyPath);
        const actualHash = crypto.createHash('sha256').update(zkeyData).digest('hex');
        const expectedHash = fs.readFileSync(checksumPath, 'utf8').split(' ')[0];
        
        if (actualHash === expectedHash) {
            console.log(`  ${GREEN}✓${RESET} Checksum verified`);
        } else {
            console.log(`  ${RED}✗${RESET} Checksum mismatch!`);
            console.log(`    Expected: ${expectedHash}`);
            console.log(`    Actual:   ${actualHash}`);
            circuitPassed = false;
            allPassed = false;
        }
    }
    
    // Check public signals
    const publicPath = path.join(circuitDir, 'public.json');
    if (fs.existsSync(publicPath)) {
        const publicSignals = JSON.parse(fs.readFileSync(publicPath, 'utf8'));
        const expectedCount = circuit === 'shield' ? 1 : circuit === 'transfer' ? 4 : 5;
        
        if (publicSignals.length === expectedCount) {
            console.log(`  ${GREEN}✓${RESET} Public signals count correct (${expectedCount})`);
        } else {
            console.log(`  ${RED}✗${RESET} Public signals count mismatch: expected ${expectedCount}, got ${publicSignals.length}`);
            circuitPassed = false;
            allPassed = false;
        }
    }
    
    console.log(circuitPassed ? `  ${GREEN}✓ ${circuit} circuit OK${RESET}` : `  ${RED}✗ ${circuit} circuit FAILED${RESET}`);
    console.log();
}

// Check Powers of Tau
console.log(`${BLUE}Checking Powers of Tau...${RESET}`);
const ptauPath = path.join(POT_DIR, 'pot14_final.ptau');
if (fs.existsSync(ptauPath)) {
    const stats = fs.statSync(ptauPath);
    console.log(`  ${GREEN}✓${RESET} pot14_final.ptau (${formatBytes(stats.size)})`);
    console.log(`     Located at: ${path.relative(PROJECT_ROOT, ptauPath)}`);
} else {
    console.log(`  ${RED}✗${RESET} pot14_final.ptau - MISSING`);
    console.log(`     Expected at: ${path.relative(PROJECT_ROOT, ptauPath)}`);
    allPassed = false;
}
console.log();

// Check source files
console.log(`${BLUE}Checking source files...${RESET}`);
const sourceFiles = [
    'common.circom',
    'shield.circom',
    'transfer.circom',
    'unshield.circom',
    'merkle/merkle.circom'
];
for (const file of sourceFiles) {
    const srcPath = path.join(SRC_DIR, file);
    if (fs.existsSync(srcPath)) {
        console.log(`  ${GREEN}✓${RESET} ${file}`);
    } else {
        console.log(`  ${RED}✗${RESET} ${file} - MISSING`);
        allPassed = false;
    }
}
console.log();

// Check documentation
console.log(`${BLUE}Checking documentation...${RESET}`);
const docs = ['ABI.md', 'VERSIONS.md', 'README.md', 'BUILD_SUMMARY.md', 'QUICKREF.md'];
for (const doc of docs) {
    const docPath = path.join(PROJECT_ROOT, doc);
    if (fs.existsSync(docPath)) {
        console.log(`  ${GREEN}✓${RESET} ${doc}`);
    } else {
        console.log(`  ${YELLOW}⚠${RESET} ${doc} - missing (optional)`);
    }
}
console.log();

// Final summary
console.log('='.repeat(60));
if (allPassed) {
    console.log(`${GREEN}✅ All checks passed! Build is complete and verified.${RESET}`);
    console.log(`\n${BLUE}Next steps:${RESET}`);
    console.log(`  1. Review the circuits in ${path.relative(PROJECT_ROOT, SRC_DIR)}/`);
    console.log(`  2. Check verification keys in ${path.relative(PROJECT_ROOT, BUILD_DIR)}/*/vk.json`);
    console.log(`  3. See public signal order in ABI.md`);
    console.log(`  4. Start integrating with your Solana program`);
    console.log(`\n${BLUE}Portability:${RESET}`);
    console.log(`  ✓ This build uses relative paths and is portable`);
    console.log(`  ✓ You can copy the entire ${path.basename(PROJECT_ROOT)}/ directory to another machine`);
    console.log(`  ✓ Just ensure Node.js, circom, and dependencies are installed`);
    console.log(`  ✓ Run 'npm install' and 'make all' on the new machine`);
} else {
    console.log(`${RED}❌ Some checks failed.${RESET}`);
    console.log(`\n${YELLOW}To fix:${RESET}`);
    console.log(`  1. Ensure you're in the correct directory: ${PROJECT_ROOT}`);
    console.log(`  2. Run: npm install`);
    console.log(`  3. Run: make all`);
    console.log(`  4. Run this script again: node scripts/verify_build.js`);
    process.exit(1);
}
console.log('='.repeat(60));

// Utility function
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
