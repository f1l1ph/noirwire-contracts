import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ZkPool } from "../target/types/zk_pool";
import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { sha256 } from "js-sha256";

describe("zk-pool", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ZkPool as Program<ZkPool>;
  const admin = provider.wallet as anchor.Wallet;

  // PDAs
  let configPda: anchor.web3.PublicKey;
  let configBump: number;
  let rootsPda: anchor.web3.PublicKey;
  let rootsBump: number;
  let treasuryPda: anchor.web3.PublicKey;
  let treasuryBump: number;

  // Circuit VK PDAs
  let shieldVkPda: anchor.web3.PublicKey;
  let transferVkPda: anchor.web3.PublicKey;
  let unshieldVkPda: anchor.web3.PublicKey;

  // Test parameters
  const MERKLE_DEPTH = 20;
  const ROOT_WINDOW = 64;
  const ABI_HASH = Buffer.alloc(32, 1); // Mock ABI hash for testing

  before(async () => {
    // Derive PDAs
    [configPda, configBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    [rootsPda, rootsBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("roots")],
      program.programId
    );

    [treasuryPda, treasuryBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId
    );

    [shieldVkPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vk"), Buffer.from([0])],
      program.programId
    );

    [transferVkPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vk"), Buffer.from([1])],
      program.programId
    );

    [unshieldVkPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vk"), Buffer.from([2])],
      program.programId
    );

    console.log("Program ID:", program.programId.toBase58());
    console.log("Config PDA:", configPda.toBase58());
    console.log("Admin:", admin.publicKey.toBase58());
  });

  it("Initializes the pool", async () => {
    const tx = await program.methods
      .initialize(MERKLE_DEPTH, ROOT_WINDOW, Array.from(ABI_HASH))
      .accounts({
        config: configPda,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Initialize tx:", tx);

    // Fetch and verify config
    const config = await program.account.poolConfig.fetch(configPda);
    expect(config.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(config.merkleDepth).to.equal(MERKLE_DEPTH);
    expect(config.rootWindow).to.equal(ROOT_WINDOW);
    expect(Buffer.from(config.abiHash)).to.deep.equal(ABI_HASH);
  });

  it("Sets verification key for shield circuit", async () => {
    const vkPath = path.join(__dirname, "../zk-circuits/build/shield/vk.json");

    if (!fs.existsSync(vkPath)) {
      console.log("Shield VK not found, skipping...");
      return;
    }

    const vkJson = JSON.parse(fs.readFileSync(vkPath, "utf-8"));
    const vkData = serializeVk(vkJson);
    const vkHash = sha256.array(vkData);

    const tx = await program.methods
      .setVerificationKey(0, Array.from(vkData), Array.from(vkHash))
      .accounts({
        config: configPda,
        vkAccount: shieldVkPda,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Set shield VK tx:", tx);

    // Verify VK was stored
    const vkAccount = await program.account.verificationKeyAccount.fetch(
      shieldVkPda
    );
    expect(vkAccount.circuit).to.equal(0);
    expect(vkAccount.nPublic).to.equal(1);
  });

  it("Sets verification key for transfer circuit", async () => {
    const vkPath = path.join(
      __dirname,
      "../zk-circuits/build/transfer/vk.json"
    );

    if (!fs.existsSync(vkPath)) {
      console.log("Transfer VK not found, skipping...");
      return;
    }

    const vkJson = JSON.parse(fs.readFileSync(vkPath, "utf-8"));
    const vkData = serializeVk(vkJson);
    const vkHash = sha256.array(vkData);

    const tx = await program.methods
      .setVerificationKey(1, Array.from(vkData), Array.from(vkHash))
      .accounts({
        config: configPda,
        vkAccount: transferVkPda,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Set transfer VK tx:", tx);

    const vkAccount = await program.account.verificationKeyAccount.fetch(
      transferVkPda
    );
    expect(vkAccount.circuit).to.equal(1);
    expect(vkAccount.nPublic).to.equal(4);
  });

  it("Sets verification key for unshield circuit", async () => {
    const vkPath = path.join(
      __dirname,
      "../zk-circuits/build/unshield/vk.json"
    );

    if (!fs.existsSync(vkPath)) {
      console.log("Unshield VK not found, skipping...");
      return;
    }

    const vkJson = JSON.parse(fs.readFileSync(vkPath, "utf-8"));
    const vkData = serializeVk(vkJson);
    const vkHash = sha256.array(vkData);

    const tx = await program.methods
      .setVerificationKey(2, Array.from(vkData), Array.from(vkHash))
      .accounts({
        config: configPda,
        vkAccount: unshieldVkPda,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Set unshield VK tx:", tx);

    const vkAccount = await program.account.verificationKeyAccount.fetch(
      unshieldVkPda
    );
    expect(vkAccount.circuit).to.equal(2);
    expect(vkAccount.nPublic).to.equal(6);
  });

  it("Adds a Merkle root", async () => {
    const testRoot = Buffer.alloc(32, 0x42); // Mock root

    const tx = await program.methods
      .addRoot(Array.from(testRoot))
      .accounts({
        config: configPda,
        roots: rootsPda,
        authority: admin.publicKey,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Add root tx:", tx);

    const roots = await program.account.rootsAccount.fetch(rootsPda);
    expect(roots.size).to.equal(1);
    expect(Buffer.from(roots.roots[0])).to.deep.equal(testRoot);
  });

  it("Submits a shield proof", async () => {
    const proofPath = path.join(
      __dirname,
      "../zk-circuits/build/shield/proof.json"
    );
    const publicPath = path.join(
      __dirname,
      "../zk-circuits/build/shield/public.json"
    );

    if (!fs.existsSync(proofPath) || !fs.existsSync(publicPath)) {
      console.log("⚠️  Shield proof not found, skipping golden proof test...");
      console.log("   To generate: cd zk-circuits && make shield");
      return;
    }

    const proofJson = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
    const publicJson = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

    const proofBytes = serializeProof(proofJson);
    const publicInputs = parsePublicInputs(publicJson);

    // Validate public input count
    expect(publicInputs.length).to.equal(
      1,
      "Shield expects 1 public input (commitment)"
    );

    const tx = await program.methods
      .submitShield(Array.from(proofBytes), publicInputs)
      .accounts({
        config: configPda,
        vkAccount: shieldVkPda,
        user: admin.publicKey,
      })
      .rpc();

    console.log("✅ Submit shield tx:", tx);
  });

  it("Submits a transfer proof", async () => {
    const proofPath = path.join(
      __dirname,
      "../zk-circuits/build/transfer/proof.json"
    );
    const publicPath = path.join(
      __dirname,
      "../zk-circuits/build/transfer/public.json"
    );

    if (!fs.existsSync(proofPath) || !fs.existsSync(publicPath)) {
      console.log(
        "⚠️  Transfer proof not found, skipping golden proof test..."
      );
      console.log("   To generate: cd zk-circuits && make transfer");
      return;
    }

    const proofJson = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
    const publicJson = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

    const proofBytes = serializeProof(proofJson);
    const publicInputs = parsePublicInputs(publicJson);

    // Validate public input count
    expect(publicInputs.length).to.equal(
      4,
      "Transfer expects 4 public inputs (root, nullifier, new_commitment, fee)"
    );

    // First add the root from the proof
    const root = publicInputs[0];
    await program.methods
      .addRoot(root)
      .accounts({
        config: configPda,
        roots: rootsPda,
        authority: admin.publicKey,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Derive nullifiers PDA
    const nullifier = publicInputs[1];
    const shard = Buffer.alloc(2, 0); // Shard 0 for MVP
    const [nullifiersPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("nullifiers"), shard],
      program.programId
    );

    const tx = await program.methods
      .submitTransfer(Array.from(proofBytes), publicInputs)
      .accounts({
        config: configPda,
        vkAccount: transferVkPda,
        roots: rootsPda,
        nullifiers: nullifiersPda,
        user: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Submit transfer tx:", tx);
  });

  it("Prevents nullifier reuse", async () => {
    const proofPath = path.join(
      __dirname,
      "../zk-circuits/build/transfer/proof.json"
    );
    const publicPath = path.join(
      __dirname,
      "../zk-circuits/build/transfer/public.json"
    );

    if (!fs.existsSync(proofPath) || !fs.existsSync(publicPath)) {
      console.log(
        "⚠️  Transfer proof not found, skipping nullifier reuse test..."
      );
      return;
    }

    const proofJson = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
    const publicJson = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

    const proofBytes = serializeProof(proofJson);
    const publicInputs = parsePublicInputs(publicJson);

    const shard = Buffer.alloc(2, 0);
    const [nullifiersPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("nullifiers"), shard],
      program.programId
    );

    // Try to submit the same proof again
    try {
      await program.methods
        .submitTransfer(Array.from(proofBytes), publicInputs)
        .accounts({
          config: configPda,
          vkAccount: transferVkPda,
          roots: rootsPda,
          nullifiers: nullifiersPda,
          user: admin.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      expect.fail("Should have failed with nullifier spent error");
    } catch (err) {
      expect(err.toString()).to.include("NullifierSpent");
      console.log("✅ Nullifier reuse correctly prevented");
    }
  });

  it("Submits an unshield proof", async () => {
    const proofPath = path.join(
      __dirname,
      "../zk-circuits/build/unshield/proof.json"
    );
    const publicPath = path.join(
      __dirname,
      "../zk-circuits/build/unshield/public.json"
    );

    if (!fs.existsSync(proofPath) || !fs.existsSync(publicPath)) {
      console.log(
        "⚠️  Unshield proof not found, skipping golden proof test..."
      );
      console.log("   To generate: cd zk-circuits && make unshield");
      return;
    }

    const proofJson = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
    const publicJson = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

    const proofBytes = serializeProof(proofJson);
    const publicInputs = parsePublicInputs(publicJson);

    // Validate public input count
    expect(publicInputs.length).to.equal(
      6,
      "Unshield expects 6 public inputs (root, nullifier, recipient_lo, recipient_hi, amount, fee)"
    );

    // First add the root
    const root = publicInputs[0];
    await program.methods
      .addRoot(root)
      .accounts({
        config: configPda,
        roots: rootsPda,
        authority: admin.publicKey,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Reconstruct recipient from public inputs
    const recipientLo = publicInputs[2];
    const recipientHi = publicInputs[3];
    const recipient = reconstructRecipient(recipientLo, recipientHi);

    const shard = Buffer.alloc(2, 0);
    const [nullifiersPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("nullifiers"), shard],
      program.programId
    );

    const tx = await program.methods
      .submitUnshield(Array.from(proofBytes), publicInputs)
      .accounts({
        config: configPda,
        vkAccount: unshieldVkPda,
        roots: rootsPda,
        nullifiers: nullifiersPda,
        treasury: treasuryPda,
        recipient: recipient,
        user: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Submit unshield tx:", tx);
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function serializeVk(vkJson: any): Buffer {
  // Serialize VK in the format expected by the program:
  // alpha_g1 (64) + beta_g2 (128) + gamma_g2 (128) + delta_g2 (128) + IC points
  // All field elements in LITTLE-ENDIAN as per ABI_v2.md

  const parts: Buffer[] = [];

  // alpha_g1 (G1 point: x, y)
  parts.push(fieldToBuffer(vkJson.vk_alpha_1[0]));
  parts.push(fieldToBuffer(vkJson.vk_alpha_1[1]));

  // beta_g2 (G2 point: x0, x1, y0, y1)
  parts.push(fieldToBuffer(vkJson.vk_beta_2[0][0]));
  parts.push(fieldToBuffer(vkJson.vk_beta_2[0][1]));
  parts.push(fieldToBuffer(vkJson.vk_beta_2[1][0]));
  parts.push(fieldToBuffer(vkJson.vk_beta_2[1][1]));

  // gamma_g2
  parts.push(fieldToBuffer(vkJson.vk_gamma_2[0][0]));
  parts.push(fieldToBuffer(vkJson.vk_gamma_2[0][1]));
  parts.push(fieldToBuffer(vkJson.vk_gamma_2[1][0]));
  parts.push(fieldToBuffer(vkJson.vk_gamma_2[1][1]));

  // delta_g2
  parts.push(fieldToBuffer(vkJson.vk_delta_2[0][0]));
  parts.push(fieldToBuffer(vkJson.vk_delta_2[0][1]));
  parts.push(fieldToBuffer(vkJson.vk_delta_2[1][0]));
  parts.push(fieldToBuffer(vkJson.vk_delta_2[1][1]));

  // IC points
  for (const ic of vkJson.IC) {
    parts.push(fieldToBuffer(ic[0]));
    parts.push(fieldToBuffer(ic[1]));
  }

  return Buffer.concat(parts);
}

function serializeProof(proofJson: any): Buffer {
  // Serialize proof as: A (64) + B (128) + C (64) = 256 bytes
  // All field elements in LITTLE-ENDIAN as per ABI_v2.md
  const parts: Buffer[] = [];

  // A (G1)
  parts.push(fieldToBuffer(proofJson.pi_a[0]));
  parts.push(fieldToBuffer(proofJson.pi_a[1]));

  // B (G2)
  parts.push(fieldToBuffer(proofJson.pi_b[0][0]));
  parts.push(fieldToBuffer(proofJson.pi_b[0][1]));
  parts.push(fieldToBuffer(proofJson.pi_b[1][0]));
  parts.push(fieldToBuffer(proofJson.pi_b[1][1]));

  // C (G1)
  parts.push(fieldToBuffer(proofJson.pi_c[0]));
  parts.push(fieldToBuffer(proofJson.pi_c[1]));

  return Buffer.concat(parts);
}

function parsePublicInputs(publicJson: any): number[][] {
  // Convert public inputs to array of [u8; 32]
  // Encoding: LITTLE-ENDIAN as per ABI_v2.md
  return publicJson.map((input: string) => {
    const buf = fieldToBuffer(input);
    return Array.from(buf);
  });
}

function fieldToBuffer(field: string | number): Buffer {
  // Convert field element to 32-byte buffer (LITTLE-ENDIAN)
  const bn = BigInt(field);
  const buf = Buffer.alloc(32);
  let value = bn;
  for (let i = 0; i < 32; i++) {
    buf[i] = Number(value & 0xffn);
    value = value >> 8n;
  }
  return buf;
}

function reconstructRecipient(
  lo: number[],
  hi: number[]
): anchor.web3.PublicKey {
  // Reconstruct 32-byte pubkey from two 16-byte limbs (LITTLE-ENDIAN encoding)
  const bytes = new Uint8Array(32);
  bytes.set(lo.slice(0, 16), 0);
  bytes.set(hi.slice(0, 16), 16);
  return new anchor.web3.PublicKey(bytes);
}
