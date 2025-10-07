# NoirWire Contracts - Zero-Knowledge Privacy Pool on Solana

NoirWire is a privacy-preserving protocol for Solana, similar to Railgun on Ethereum. It enables private transactions using zero-knowledge proofs (Groth16 + BN254 curve) while maintaining full transparency and compliance capabilities.

## 🎯 Overview

**NoirWire provides**:

- 🔒 **Private Deposits** (shield): Deposit SOL/tokens into private pool
- 🔄 **Private Transfers** (transfer): Send funds privately within the pool
- 💸 **Private Withdrawals** (unshield): Withdraw to any address privately
- ✅ **Verified Privacy**: All transactions verified on-chain with ZK proofs
- 🌳 **Merkle Tree**: 20-level tree supporting 1M private notes
- 🚫 **Nullifier System**: Prevents double-spending
- ⏸️ **Emergency Pause**: Admin controls for security

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Application                        │
│  - Generate ZK proofs (shield/transfer/unshield)           │
│  - Manage private notes and Merkle tree                     │
│  - Submit proofs to Solana program                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                 Solana Programs (On-Chain)                   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  zk-pool Program (Main Privacy Pool)                 │  │
│  │  - Verify Groth16 proofs                             │  │
│  │  - Manage Merkle roots (ring buffer)                 │  │
│  │  - Track nullifiers (prevent double-spend)           │  │
│  │  - Handle deposits/withdrawals via CPI               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  noirwire-contracts (Governance/Extensions)          │  │
│  │  - Future: DAO governance                             │  │
│  │  - Future: Additional privacy features               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              ZK Circuits (Off-Chain Proving)                 │
│  - shield.circom: Prove deposit ownership                   │
│  - transfer.circom: Prove private transfer validity         │
│  - unshield.circom: Prove withdrawal authorization          │
│  - Uses Circom + SnarkJS for proof generation              │
└─────────────────────────────────────────────────────────────┘
```

## 📦 Repository Structure

```
noirwire-contracts/
├── programs/
│   ├── zk-pool/              # Main privacy pool program
│   │   ├── src/
│   │   │   ├── lib.rs        # Program entry point
│   │   │   ├── state.rs      # Account structures
│   │   │   ├── instructions/ # All instructions
│   │   │   ├── verifier.rs   # Groth16 verification
│   │   │   ├── errors.rs     # Custom errors
│   │   │   ├── events.rs     # Event definitions
│   │   │   └── constants.rs  # Program constants
│   │   └── Cargo.toml
│   └── noirwire-contracts/   # Governance (future)
│
├── zk-circuits/              # Zero-knowledge circuits
│   ├── src/
│   │   ├── shield.circom     # Deposit circuit
│   │   ├── transfer.circom   # Private transfer circuit
│   │   ├── unshield.circom   # Withdrawal circuit
│   │   └── common.circom     # Shared components
│   ├── build/                # Compiled circuits
│   ├── pot/                  # Powers of Tau
│   └── ABI.md                # Encoding specification
│
├── tests/                    # TypeScript tests
│   ├── zk-pool.spec.ts       # Integration tests
│   ├── zk-pool-unit.spec.ts  # Unit tests
│   └── zk-pool-encoding.spec.ts # Encoding tests
│
├── scripts/                  # Deployment scripts
│   ├── export-vk.ts          # Export verification keys
│   ├── publish-vk.ts         # Upload VKs to program
│   └── submit-golden.ts      # Test with golden proofs
│
├── Anchor.toml               # Anchor configuration
└── package.json              # Node dependencies
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18.x
- **Rust** >= 1.70
- **Solana CLI** >= 1.18.20
- **Anchor** >= 0.31.1
- **Yarn** or npm

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd noirwire-contracts

# Install all dependencies (Solana, Anchor, Node packages)
make install

# Or install individually:
make install-solana    # Install Solana platform tools
make install-anchor    # Install Anchor framework
make install-deps      # Install Node dependencies

# Add Solana to PATH (add to ~/.zshrc or ~/.bashrc)
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Reload shell
source ~/.zshrc

# Verify installation
make versions
```

## 🔨 Building

### Build Solana Programs

```bash
# Build all programs
make build-programs

# Or with Anchor
anchor build

# Build specific program
cd programs/zk-pool
cargo build-sbf

# Check for errors
make check
```

### Build ZK Circuits

```bash
# Build all circuits
make build-circuits

# Or manually
cd zk-circuits

# Build all circuits
make all

