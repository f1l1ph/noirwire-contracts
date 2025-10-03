# ZK Circuits for Solana Privacy Payments

Railgun-style zero-knowledge circuits for private transactions on Solana using Groth16 proofs on the BN254 curve.

## Overview

This package implements three core privacy circuits:

1. **Shield** - Deposit into shielded pool (create commitment)
2. **Transfer** - Private 1-in/1-out transfer with Merkle inclusion proof
3. **Unshield** - Withdraw from shielded pool to public recipient

### Key Features

- ✅ BN254 (bn128) curve for Solana compatibility
- ✅ Groth16 proof system (via snarkjs)
- ✅ Poseidon hash for commitments and nullifiers
- ✅ Binary Merkle tree (depth 20, ~1M leaves)
- ✅ Deterministic ABI with locked public signal ordering
- ✅ Automated build and proving system
- ✅ Test vector generation

## Prerequisites

Install the following tools:

```bash
# Circom compiler (Rust version)
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
cargo install circom

# Node.js 18+
# (use nvm, brew, or your preferred method)

# Install dependencies
npm install
```

## Quick Start

```bash
# 1. Generate Powers of Tau (run once)
make ptau

# 2. Compile all circuits
make compile

# 3. Setup proving/verification keys
make setup

# 4. Generate test vectors
npm run make:vectors

# 5. Generate and verify proofs
make prove-all
```

## Project Structure

```
zk-circuits/
├── src/                      # Circuit source files
│   ├── common.circom         # Shared primitives (commitment, nullifier)
│   ├── shield.circom         # Shield circuit
│   ├── transfer.circom       # Transfer circuit
│   ├── unshield.circom       # Unshield circuit
│   └── merkle/
│       └── merkle.circom     # Merkle tree verifier
├── build/                    # Compiled artifacts (generated)
│   ├── shield/
│   │   ├── shield.r1cs
│   │   ├── shield_js/        # WASM + witness generator
│   │   ├── shield_final.zkey # Proving key
│   │   ├── vk.json           # Verification key
│   │   ├── proof.json        # Example proof
│   │   ├── public.json       # Public signals
│   │   └── VERSION           # Circuit version
│   ├── transfer/
│   └── unshield/
├── pot/                      # Powers of Tau
├── test_vectors/             # Test input files
│   ├── shield_input.json
│   ├── transfer_input.json
│   └── unshield_input.json
├── scripts/
│   └── make_vectors.js       # Generate test vectors
├── Makefile                  # Build automation
├── ABI.md                    # Public signal specification
├── VERSIONS.md               # Version history and checksums
└── package.json
```

## Make Targets

| Target                | Description                               |
| --------------------- | ----------------------------------------- |
| `make help`           | Show all available targets                |
| `make ptau`           | Generate Powers of Tau (run once)         |
| `make compile`        | Compile all circuits                      |
| `make setup`          | Generate proving/verification keys        |
| `make test-vectors`   | Generate test input vectors               |
| `make prove-shield`   | Generate and verify shield proof          |
| `make prove-transfer` | Generate and verify transfer proof        |
| `make prove-unshield` | Generate and verify unshield proof        |
| `make prove-all`      | Generate and verify all proofs            |
| `make info`           | Show build status and checksums           |
| `make clean`          | Remove build artifacts (keep pot)         |
| `make clean-all`      | Remove everything including Powers of Tau |

## NPM Scripts

```bash
npm run make:vectors      # Generate test vectors
npm run build:circuits    # Compile circuits
npm run build:all         # Full build (ptau + compile + setup)
npm run prove:shield      # Prove shield
npm run prove:transfer    # Prove transfer
npm run prove:unshield    # Prove unshield
npm run prove:all         # Prove all circuits
npm run clean             # Clean build artifacts
npm run info              # Show build info
```

## Circuit Specifications

### Shield

**Purpose**: Create a shielded note commitment (deposit).

**Public Signals**:

1. `commitment` - Poseidon(recipient_pk, amount, blinding)

**Private Inputs**: `recipient_pk`, `amount`, `blinding`

### Transfer

**Purpose**: Private 1-in/1-out transfer with inclusion proof.

**Public Signals**:

1. `root` - Merkle root
2. `nullifier` - Prevents double-spending
3. `new_commitment` - Output note commitment
4. `fee` - Transaction fee (currently 0)

**Private Inputs**:

- Old note: `secret_sk`, `old_recipient_pk`, `old_amount`, `old_blinding`, `note_id`
- Merkle proof: `merkle_path[20]`, `merkle_path_positions[20]`
- New note: `new_recipient_pk`, `new_amount`, `new_blinding`
- Fee: `fee`

**Constraints**:

- Merkle inclusion proof verification
- Value conservation: `old_amount = new_amount + fee`
- Nullifier = Poseidon(secret_sk, note_id)

### Unshield

**Purpose**: Withdraw from shielded pool to public recipient.

**Public Signals**:

1. `root` - Merkle root
2. `nullifier` - Prevents double-spending
3. `public_recipient` - Public recipient (field encoded)
4. `public_amount` - Amount to withdraw
5. `fee` - Transaction fee (currently 0)

**Private Inputs**:

- Old note: `secret_sk`, `old_recipient_pk`, `old_amount`, `old_blinding`, `note_id`
- Merkle proof: `merkle_path[20]`, `merkle_path_positions[20]`
- Public outputs: `public_recipient`, `public_amount`, `fee`

**Constraints**:

- Merkle inclusion proof verification
- Value conservation: `old_amount = public_amount + fee`
- Nullifier = Poseidon(secret_sk, note_id)

## ABI Specification

