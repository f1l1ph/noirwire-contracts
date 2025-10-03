# ZK Circuits ABI Specification

This document defines the **public signal ordering** for each circuit. These are the values that will be exposed on-chain and verified by the Solana verifier program.

**CRITICAL**: The order of public signals is locked and must remain stable across all versions to ensure compatibility with the on-chain verifier.

---

## Circuit: `shield`

**Purpose**: Create a new shielded note commitment (deposit into shielded pool).

### Public Signals (in order)

| Index | Name         | Type  | Description                                       |
| ----- | ------------ | ----- | ------------------------------------------------- |
| 0     | `commitment` | field | Poseidon hash of (recipient_pk, amount, blinding) |

### Private Inputs

- `recipient_pk`: Public key of note recipient
- `amount`: Note amount (integer, 0 ≤ amount < 2^64)
- `blinding`: Random blinding factor

### Constraints

- `0 ≤ amount < 2^64` (enforced by AmountRangeCheck)

### Example `public.json`

```json
["7234567890123456789012345678901234567890"]
```

---

## Circuit: `transfer`

**Purpose**: Spend one shielded note and create a new one (1-in/1-out private transfer).

### Public Signals (in order)

| Index | Name             | Type  | Description                          |
| ----- | ---------------- | ----- | ------------------------------------ |
| 0     | `root`           | field | Merkle root of the commitment tree   |
| 1     | `nullifier`      | field | Nullifier to prevent double-spending |
| 2     | `new_commitment` | field | Commitment of the new output note    |
| 3     | `fee`            | field | Transaction fee (currently 0)        |

### Private Inputs

- **Old note**: `secret_sk`, `old_recipient_pk`, `old_amount`, `old_blinding`, `note_id`
- **Merkle proof**: `merkle_path[20]`, `merkle_path_positions[20]`
- **New note**: `new_recipient_pk`, `new_amount`, `new_blinding`
- **Fee**: `fee`

### Constraints

- Old note commitment must exist in the Merkle tree (verified by inclusion proof)
- Nullifier = Poseidon(secret_sk, note_id)
- Value conservation: `old_amount = new_amount + fee`
- Range checks: `0 ≤ old_amount < 2^64`, `0 ≤ new_amount < 2^64`, `0 ≤ fee < 2^64`
- Fee validation: `fee ≤ old_amount`

### Example `public.json`

```json
[
  "12345678901234567890123456789012345678901234567890",
  "98765432109876543210987654321098765432109876543210",
  "11111111111111111111111111111111111111111111111111",
  "0"
]
```

---

## Circuit: `unshield`

**Purpose**: Spend a shielded note to pay a public L1 recipient (withdrawal from shielded pool).

### Public Signals (in order)

| Index | Name            | Type  | Description                                       |
| ----- | --------------- | ----- | ------------------------------------------------- |
| 0     | `root`          | field | Merkle root of the commitment tree                |
| 1     | `nullifier`     | field | Nullifier to prevent double-spending              |
| 2     | `recipient_lo`  | field | Lower 128 bits of recipient address (bytes 0-15)  |
| 3     | `recipient_hi`  | field | Upper 128 bits of recipient address (bytes 16-31) |
| 4     | `public_amount` | field | Amount to send to recipient                       |
| 5     | `fee`           | field | Transaction fee (currently 0)                     |

### Private Inputs

- **Old note**: `secret_sk`, `old_recipient_pk`, `old_amount`, `old_blinding`, `note_id`
- **Merkle proof**: `merkle_path[20]`, `merkle_path_positions[20]`
- **Public outputs**: `recipient_lo`, `recipient_hi`, `public_amount`, `fee`

### Constraints

- Old note commitment must exist in the Merkle tree
- Nullifier = Poseidon(secret_sk, note_id)
- Value conservation: `old_amount = public_amount + fee`
- Range checks: `0 ≤ old_amount < 2^64`, `0 ≤ public_amount < 2^64`, `0 ≤ fee < 2^64`
- Recipient encoding: `0 ≤ recipient_lo < 2^128`, `0 ≤ recipient_hi < 2^128`
- Fee validation: `fee ≤ old_amount`

### Recipient Address Encoding

**Breaking Change in v2.0.0**: The `public_recipient` field has been replaced with two fields for proper 32-byte address encoding.

Solana addresses are 32 bytes (256 bits). Since BN254 field elements are ~254 bits, we cannot safely represent the full address in a single field. We split the address into two 128-bit limbs:

- **recipient_lo**: Lower 16 bytes (bits 0-127)
- **recipient_hi**: Upper 16 bytes (bits 128-255)

**On-chain reconstruction**:

```rust
let address_bytes: [u8; 32] = [
    // recipient_lo bytes (little-endian)
    ...recipient_lo.to_le_bytes(),
    // recipient_hi bytes (little-endian)
    ...recipient_hi.to_le_bytes(),
];
let recipient_pubkey = Pubkey::new_from_array(address_bytes);
```

**Off-chain encoding** (TypeScript):