# Build specific circuit
make shield
make transfer
make unshield

# Verify builds
npm run verify-build
```

### Build Everything

```bash
# One command to build programs + circuits
make build
```

## 🧪 Testing

### Run All Tests

```bash
# Run all tests
make test

# Or with Anchor
anchor test

# Run specific test suite
make test-unit        # Unit tests only
make test-encoding    # Encoding tests only
make test-integration # Integration tests only

# Or with npm
yarn test:zk-pool
npx mocha tests/zk-pool-unit.spec.ts
npx mocha tests/zk-pool-encoding.spec.ts
```

### Test Results

```
✅ 55/55 tests passing
  - 22 unit tests (helper functions, PDAs, ring buffer)
  - 33 encoding tests (round-trip validation, negative cases)
```

## 🌐 Deployment

### Deploy to Devnet

```bash
# Quick deployment (recommended)
make config-devnet     # Configure Solana CLI
make airdrop           # Get 2 SOL
make build             # Build everything
make deploy-devnet     # Deploy programs
make init-devnet       # Initialize pool
make upload-vk-devnet  # Upload verification keys

# Or manually
solana config set --url https://api.devnet.solana.com
solana config set --keypair ~/.config/solana/devnet-wallet.json

# Check balance (airdrop if needed)
solana balance
solana airdrop 2

# Deploy programs
anchor deploy --provider.cluster devnet

# Initialize the pool
ts-node scripts/initialize-pool.ts
```

### Deploy to Mainnet

⚠️ **IMPORTANT**: Complete security audit before mainnet deployment!

```bash
# Using Makefile (recommended - includes safety checks)
make config-mainnet
make deploy-mainnet    # Will prompt for confirmation

# Or manually
# Configure for mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Use multi-sig wallet for production
solana config set --keypair ~/.config/solana/mainnet-multisig.json

# Deploy with upgrade authority
anchor deploy --provider.cluster mainnet

