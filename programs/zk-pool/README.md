# ZK Pool - Solana Privacy Pool

A production-ready Solana privacy pool using Groth16 zero-knowledge proofs on the BN254 curve. Enables shielded transactions with on-chain proof verification.

## Architecture

### Circuits

Three circuits power the privacy pool:

1. **Shield** - Deposit funds into the shielded pool

   - Public inputs: `commitment`
   - Creates a new shielded note

2. **Transfer** - Private transfer within the pool

   - Public inputs: `root`, `nullifier`, `new_commitment`, `fee`
   - Spends one note, creates another

3. **Unshield** - Withdraw funds from the pool
   - Public inputs: `root`, `nullifier`, `recipient_lo`, `recipient_hi`, `amount`, `fee`
   - Burns a shielded note, pays public recipient

See `/zk-circuits/ABI.md` for full specification.

### On-chain Accounts (PDAs)

- **PoolConfig** (`["config"]`) - Global configuration and admin
- **VerificationKeyAccount** (`["vk", circuit_id]`) - Stored VKs for each circuit
- **RootsAccount** (`["roots"]`) - Ring buffer of recent Merkle roots
- **NullifiersAccount** (`["nullifiers", shard]`) - Spent nullifier tracking
- **Treasury** (`["treasury"]`) - Pool funds (SOL/SPL tokens)

### Instructions

- `initialize` - Setup pool with merkle depth, root window, ABI hash
- `set_verification_key` - Upload/update VK for a circuit (admin)
- `add_root` - Add new Merkle root to history (admin/relayer)
- `submit_shield` - Verify shield proof and emit commitment
- `submit_transfer` - Verify transfer, check root, prevent nullifier reuse
- `submit_unshield` - Verify unshield, transfer funds to recipient

## Security Model

### Proof Verification

**⚠️ IMPORTANT**: The current implementation uses **placeholder verification** for development. In production, you MUST integrate a real Groth16 verifier:

- **Option 1**: Use [Light Protocol](https://github.com/Lightprotocol/light-protocol) verifier (recommended)
- **Option 2**: Implement custom verifier using Solana bn254 syscalls (when available)
- **Option 3**: Use off-chain verification with trusted relayers

See `src/verifier.rs` for detailed integration notes.

### Privacy Guarantees

- **Unlinkability**: Commitments and nullifiers are cryptographically unlinkable
- **Hiding**: Note amounts and recipients are hidden in shielded transfers
- **Binding**: Proofs enforce value conservation and Merkle inclusion
- **Non-malleability**: Groth16 proofs are non-malleable

### Known Limitations

1. **Recipient encoding**: Uses two-limb (128-bit) encoding for 32-byte addresses
2. **Merkle tree**: Off-chain tree maintenance required (on-chain only stores roots)
3. **Nullifier storage**: Linear search in MVP (switch to sharding for production)
4. **Fee privacy**: Fees are public (consider future privacy upgrades)

## Setup

### Prerequisites

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor --tag v0.31.1 anchor-cli

# Install Node dependencies
yarn install
```

### Build

```bash
# Build the program
anchor build

# Generate TypeScript types
anchor idl parse -f programs/zk-pool/src/lib.rs -o target/idl/zk_pool.json
```

## Usage

### 1. Deploy to Devnet

```bash
# Configure Solana for devnet
solana config set --url devnet

# Generate a new keypair (if needed)
solana-keygen new -o ~/.config/solana/id.json

# Airdrop SOL for deployment
solana airdrop 2

# Deploy
anchor deploy --provider.cluster devnet
```

### 2. Initialize Pool

```bash
# Run tests (includes initialization)
anchor test --skip-local-validator

# Or initialize manually via script
ts-node scripts/initialize-pool.ts
```

### 3. Upload Verification Keys

```bash
# Export VKs from circuit builds
ts-node scripts/export-vk.ts

# Upload to Solana
ts-node scripts/publish-vk.ts
```

### 4. Submit Proofs

```bash
# Submit golden proofs from zk-circuits
ts-node scripts/submit-golden.ts
```

## Development

### Running Tests

```bash
# Full test suite
anchor test

# Specific test file
anchor test tests/zk-pool.spec.ts

# With logs
anchor test -- --features anchor-debug
```

### Project Structure

```
programs/zk-pool/
├── src/
│   ├── lib.rs              # Program entry point
│   ├── constants.rs        # Constants and PDAs seeds
│   ├── errors.rs           # Error codes
│   ├── events.rs           # Event definitions
│   ├── state.rs            # Account structures
│   ├── verifier.rs         # Proof verification logic
│   └── instructions/       # Instruction handlers
│       ├── initialize.rs
│       ├── set_verification_key.rs
│       ├── add_root.rs
│       ├── submit_shield.rs
│       ├── submit_transfer.rs
│       └── submit_unshield.rs
├── Cargo.toml
└── Xargo.toml

scripts/
├── export-vk.ts           # Export VKs from circuits
├── publish-vk.ts          # Upload VKs to Solana
└── submit-golden.ts       # Submit test proofs

tests/
└── zk-pool.spec.ts        # Integration tests
```

## Integration Guide

### For Frontend Developers

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ZkPool } from "./target/types/zk_pool";

const program = anchor.workspace.ZkPool as Program<ZkPool>;

// Submit shield proof
const tx = await program.methods
  .submitShield(proofBytes, publicInputs)
  .accounts({
    config: configPda,
    vkAccount: shieldVkPda,
    user: wallet.publicKey,
  })
  .rpc();
```

### Public Input Encoding

**Shield**: `[commitment]`

**Transfer**: `[root, nullifier, new_commitment, fee]`

**Unshield**: `[root, nullifier, recipient_lo, recipient_hi, amount, fee]`

All fields are `[u8; 32]` in little-endian format. See `/zk-circuits/ABI.md` for details.

### Recipient Address Encoding

Solana addresses are 32 bytes. We split them into two 16-byte limbs:

```typescript
function encodeRecipient(address: PublicKey): { lo: Buffer; hi: Buffer } {
  const bytes = address.toBuffer();
  const lo = bytes.slice(0, 16);
  const hi = bytes.slice(16, 32);
  return { lo, hi };
}
```

## Events

The program emits events for indexing:

- `Initialized` - Pool created
- `VerificationKeySet` - VK uploaded
- `RootAdded` - New Merkle root
- `NewCommitment` - Note created
- `NullifierSpent` - Note spent
- `Unshielded` - Funds withdrawn

Build an indexer to track pool state and enable efficient wallet queries.

## Deployment Checklist

- [ ] Build and test circuits locally
- [ ] Export verification keys
- [ ] Deploy program to devnet
- [ ] Initialize pool with correct parameters
- [ ] Upload all verification keys
- [ ] Verify with golden proofs
- [ ] **CRITICAL**: Replace placeholder verifier with production implementation
- [ ] Set up treasury funding
- [ ] Deploy indexer for events
- [ ] Audit smart contract code
- [ ] Test on mainnet-beta with small amounts

## Contributing

When adding features:

1. Update ABI.md if changing public inputs
2. Bump ABI version in constants.rs
3. Regenerate circuits and VKs
4. Update tests
5. Document breaking changes

## License

MIT

## References

- [Groth16 Paper](https://eprint.iacr.org/2016/260.pdf)
- [Circom Documentation](https://docs.circom.io/)
- [Anchor Documentation](https://www.anchor-lang.com/)
- [Light Protocol](https://github.com/Lightprotocol/light-protocol)
- [BN254 Curve Spec](https://hackmd.io/@jpw/bn254)

## Support

For issues or questions:

1. Check `/zk-circuits/README.md` for circuit documentation
2. Review `/zk-circuits/ABI.md` for public input specification
3. See `src/verifier.rs` for proof verification notes
4. Open an issue with detailed logs and reproduction steps
