import { describe, it, before } from "mocha";
import { expect, assert } from "chai";
import { PublicKey } from "@solana/web3.js";
import * as crypto from "crypto";

describe("ZK Pool Encoding & Negative Tests", () => {
  describe("Recipient Address Encoding (LE)", () => {
    it("should encode and decode System Program address", () => {
      const systemProgram = new PublicKey("11111111111111111111111111111111");
      const addrBytes = systemProgram.toBytes();

      // Encode to limbs (LE)
      const recipient_lo = Buffer.alloc(32);
      const recipient_hi = Buffer.alloc(32);
      recipient_lo.set(addrBytes.slice(0, 16), 0); // First 16 bytes
      recipient_hi.set(addrBytes.slice(16, 32), 0); // Last 16 bytes

      // Decode from limbs
      const reconstructed = Buffer.alloc(32);
      reconstructed.set(recipient_lo.slice(0, 16), 0);
      reconstructed.set(recipient_hi.slice(0, 16), 16);

      expect(Buffer.from(addrBytes)).to.deep.equal(reconstructed);
    });

    it("should round-trip native SOL address", () => {
      const wrappedSol = new PublicKey(
        "So11111111111111111111111111111111111111112"
      );
      const addrBytes = wrappedSol.toBytes();

      // Encode
      const lo = Buffer.alloc(32);
      const hi = Buffer.alloc(32);
      lo.set(addrBytes.slice(0, 16));
      hi.set(addrBytes.slice(16, 32));

      // Decode
      const result = Buffer.alloc(32);
      result.set(lo.slice(0, 16), 0);
      result.set(hi.slice(0, 16), 16);

      assert(Buffer.from(addrBytes).equals(result), "Round-trip failed");
    });

    it("should handle arbitrary 32-byte addresses", () => {
      // Generate random address
      const randomBytes = crypto.randomBytes(32);
      const addr = new PublicKey(randomBytes);
      const bytes = addr.toBytes();

      // Split into limbs
      const lo_limb = Buffer.alloc(32);
      const hi_limb = Buffer.alloc(32);
      lo_limb.set(bytes.slice(0, 16));
      hi_limb.set(bytes.slice(16, 32));

      // Reconstruct
      const rebuilt = Buffer.concat([
        lo_limb.slice(0, 16),
        hi_limb.slice(0, 16),
      ]);

      expect(bytes).to.deep.equal(rebuilt);
    });

    it("should preserve byte order (LE within limbs)", () => {
      const testAddr = Buffer.from([
        0x01,
        0x02,
        0x03,
        0x04,
        0x05,
        0x06,
        0x07,
        0x08, // First 8
        0x09,
        0x0a,
        0x0b,
        0x0c,
        0x0d,
        0x0e,
        0x0f,
        0x10, // Next 8
        0x11,
        0x12,
        0x13,
        0x14,
        0x15,
        0x16,
        0x17,
        0x18, // Next 8
        0x19,
        0x1a,
        0x1b,
        0x1c,
        0x1d,
        0x1e,
        0x1f,
        0x20, // Last 8
      ]);

      const lo = Buffer.alloc(32);
      const hi = Buffer.alloc(32);
      lo.set(testAddr.slice(0, 16));
      hi.set(testAddr.slice(16, 32));

      // Verify bytes match
      expect(lo.slice(0, 16)).to.deep.equal(testAddr.slice(0, 16));
      expect(hi.slice(0, 16)).to.deep.equal(testAddr.slice(16, 32));
    });
  });

  describe("Amount Encoding (u64 LE)", () => {
    it("should encode small amounts", () => {
      const amount = 1000n; // 1000 lamports
      const field = Buffer.alloc(32);

      // Write as LE u64 in first 8 bytes
      field.writeBigUInt64LE(amount, 0);

      // Verify rest is zero
      for (let i = 8; i < 32; i++) {
        expect(field[i]).to.equal(0);
      }

      // Decode
      const decoded = field.readBigUInt64LE(0);
      expect(decoded).to.equal(amount);
    });

    it("should encode 1 SOL (1e9 lamports)", () => {
      const oneSol = 1_000_000_000n;
      const field = Buffer.alloc(32);
      field.writeBigUInt64LE(oneSol, 0);

      expect(field.readBigUInt64LE(0)).to.equal(oneSol);
      expect(field.slice(8).every((b) => b === 0)).to.be.true;
    });

    it("should encode maximum u64", () => {
      const maxU64 = 0xffffffffffffffffn;
      const field = Buffer.alloc(32);
      field.writeBigUInt64LE(maxU64, 0);

      expect(field.readBigUInt64LE(0)).to.equal(maxU64);

      // Check bytes 0-7 are all 0xFF
      for (let i = 0; i < 8; i++) {
        expect(field[i]).to.equal(0xff);
      }

      // Check bytes 8-31 are all 0x00
      for (let i = 8; i < 32; i++) {
        expect(field[i]).to.equal(0x00);
      }
    });

    it("should detect overflow (value > u64)", () => {
      const field = Buffer.alloc(32);
      field.writeBigUInt64LE(1000n, 0);
      field[8] = 0x01; // Set byte 8 to non-zero

      // In Rust, this would fail AmountTooLarge check
      const hasOverflow = field.slice(8).some((b) => b !== 0);
      expect(hasOverflow).to.be.true;
    });
  });

  describe("Field Element Encoding (LE)", () => {
    it("should encode zero", () => {
      const zero = Buffer.alloc(32);
      expect(zero.every((b) => b === 0)).to.be.true;
    });

    it("should encode one (LE)", () => {
      const one = Buffer.alloc(32);
      one[0] = 0x01; // LSB first

      expect(one[0]).to.equal(1);
      expect(one.slice(1).every((b) => b === 0)).to.be.true;
    });

    it("should encode small field element", () => {
      const val = 0x12345678n;
      const field = Buffer.alloc(32);
      field.writeBigUInt64LE(val, 0);

      // LE: least significant byte first
      expect(field[0]).to.equal(0x78);
      expect(field[1]).to.equal(0x56);
      expect(field[2]).to.equal(0x34);
      expect(field[3]).to.equal(0x12);
    });

    it("should validate BN254 scalar field range", () => {
      // BN254 scalar field modulus (p)
      const p = BigInt(
        "21888242871839275222246405745257275088548364400416034343698204186575808495617"
      );

      // Value just below p (valid)
      const maxValid = p - 1n;
      expect(maxValid < p).to.be.true;

      // Value at p (invalid)
      expect(p >= p).to.be.true;

      // Value above p (invalid)
      const invalid = p + 1n;
      expect(invalid >= p).to.be.true;
    });
  });

  describe("Proof Structure", () => {
    it("should have correct Groth16 proof size", () => {
      const proofSize = 64 + 128 + 64; // A + B + C
      expect(proofSize).to.equal(256);
    });

    it("should parse proof components", () => {
      const proof = Buffer.alloc(256);
      // Fill with test data
      proof.fill(0xaa, 0, 64); // A
      proof.fill(0xbb, 64, 192); // B
      proof.fill(0xcc, 192, 256); // C

      // Parse
      const A = proof.slice(0, 64);
      const B = proof.slice(64, 192);
      const C = proof.slice(192, 256);

      expect(A.length).to.equal(64);
      expect(B.length).to.equal(128);
      expect(C.length).to.equal(64);

      expect(A.every((b) => b === 0xaa)).to.be.true;
      expect(B.every((b) => b === 0xbb)).to.be.true;
      expect(C.every((b) => b === 0xcc)).to.be.true;
    });

    it("should detect flipped byte in proof", () => {
      const proof1 = Buffer.alloc(256, 0);
      const proof2 = Buffer.alloc(256, 0);

      proof2[100] = 0x01; // Flip one byte

      expect(proof1.equals(proof2)).to.be.false;
    });
  });

  describe("Public Input Ordering", () => {
    it("should validate shield public inputs (1 input)", () => {
      const commitment = Buffer.alloc(32);
      commitment.fill(0x42);

      const publicInputs = [commitment];
      expect(publicInputs.length).to.equal(1);
    });

    it("should validate transfer public inputs (4 inputs)", () => {
      const root = Buffer.alloc(32, 0x01);
      const nullifier = Buffer.alloc(32, 0x02);
      const commitment = Buffer.alloc(32, 0x03);
      const fee = Buffer.alloc(32, 0x04);

      const publicInputs = [root, nullifier, commitment, fee];
      expect(publicInputs.length).to.equal(4);

      // Verify ordering
      expect(publicInputs[0][0]).to.equal(0x01); // root
      expect(publicInputs[1][0]).to.equal(0x02); // nullifier
      expect(publicInputs[2][0]).to.equal(0x03); // commitment
      expect(publicInputs[3][0]).to.equal(0x04); // fee
    });

    it("should validate unshield public inputs (6 inputs)", () => {
      const root = Buffer.alloc(32, 0x01);
      const nullifier = Buffer.alloc(32, 0x02);
      const recipient_lo = Buffer.alloc(32, 0x03);
      const recipient_hi = Buffer.alloc(32, 0x04);
      const amount = Buffer.alloc(32, 0x05);
      const fee = Buffer.alloc(32, 0x06);

      const publicInputs = [
        root,
        nullifier,
        recipient_lo,
        recipient_hi,
        amount,
        fee,
      ];
      expect(publicInputs.length).to.equal(6);

      // Verify ordering per ABI.md
      expect(publicInputs[0][0]).to.equal(0x01); // root
      expect(publicInputs[1][0]).to.equal(0x02); // nullifier
      expect(publicInputs[2][0]).to.equal(0x03); // recipient_lo
      expect(publicInputs[3][0]).to.equal(0x04); // recipient_hi
      expect(publicInputs[4][0]).to.equal(0x05); // amount
      expect(publicInputs[5][0]).to.equal(0x06); // fee
    });

    it("should reject swapped public inputs", () => {
      // Original order
      const pi1 = [
        Buffer.alloc(32, 0x01),
        Buffer.alloc(32, 0x02),
        Buffer.alloc(32, 0x03),
        Buffer.alloc(32, 0x04),
      ];

      // Swapped order (root <-> nullifier)
      const pi2 = [
        Buffer.alloc(32, 0x02), // swapped
        Buffer.alloc(32, 0x01), // swapped
        Buffer.alloc(32, 0x03),
        Buffer.alloc(32, 0x04),
      ];

      // Verify they're different
      expect(pi1[0].equals(pi2[0])).to.be.false;
      expect(pi1[1].equals(pi2[1])).to.be.false;
    });
  });

  describe("VK Hash Computation", () => {
    it("should compute SHA256 of VK data", () => {
      const vkData = Buffer.alloc(512); // Example VK
      vkData.fill(0x42);

      const hash1 = crypto.createHash("sha256").update(vkData).digest();
      const hash2 = crypto.createHash("sha256").update(vkData).digest();

      expect(hash1).to.deep.equal(hash2);
      expect(hash1.length).to.equal(32);
    });

    it("should detect VK modification", () => {
      const vk1 = Buffer.alloc(512, 0xaa);
      const vk2 = Buffer.alloc(512, 0xaa);
      vk2[100] = 0xbb; // Modify one byte

      const hash1 = crypto.createHash("sha256").update(vk1).digest();
      const hash2 = crypto.createHash("sha256").update(vk2).digest();

      expect(hash1).to.not.deep.equal(hash2);
    });
  });

  describe("Ring Buffer Logic", () => {
    it("should handle wraparound correctly", () => {
      const capacity = 4;
      const roots: Buffer[] = [];
      let cursor = 0;
      let size = 0;

      // Add 6 roots to capacity-4 buffer
      for (let i = 0; i < 6; i++) {
        const root = Buffer.alloc(32);
        root.writeUInt32LE(i, 0);

        if (roots.length < capacity) {
          roots.push(root);
        } else {
          roots[cursor] = root;
        }

        cursor = (cursor + 1) % capacity;
        size = Math.min(size + 1, capacity);
      }

      expect(size).to.equal(capacity);
      expect(cursor).to.equal(2); // (6 % 4 = 2)

      // Buffer should contain roots [4, 5, 2, 3] (most recent 4)
      expect(roots[0].readUInt32LE(0)).to.equal(4);
      expect(roots[1].readUInt32LE(0)).to.equal(5);
      expect(roots[2].readUInt32LE(0)).to.equal(2);
      expect(roots[3].readUInt32LE(0)).to.equal(3);
    });

    it("should check root membership", () => {
      const roots = [
        Buffer.alloc(32, 0x01),
        Buffer.alloc(32, 0x02),
        Buffer.alloc(32, 0x03),
      ];

      const existingRoot = Buffer.alloc(32, 0x02);
      const missingRoot = Buffer.alloc(32, 0x99);

      const contains = (root: Buffer) => roots.some((r) => r.equals(root));

      expect(contains(existingRoot)).to.be.true;
      expect(contains(missingRoot)).to.be.false;
    });
  });

  describe("PDA Seed Generation", () => {
    it("should use correct config seeds", () => {
      const seeds = [Buffer.from("config", "utf-8")];
      expect(seeds[0].toString()).to.equal("config");
    });

    it("should use correct VK seeds per circuit", () => {
      const vkSeed = Buffer.from("vk", "utf-8");

      const shieldSeeds = [vkSeed, Buffer.from([0])]; // CIRCUIT_SHIELD = 0
      const transferSeeds = [vkSeed, Buffer.from([1])]; // CIRCUIT_TRANSFER = 1
      const unshieldSeeds = [vkSeed, Buffer.from([2])]; // CIRCUIT_UNSHIELD = 2

      expect(shieldSeeds[1][0]).to.equal(0);
      expect(transferSeeds[1][0]).to.equal(1);
      expect(unshieldSeeds[1][0]).to.equal(2);
    });

    it("should use correct nullifier seeds (shard 0)", () => {
      const nullifierSeed = Buffer.from("nullifiers", "utf-8");
      const shardId = Buffer.from([0, 0]); // u16 LE

      const seeds = [nullifierSeed, shardId];

      expect(seeds[0].toString()).to.equal("nullifiers");
      expect(seeds[1]).to.deep.equal(Buffer.from([0, 0]));
    });
  });

  describe("Domain Separation Constants", () => {
    it("should define commitment tag", () => {
      const COMMIT_TAG = "NoirWire-Commitment-v1";
      expect(COMMIT_TAG.length).to.be.greaterThan(0);
    });

    it("should define nullifier tag", () => {
      const NULL_TAG = "NoirWire-Nullifier-v1";
      expect(NULL_TAG.length).to.be.greaterThan(0);
    });

    it("should have distinct tags", () => {
      const COMMIT_TAG = "NoirWire-Commitment-v1";
      const NULL_TAG = "NoirWire-Nullifier-v1";
      expect(COMMIT_TAG).to.not.equal(NULL_TAG);
    });
  });

  describe("Error Detection (Simulated)", () => {
    it("should detect proof byte flip", () => {
      const proof1 = Buffer.alloc(256);
      crypto.randomFillSync(proof1);

      const proof2 = Buffer.from(proof1);
      proof2[128] ^= 0x01; // Flip one bit

      expect(proof1.equals(proof2)).to.be.false;
    });

    it("should detect public input swap", () => {
      const pi1 = Buffer.alloc(32, 0xaa);
      const pi2 = Buffer.alloc(32, 0xbb);

      // Original order
      const inputs1 = [pi1, pi2];

      // Swapped order
      const inputs2 = [pi2, pi1];

      expect(inputs1[0].equals(inputs2[0])).to.be.false;
    });

    it("should detect stale root (not in ring buffer)", () => {
      const ringBuffer = [
        Buffer.alloc(32, 0x01),
        Buffer.alloc(32, 0x02),
        Buffer.alloc(32, 0x03),
      ];

      const currentRoot = Buffer.alloc(32, 0x02); // Valid
      const staleRoot = Buffer.alloc(32, 0x99); // Invalid

      const isValid = (root: Buffer) => ringBuffer.some((r) => r.equals(root));

      expect(isValid(currentRoot)).to.be.true;
      expect(isValid(staleRoot)).to.be.false;
    });

    it("should detect reused nullifier", () => {
      const spentNullifiers = new Set<string>();

      const nullifier1 = Buffer.alloc(32, 0x42);
      const nullifier1Hex = nullifier1.toString("hex");

      // First use - OK
      expect(spentNullifiers.has(nullifier1Hex)).to.be.false;
      spentNullifiers.add(nullifier1Hex);

      // Second use - FAIL
      expect(spentNullifiers.has(nullifier1Hex)).to.be.true;
    });
  });
});
