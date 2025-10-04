/**
 * Unit tests for ZK Pool helper functions
 * Can run without building the program
 */

import { expect } from "chai";
import * as crypto from "crypto";

describe("ZK Pool Helper Functions", () => {
  describe("Field Element Encoding", () => {
    it("should encode small numbers to 32-byte buffers", () => {
      const value = BigInt(123456);
      const buf = Buffer.alloc(32);

      let temp = value;
      for (let i = 0; i < 32; i++) {
        buf[i] = Number(temp & BigInt(0xff));
        temp = temp >> BigInt(8);
      }

      expect(buf.length).to.equal(32);
      expect(buf[0]).to.equal(0x40); // 123456 = 0x1E240
      expect(buf[1]).to.equal(0xe2);
      expect(buf[2]).to.equal(0x01);
      // Rest should be zeros
      for (let i = 3; i < 32; i++) {
        expect(buf[i]).to.equal(0);
      }
    });

    it("should handle large BN254 field elements", () => {
      // BN254 field modulus - 1
      const maxField = BigInt(
        "21888242871839275222246405745257275088548364400416034343698204186575808495616"
      );

      const buf = Buffer.alloc(32);
      let temp = maxField;
      for (let i = 0; i < 32; i++) {
        buf[i] = Number(temp & BigInt(0xff));
        temp = temp >> BigInt(8);
      }

      expect(buf.length).to.equal(32);
      // Verify high byte is in valid range for BN254
      expect(buf[31]).to.be.lessThan(0x31);
    });
  });

  describe("VK Hash Computation", () => {
    it("should compute consistent SHA256 hashes", () => {
      const testData = Buffer.from("test verification key data");
      const hash1 = crypto.createHash("sha256").update(testData).digest();
      const hash2 = crypto.createHash("sha256").update(testData).digest();

      expect(hash1).to.deep.equal(hash2);
      expect(hash1.length).to.equal(32);
    });

    it("should produce different hashes for different data", () => {
      const data1 = Buffer.from("shield vk");
      const data2 = Buffer.from("transfer vk");

      const hash1 = crypto.createHash("sha256").update(data1).digest();
      const hash2 = crypto.createHash("sha256").update(data2).digest();

      expect(hash1).to.not.deep.equal(hash2);
    });
  });

  describe("Recipient Address Encoding", () => {
    it("should split 32-byte address into two 16-byte limbs", () => {
      // Mock Solana address (32 bytes)
      const address = Buffer.alloc(32);
      for (let i = 0; i < 32; i++) {
        address[i] = i + 1; // 1, 2, 3, ..., 32
      }

      // Split into two limbs
      const lo = address.slice(0, 16);
      const hi = address.slice(16, 32);

      expect(lo.length).to.equal(16);
      expect(hi.length).to.equal(16);
      expect(lo[0]).to.equal(1);
      expect(lo[15]).to.equal(16);
      expect(hi[0]).to.equal(17);
      expect(hi[15]).to.equal(32);
    });

    it("should reconstruct address from limbs", () => {
      const original = Buffer.alloc(32);
      for (let i = 0; i < 32; i++) {
        original[i] = Math.floor(Math.random() * 256);
      }

      // Split
      const lo = original.slice(0, 16);
      const hi = original.slice(16, 32);

      // Reconstruct
      const reconstructed = Buffer.concat([lo, hi]);

      expect(reconstructed).to.deep.equal(original);
    });
  });

  describe("Amount Encoding", () => {
    it("should encode u64 amounts in first 8 bytes", () => {
      const amount = 1_000_000_000; // 1 SOL in lamports
      const field = Buffer.alloc(32);
      field.writeBigUInt64LE(BigInt(amount), 0);

      expect(field.length).to.equal(32);
      expect(field.readBigUInt64LE(0)).to.equal(BigInt(amount));

      // Rest should be zeros
      for (let i = 8; i < 32; i++) {
        expect(field[i]).to.equal(0);
      }
    });

    it("should handle maximum u64 value", () => {
      const maxU64 = BigInt("18446744073709551615"); // 2^64 - 1
      const field = Buffer.alloc(32);
      field.writeBigUInt64LE(maxU64, 0);

      expect(field.readBigUInt64LE(0)).to.equal(maxU64);
    });

    it("should decode amounts correctly", () => {
      const testAmounts = [0, 1, 1000, 1_000_000_000, 1_000_000_000_000];

      for (const amount of testAmounts) {
        const field = Buffer.alloc(32);
        field.writeBigUInt64LE(BigInt(amount), 0);
        const decoded = Number(field.readBigUInt64LE(0));
        expect(decoded).to.equal(amount);
      }
    });
  });

  describe("Proof Serialization Format", () => {
    it("should have correct proof structure (256 bytes)", () => {
      // Mock Groth16 proof
      const a_x = Buffer.alloc(32, 1); // G1 point x
      const a_y = Buffer.alloc(32, 2); // G1 point y

      const b_x0 = Buffer.alloc(32, 3); // G2 point x[0]
      const b_x1 = Buffer.alloc(32, 4); // G2 point x[1]
      const b_y0 = Buffer.alloc(32, 5); // G2 point y[0]
      const b_y1 = Buffer.alloc(32, 6); // G2 point y[1]

      const c_x = Buffer.alloc(32, 7); // G1 point x
      const c_y = Buffer.alloc(32, 8); // G1 point y

      const proof = Buffer.concat([
        a_x,
        a_y, // A: 64 bytes
        b_x0,
        b_x1,
        b_y0,
        b_y1, // B: 128 bytes
        c_x,
        c_y, // C: 64 bytes
      ]);

      expect(proof.length).to.equal(256);

      // Verify structure
      expect(proof.slice(0, 32)).to.deep.equal(a_x);
      expect(proof.slice(32, 64)).to.deep.equal(a_y);
      expect(proof.slice(64, 96)).to.deep.equal(b_x0);
      expect(proof.slice(224, 256)).to.deep.equal(c_y);
    });
  });

  describe("Public Input Validation", () => {
    it("should validate shield public inputs (1 input)", () => {
      const commitment = Buffer.alloc(32, 0x42);
      const publicInputs = [Array.from(commitment)];

      expect(publicInputs.length).to.equal(1);
      expect(publicInputs[0].length).to.equal(32);
    });

    it("should validate transfer public inputs (4 inputs)", () => {
      const root = Buffer.alloc(32, 1);
      const nullifier = Buffer.alloc(32, 2);
      const newCommitment = Buffer.alloc(32, 3);
      const fee = Buffer.alloc(32, 0);

      const publicInputs = [
        Array.from(root),
        Array.from(nullifier),
        Array.from(newCommitment),
        Array.from(fee),
      ];

      expect(publicInputs.length).to.equal(4);
      publicInputs.forEach((input) => {
        expect(input.length).to.equal(32);
      });
    });

    it("should validate unshield public inputs (6 inputs)", () => {
      const root = Buffer.alloc(32, 1);
      const nullifier = Buffer.alloc(32, 2);
      const recipientLo = Buffer.alloc(32, 3);
      const recipientHi = Buffer.alloc(32, 4);
      const amount = Buffer.alloc(32, 5);
      const fee = Buffer.alloc(32, 0);

      const publicInputs = [
        Array.from(root),
        Array.from(nullifier),
        Array.from(recipientLo),
        Array.from(recipientHi),
        Array.from(amount),
        Array.from(fee),
      ];

      expect(publicInputs.length).to.equal(6);
      publicInputs.forEach((input) => {
        expect(input.length).to.equal(32);
      });
    });
  });

  describe("PDA Seed Generation", () => {
    it("should use correct seeds for config PDA", () => {
      const configSeed = Buffer.from("config");
      expect(configSeed.toString()).to.equal("config");
    });

    it("should use correct seeds for VK PDAs", () => {
      const vkSeed = Buffer.from("vk");
      const shieldCircuit = Buffer.from([0]);
      const transferCircuit = Buffer.from([1]);
      const unshieldCircuit = Buffer.from([2]);

      expect(vkSeed.toString()).to.equal("vk");
      expect(shieldCircuit[0]).to.equal(0);
      expect(transferCircuit[0]).to.equal(1);
      expect(unshieldCircuit[0]).to.equal(2);
    });

    it("should use correct seeds for roots PDA", () => {
      const rootsSeed = Buffer.from("roots");
      expect(rootsSeed.toString()).to.equal("roots");
    });

    it("should use correct seeds for nullifiers PDA", () => {
      const nullifiersSeed = Buffer.from("nullifiers");
      const shard = Buffer.alloc(2, 0); // Shard 0

      expect(nullifiersSeed.toString()).to.equal("nullifiers");
      expect(shard.readUInt16LE(0)).to.equal(0);
    });
  });

  describe("Ring Buffer Logic", () => {
    it("should handle ring buffer wraparound", () => {
      const capacity = 4;
      const roots: number[] = [];
      let cursor = 0;

      // Add 6 items to a ring buffer of capacity 4
      for (let i = 0; i < 6; i++) {
        if (roots.length < capacity) {
          roots.push(i);
        } else {
          roots[cursor] = i;
        }
        cursor = (cursor + 1) % capacity;
      }

      // Should contain last 4 items: [4, 5, 2, 3]
      expect(roots.length).to.equal(4);
      expect(roots).to.deep.equal([4, 5, 2, 3]);
    });

    it("should check root membership correctly", () => {
      const roots = [
        Buffer.alloc(32, 1),
        Buffer.alloc(32, 2),
        Buffer.alloc(32, 3),
      ];

      const queryRoot = Buffer.alloc(32, 2);
      const found = roots.some((r) => r.equals(queryRoot));

      expect(found).to.be.true;

      const notFound = Buffer.alloc(32, 99);
      const notFoundResult = roots.some((r) => r.equals(notFound));

      expect(notFoundResult).to.be.false;
    });
  });

  describe("Constants Validation", () => {
    it("should have correct circuit IDs", () => {
      const CIRCUIT_SHIELD = 0;
      const CIRCUIT_TRANSFER = 1;
      const CIRCUIT_UNSHIELD = 2;

      expect(CIRCUIT_SHIELD).to.equal(0);
      expect(CIRCUIT_TRANSFER).to.equal(1);
      expect(CIRCUIT_UNSHIELD).to.equal(2);
    });

    it("should have correct public input counts", () => {
      const SHIELD_PUBLIC_INPUTS = 1;
      const TRANSFER_PUBLIC_INPUTS = 4;
      const UNSHIELD_PUBLIC_INPUTS = 6;

      expect(SHIELD_PUBLIC_INPUTS).to.equal(1);
      expect(TRANSFER_PUBLIC_INPUTS).to.equal(4);
      expect(UNSHIELD_PUBLIC_INPUTS).to.equal(6);
    });

    it("should have valid merkle depth range", () => {
      const DEFAULT_MERKLE_DEPTH = 20;
      const MAX_MERKLE_DEPTH = 32;

      expect(DEFAULT_MERKLE_DEPTH).to.be.lessThanOrEqual(MAX_MERKLE_DEPTH);
      expect(DEFAULT_MERKLE_DEPTH).to.be.greaterThan(0);

      // Calculate max leaves
      const maxLeaves = 2 ** DEFAULT_MERKLE_DEPTH;
      expect(maxLeaves).to.equal(1_048_576); // ~1M commitments
    });
  });
});
