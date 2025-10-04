#!/usr/bin/env ts-node
/**
 * Submit golden proofs from zk-circuits to test on-chain verification
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ZkPool } from "../target/types/zk_pool";
import * as fs from "fs";
import * as path from "path";

const ZK_CIRCUITS_DIR = path.join(__dirname, "../zk-circuits");

const CIRCUITS: { [key: string]: number } = {
  shield: 0,
  transfer: 1,
  unshield: 2,
};

function fieldToBuffer(field: string | number): Buffer {
  const bn = BigInt(field);
  const buf = Buffer.alloc(32);
  let value = bn;
  for (let i = 0; i < 32; i++) {
    buf[i] = Number(value & BigInt(0xff));
    value = value >> BigInt(8);
  }
  return buf;
}

function serializeProof(proofJson: any): Buffer {
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
  return publicJson.map((input: string) => {
    const buf = fieldToBuffer(input);
    return Array.from(buf);
  });
}

async function submitShield(
  program: Program<ZkPool>,
  user: anchor.web3.Keypair
) {
  console.log("\n🛡️  Submitting shield proof...");

  const proofPath = path.join(ZK_CIRCUITS_DIR, "build/shield/proof.json");
  const publicPath = path.join(ZK_CIRCUITS_DIR, "build/shield/public.json");

  if (!fs.existsSync(proofPath) || !fs.existsSync(publicPath)) {
    console.log("⚠️  Shield proof not found, skipping");
    return;
  }

  const proofJson = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
  const publicJson = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

  const proofBytes = serializeProof(proofJson);
  const publicInputs = parsePublicInputs(publicJson);

  const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  const [vkPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vk"), Buffer.from([CIRCUITS.shield])],
    program.programId
  );

  const tx = await program.methods
    .submitShield(Array.from(proofBytes), publicInputs)
    .accounts({
      config: configPda,
      vkAccount: vkPda,
      user: user.publicKey,
    })
    .signers([user])
    .rpc();

  console.log(`✅ Shield proof verified!`);
  console.log(`   Transaction: ${tx}`);
  console.log(
    `   Commitment: 0x${Buffer.from(publicInputs[0]).toString("hex")}`
  );
}

async function submitTransfer(
  program: Program<ZkPool>,
  user: anchor.web3.Keypair
) {
  console.log("\n🔄 Submitting transfer proof...");

  const proofPath = path.join(ZK_CIRCUITS_DIR, "build/transfer/proof.json");
  const publicPath = path.join(ZK_CIRCUITS_DIR, "build/transfer/public.json");

  if (!fs.existsSync(proofPath) || !fs.existsSync(publicPath)) {
    console.log("⚠️  Transfer proof not found, skipping");
    return;
  }

  const proofJson = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
  const publicJson = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

  const proofBytes = serializeProof(proofJson);
  const publicInputs = parsePublicInputs(publicJson);

  const root = publicInputs[0];
  const nullifier = publicInputs[1];

  const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  const [vkPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vk"), Buffer.from([CIRCUITS.transfer])],
    program.programId
  );

  const [rootsPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("roots")],
    program.programId
  );

  const shard = Buffer.alloc(2, 0);
  const [nullifiersPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("nullifiers"), shard],
    program.programId
  );

  // First add the root
  console.log("   Adding root to tree...");
  await program.methods
    .addRoot(root)
    .accounts({
      config: configPda,
      roots: rootsPda,
      authority: user.publicKey,
      admin: user.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([user])
    .rpc();

  // Submit transfer
  const tx = await program.methods
    .submitTransfer(Array.from(proofBytes), publicInputs)
    .accounts({
      config: configPda,
      vkAccount: vkPda,
      roots: rootsPda,
      nullifiers: nullifiersPda,
      user: user.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([user])
    .rpc();

  console.log(`✅ Transfer proof verified!`);
  console.log(`   Transaction: ${tx}`);
  console.log(
    `   Nullifier: 0x${Buffer.from(nullifier).toString("hex").slice(0, 16)}...`
  );
}

async function submitUnshield(
  program: Program<ZkPool>,
  user: anchor.web3.Keypair
) {
  console.log("\n💸 Submitting unshield proof...");

  const proofPath = path.join(ZK_CIRCUITS_DIR, "build/unshield/proof.json");
  const publicPath = path.join(ZK_CIRCUITS_DIR, "build/unshield/public.json");

  if (!fs.existsSync(proofPath) || !fs.existsSync(publicPath)) {
    console.log("⚠️  Unshield proof not found, skipping");
    return;
  }

  const proofJson = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
  const publicJson = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

  const proofBytes = serializeProof(proofJson);
  const publicInputs = parsePublicInputs(publicJson);

  const root = publicInputs[0];
  const recipientLo = publicInputs[2];
  const recipientHi = publicInputs[3];

  // Reconstruct recipient
  const recipientBytes = new Uint8Array(32);
  recipientBytes.set(recipientLo.slice(0, 16), 0);
  recipientBytes.set(recipientHi.slice(0, 16), 16);
  const recipient = new anchor.web3.PublicKey(recipientBytes);

  const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  const [vkPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vk"), Buffer.from([CIRCUITS.unshield])],
    program.programId
  );

  const [rootsPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("roots")],
    program.programId
  );

  const [treasuryPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );

  const shard = Buffer.alloc(2, 0);
  const [nullifiersPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("nullifiers"), shard],
    program.programId
  );

  // Add root
  console.log("   Adding root to tree...");
  await program.methods
    .addRoot(root)
    .accounts({
      config: configPda,
      roots: rootsPda,
      authority: user.publicKey,
      admin: user.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([user])
    .rpc();

  // Submit unshield
  const tx = await program.methods
    .submitUnshield(Array.from(proofBytes), publicInputs)
    .accounts({
      config: configPda,
      vkAccount: vkPda,
      roots: rootsPda,
      nullifiers: nullifiersPda,
      treasury: treasuryPda,
      recipient: recipient,
      user: user.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([user])
    .rpc();

  console.log(`✅ Unshield proof verified!`);
  console.log(`   Transaction: ${tx}`);
  console.log(`   Recipient: ${recipient.toBase58()}`);
}

async function main() {
  console.log("🧪 Submitting golden proofs\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ZkPool as Program<ZkPool>;
  const user = (provider.wallet as anchor.Wallet).payer;

  console.log(`Program ID: ${program.programId.toBase58()}`);
  console.log(`User: ${user.publicKey.toBase58()}`);

  // Submit proofs
  await submitShield(program, user);
  await submitTransfer(program, user);
  await submitUnshield(program, user);

  console.log("\n✨ All proofs submitted successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