See [ABI.md](./ABI.md) for complete public signal ordering specification.

**CRITICAL**: Public signal order is locked and must remain stable for on-chain verifier compatibility.

## Development Workflow

### 1. Modify a Circuit

```bash
# Edit circuit file
vim src/transfer.circom

# Recompile
make compile

# Re-setup keys
make setup

# Test with proof
make prove-transfer
```

### 2. Generate Custom Test Vectors

```bash
# Edit the script
vim scripts/make_vectors.js

# Generate
npm run make:vectors

# Prove with new vectors
make prove-all
```

### 3. Check Build Status

```bash
make info
```

## Integration with Solana

### On-Chain Verifier

The Solana program will need to:

1. Accept Groth16 proofs (proof.json format)
2. Verify using BN254 curve operations
3. Check public signals match expected ABI order
4. Maintain nullifier set to prevent double-spending
5. Update Merkle root with new commitments

### Off-Chain Prover

Your application will:

1. Construct private inputs (notes, Merkle proofs, keys)
2. Generate witness using `generate_witness.js`
3. Produce proof using proving key (zkey)
4. Submit proof + public signals to Solana program

### Example Integration Flow

```javascript
// 1. Load proving key
const zkeyPath = "build/transfer/transfer_final.zkey";

// 2. Prepare inputs
const inputs = {
  secret_sk: "555",
  old_recipient_pk: "111",
  // ... other inputs
};

// 3. Generate witness
const witnessPath = await generateWitness(inputs);

// 4. Generate proof
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  inputs,
  "build/transfer/transfer_js/transfer.wasm",
  zkeyPath
);

// 5. Submit to Solana
await solanaProgram.verifyAndExecute(proof, publicSignals);
```

## Security Considerations

⚠️ **THESE CIRCUITS ARE FOR DEVELOPMENT ONLY**

Current limitations:

- No range checks on amounts (overflow risk)
- No fee validation (fee could exceed input amount)
- No key derivation verification (secret_sk ↔ recipient_pk)
- Single-contributor trusted setup (not secure)
- Simplified address encoding (single field, not full 32 bytes)

### Production Requirements

Before mainnet deployment:

1. ❌ Implement comprehensive range checks
2. ❌ Add fee validation logic
3. ❌ Implement proper Solana address encoding (32 bytes)
4. ❌ Add key derivation and ownership proofs
5. ❌ Run multi-party trusted setup ceremony
6. ❌ Complete security audit by reputable firm
7. ❌ Extensive testing (unit, integration, fuzzing)
8. ❌ Formal verification (optional but recommended)

## Performance

Estimated proof generation times (on modern hardware):

- **Shield**: ~0.5s
- **Transfer**: ~2-5s (due to Merkle proof depth 20)
- **Unshield**: ~2-5s

Optimization options:

- Use rapidsnark for faster proving (C++ prover)
- Reduce Merkle depth (fewer leaves, faster proofs)
- Batch multiple operations

## Portability

This build system is **fully portable** and works on any machine with Node.js and circom installed.

### Transfer to Another Machine

```bash
# Package the project
tar -czf zk-circuits-portable.tar.gz zk-circuits/

# Transfer to new machine (USB, scp, git, etc.)

# On new machine
tar -xzf zk-circuits-portable.tar.gz
cd zk-circuits
npm install
make all
```

### Requirements on New Machine

- Node.js 18+ ([download](https://nodejs.org/))
- circom 2.0+ ([install guide](https://docs.circom.io/getting-started/installation/))
- npm (comes with Node.js)

### Verify Portability

```bash
# Check that everything is working
node scripts/verify_build.js
```

**Output will show:**

- ✓ Tool versions (Node.js, circom, snarkjs)
- ✓ All circuit artifacts and checksums
- ✓ Portability confirmation

### Key Features

- ✅ **No hard-coded paths** - All paths are relative
- ✅ **Cross-platform** - Works on Windows, macOS, Linux
- ✅ **Auto-detection** - Checks for required tools automatically
- ✅ **Self-contained** - Just copy the directory and run
- ✅ **Clear errors** - Helpful messages if anything is missing

For complete portability documentation, see [PORTABILITY.md](./PORTABILITY.md).

## Troubleshooting

### "circom: command not found"

Install Circom: `cargo install circom`

### "snarkjs: command not found"

Install dependencies: `npm install`

### Out of memory during proving

Increase Node.js heap: `NODE_OPTIONS=--max-old-space-size=8192 make prove-transfer`

### Powers of Tau too small

Increase PTAU_POWER in Makefile (note: larger = slower but supports more constraints)

### Script can't find files

Make sure you're in the `zk-circuits/` directory when running commands. Use `pwd` to check.

## References

- [Circom Documentation](https://docs.circom.io/)
- [snarkjs](https://github.com/iden3/snarkjs)
- [circomlib](https://github.com/iden3/circomlib)
- [Poseidon Hash](https://www.poseidon-hash.info/)
- [Groth16 Paper](https://eprint.iacr.org/2016/260.pdf)

## License

ISC

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `make prove-all` to verify
5. Submit a pull request

## Roadmap

Future improvements:

- [ ] Implement range checks (production safety)
- [ ] Add fee validation
- [ ] Implement proper Solana address encoding (32 bytes)
- [ ] Export Solana verifier constants
- [ ] Add rapidsnark integration
- [ ] Add key derivation verification
- [ ] Support multi-input/multi-output transfers
- [ ] Add memo field for encrypted messages
- [ ] Support variable Merkle depths
- [ ] Optimize constraint counts
- [ ] Create browser-based prover (WASM)
- [ ] Multi-party trusted setup ceremony
- [ ] Professional security audit