```typescript
function encodeRecipient(addressBytes: Uint8Array): { lo: bigint; hi: bigint } {
  const lo = BigInt(
    "0x" + Buffer.from(addressBytes.slice(0, 16)).toString("hex")
  );
  const hi = BigInt(
    "0x" + Buffer.from(addressBytes.slice(16, 32)).toString("hex")
  );
  return { lo, hi };
}
```

### Example `public.json`

```json
[
  "12345678901234567890123456789012345678901234567890",
  "98765432109876543210987654321098765432109876543210",
  "123456789012345678901234567890123456",
  "987654321098765432109876543210987654",
  "1000",
  "0"
]
```

---

## Notes

### Field Element Encoding

All values are field elements in the BN254 scalar field:

- Field size: ~254 bits
- Max value: 21888242871839275222246405745257275088548364400416034343698204186575808495617

### Amount Handling

- Amounts are **integers** (no floating point in-circuit)
- Off-chain code must handle decimal conversions (e.g., 1 SOL = 1,000,000,000 lamports)
- Range checks enforce: **0 ≤ amount < 2^64** (prevents overflow attacks)

### Nullifier Specification

**EXPLICIT DEFINITION**: `nullifier = Poseidon(secret_sk, note_id)`

Where:

- `secret_sk`: Secret key of note owner (proves ownership)
- `note_id`: Unique identifier per note (e.g., Merkle leaf index or unique salt)

**Security Properties**:

- Deterministic: Same (secret_sk, note_id) → same nullifier
- Unique: Different notes → different nullifiers
- Hiding: Cannot derive secret_sk or note_id from nullifier
- Unlinkable: Cannot link nullifier to original commitment

**On-Chain Storage**:

- Each nullifier must be stored on-chain to prevent double-spending
- Nullifier set grows monotonically
- Duplicate nullifier → transaction rejected

### Merkle Tree

- Depth: 20 levels (supports ~1,048,576 leaves)
- Hash function: Poseidon(2) for internal nodes
- Leaves: Note commitments
- On-chain program maintains current root(s)

### Fee Handling

Fees are now **validated** to prevent attacks:

- Fee must satisfy: `0 ≤ fee ≤ old_amount`
- Enforced by FeeCheck template using LessEqThan comparator
- Value conservation still applies: `old_amount = new_amount + fee` (transfer) or `old_amount = public_amount + fee` (unshield)

Future versions will implement:

- Fee extraction to specified recipient
- Configurable fee rates
- Fee privacy (current limitation: fees are public)

### Poseidon Hash Specification

All Poseidon hashes use the following configuration:

- **Field**: BN254 scalar field
- **Arity**: Specified per use case
  - Commitment: Poseidon(3) - inputs: [recipient_pk, amount, blinding]
  - Nullifier: Poseidon(2) - inputs: [secret_sk, note_id]
  - Merkle tree: Poseidon(2) - inputs: [left, right]
- **Security**: 128-bit security level
- **Implementation**: circomlib Poseidon template

---

## Breaking Changes

### Version 2.0.0 (October 3, 2025)

**Unshield Circuit ABI Change**:

**Before (v1.0.0)**:

```
[root, nullifier, public_recipient, public_amount, fee]
```

**After (v2.0.0)**:

```
[root, nullifier, recipient_lo, recipient_hi, public_amount, fee]
```

**Impact**:

- **BREAKING CHANGE**: Public signal count increased from 5 to 6
- On-chain verifier must be updated to expect 6 public inputs
- Off-chain code must split recipient address into two limbs
- Old proofs (v1.0.0) are incompatible with new verifier

**Migration Guide**:

1. Update on-chain program to parse 6 public inputs for unshield
2. Update off-chain prover to encode recipient as (recipient_lo, recipient_hi)
3. Test with new test vectors that include proper recipient encoding
4. Regenerate all trusted setup artifacts (zkeys, vkeys)

**Added Constraints (v2.0.0)**:

- Range checks on all amounts (prevents overflow)
- Fee validation (prevents fee > amount attacks)
- Recipient encoding validation (ensures valid 32-byte addresses)

These constraints increase circuit size but are **critical** for security.

---

## Version History

| Version | Date       | Changes                                                                |
| ------- | ---------- | ---------------------------------------------------------------------- |
| 2.0.0   | 2025-10-03 | **BREAKING**: 2-field recipient encoding, range checks, fee validation |
| 1.0.0   | 2025-10-03 | Initial ABI specification (single-field recipient, no range checks)    |

---

## Compatibility

This ABI is designed for:

- **Curve**: BN254 (bn128)
- **Proof system**: Groth16
- **Target**: Solana on-chain verifier
- **Hash function**: Poseidon

Any changes to public signal order, count, or semantics constitute a **BREAKING CHANGE** and require a major version bump.

---

## Verification Key Export

Verification keys for on-chain integration can be exported using:

```bash
make export-vk
```

This generates Solana-friendly constants in `solana_export/`:

- `*_vk.json`: Full verification key
- `*_vk.rs`: Rust constants for Solana programs
- `*_vk.ts`: TypeScript definitions

See `solana_export/README.md` for usage instructions.