# Transfer upgrade authority to multi-sig
solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority <MULTISIG_ADDRESS>
```

### Other Useful Commands

```bash
make help              # Show all available commands
make show-config       # Display current Solana configuration
make balance           # Check wallet balance
make show-program-ids  # Display program IDs
make logs-devnet       # Stream devnet logs
make clean             # Clean build artifacts
```

## 📋 Program IDs

### Devnet

```
zk-pool: Hza5rjYmJnoYsjsgsuxLkyxLoWVo6RCUZxCB3x17v8qz
noirwire-contracts: 6vySUQGyA67t7UtXKuauvn5QHZscj9fG26SZegq7UnCf
```

### Mainnet

```
(TBD - Deploy after audit)
```

## 🔑 Instructions

### Initialize Pool

```typescript
await program.methods
  .initialize(
    merkleDepth, // 20 (supports 1M notes)
    rootWindow, // 64 (recent roots)
    abiHash // Hash of ABI specification
  )
  .accounts({
    config: configPda,
    admin: adminPublicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

### Set Verification Key

```typescript
await program.methods
  .setVerificationKey(
    circuit, // 0=shield, 1=transfer, 2=unshield
    vkData, // Serialized VK from circom
    vkHash // SHA256(vkData)
  )
  .accounts({
    config: configPda,
    vkAccount: vkPda,
    admin: adminPublicKey,
  })
  .rpc();
```

### Submit Shield Proof (Deposit)

```typescript
await program.methods
  .submitShield(
    proofBytes, // 256 bytes (A+B+C)
    publicInputs // [commitment]
  )
  .accounts({
    config: configPda,
    vkAccount: shieldVkPda,
    user: userPublicKey,
  })
  .rpc();
```

### Submit Transfer Proof (Private Transfer)

```typescript
await program.methods
  .submitTransfer(
    proofBytes, // 256 bytes
    publicInputs // [root, nullifier, newCommitment, fee]
  )
  .accounts({
    config: configPda,
    vkAccount: transferVkPda,
    roots: rootsPda,
    nullifiers: nullifiersPda,
    user: userPublicKey,
  })
  .rpc();
```

### Submit Unshield Proof (Withdrawal)

```typescript
await program.methods
  .submitUnshield(
    proofBytes, // 256 bytes
    publicInputs // [root, nullifier, recipientLo, recipientHi, amount, fee]
  )
  .accounts({
    config: configPda,
    vkAccount: unshieldVkPda,
    roots: rootsPda,
    nullifiers: nullifiersPda,
    treasury: treasuryPda,
    recipient: recipientPublicKey,
    user: userPublicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

## 🔐 Security Features

### Implemented

✅ **VK Hash Validation**: Prevents verification key swapping attacks  
✅ **ABI Hash Checking**: Ensures encoding consistency  
✅ **Pause Mechanism**: Emergency stop for all submit\_\* operations  
✅ **Nullifier Capacity Limits**: Prevents DoS via storage exhaustion (100k per shard)  
✅ **Safe CPI Transfers**: Treasury uses System Program CPI with PDA signing  
✅ **Address Round-Trip Validation**: Catches malformed recipient encoding  
✅ **Domain Separation**: Distinct tags for commitments and nullifiers  
✅ **Root Replay Protection**: Only accepts recent roots (64-window)

### Pending

⏳ **Real Verifier Integration**: Replace placeholder with Light Protocol CPI  
⏳ **Golden Proof Tests**: Test with actual circuit-generated proofs  
⏳ **Security Audit**: Professional review before mainnet  
⏳ **Multi-sig Admin**: Decentralized governance

## 📊 Performance

### Compute Units (Estimated)

- `initialize`: ~100k CU
- `set_verification_key`: ~10k CU
- `add_root`: ~5k CU
- `submit_shield`: ~200k CU
- `submit_transfer`: ~250k CU
- `submit_unshield`: ~250k CU

### Storage Costs

- PoolConfig: ~0.0012 SOL
- VK accounts (3): ~0.027 SOL total
- RootsAccount: ~0.018 SOL
- NullifiersAccount: ~2.5 SOL (10k capacity)

## 🔧 Configuration

### Environment Variables

Create a `.env` file:

```bash
# Solana RPC
SOLANA_RPC_URL=https://api.devnet.solana.com

# Program IDs
ZK_POOL_PROGRAM_ID=Hza5rjYmJnoYsjsgsuxLkyxLoWVo6RCUZxCB3x17v8qz
NOIRWIRE_PROGRAM_ID=6vySUQGyA67t7UtXKuauvn5QHZscj9fG26SZegq7UnCf

# Admin wallet (array of bytes)
ADMIN_PRIVATE_KEY=[...]
```

### Anchor.toml

```toml
[programs.devnet]
zk_pool = "Hza5rjYmJnoYsjsgsuxLkyxLoWVo6RCUZxCB3x17v8qz"

[provider]
cluster = "devnet"
wallet = "~/.config/solana/devnet-wallet.json"
```

## 📚 Documentation

- **[ABI Specification](./zk-circuits/ABI.md)**: Complete encoding specification
- **[Circuit Documentation](./zk-circuits/README.md)**: ZK circuit details
- **[API Reference](./docs/API.md)**: Full instruction reference
- **[Integration Guide](./docs/INTEGRATION.md)**: How to integrate NoirWire
- **[Security Model](./docs/SECURITY.md)**: Threat model and mitigations

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development Workflow

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes and test
anchor test

# 3. Check formatting
cargo fmt --all
yarn lint:fix

# 4. Commit with conventional commits
git commit -m "feat: add new feature"

# 5. Push and create PR
git push origin feature/my-feature
```

## 🐛 Known Issues & Limitations

### Current Limitations

- **Placeholder Verifier**: Uses structural validation only (NOT cryptographically secure)
- **Single Nullifier Shard**: Supports ~100k notes (production needs sharding)
- **SOL Only**: SPL token support coming soon
- **Single Admin**: Multi-sig governance needed for production

### Roadmap

- [ ] Integrate Light Protocol's Groth16 verifier
- [ ] Implement nullifier sharding (millions of notes)
- [ ] Add SPL token support
- [ ] Multi-sig admin governance
- [ ] Compressed account storage
- [ ] Batched proof verification
- [ ] Mobile SDK
- [ ] Web wallet integration

## 📞 Support

- **Discord**: [Join our community](#)
- **Twitter**: [@NoirWire](#)
- **Email**: security@noirwire.io
- **Bug Reports**: [GitHub Issues](https://github.com/yourusername/noirwire-contracts/issues)

## ⚖️ License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Railgun**: Inspiration for privacy pool design
- **Light Protocol**: Solana ZK infrastructure
- **Circom**: ZK circuit framework
- **Anchor**: Solana development framework

---

**⚠️ DISCLAIMER**: This is experimental software. Use at your own risk. Always verify proofs and audit code before using in production.

**🔒 SECURITY**: If you discover a security vulnerability, please email security@noirwire.io. Do not create a public issue.

---

Built with ❤️ for privacy on Solana
