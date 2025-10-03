# Negative Test Vectors

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
```bash
node scripts/test_negative.js
```
