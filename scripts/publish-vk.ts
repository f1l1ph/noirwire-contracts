#!/usr/bin/env ts-node
/**
 * Upload verification keys to the Solana program
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ZkPool } from "../target/types/zk_pool";
import * as fs from "fs";
import * as path from "path";

const VK_EXPORTS_DIR = path.join(__dirname, "../.vk-exports");

const CIRCUITS: { [key: string]: number } = {
  shield: 0,
  transfer: 1,
  unshield: 2,
};

async function publishVk(
  program: Program<ZkPool>,
  admin: anchor.web3.Keypair,
  circuit: string
) {
  const circuitId = CIRCUITS[circuit];
  if (circuitId === undefined) {
    throw new Error(`Unknown circuit: ${circuit}`);
  }

  const vkPath = path.join(VK_EXPORTS_DIR, `${circuit}_vk.json`);
  const binPath = path.join(VK_EXPORTS_DIR, `${circuit}_vk.bin`);

  if (!fs.existsSync(vkPath) || !fs.existsSync(binPath)) {
    throw new Error(
      `VK files not found for ${circuit}. Run export-vk.ts first.`
    );
  }

  const vkMeta = JSON.parse(fs.readFileSync(vkPath, "utf-8"));
  const vkData = fs.readFileSync(binPath);
  const vkHash = Buffer.from(vkMeta.vkHash, "hex");

  console.log(`\n📤 Uploading ${circuit} VK...`);
  console.log(`   Circuit ID: ${circuitId}`);
  console.log(`   VK size: ${vkData.length} bytes`);
  console.log(`   VK hash: ${vkHash.toString("hex")}`);

  const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  const [vkPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vk"), Buffer.from([circuitId])],
    program.programId
  );

  const tx = await program.methods
    .setVerificationKey(circuitId, Array.from(vkData), Array.from(vkHash))
    .accounts({
      config: configPda,
      vkAccount: vkPda,
      admin: admin.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([admin])
    .rpc();

  console.log(`✅ VK uploaded!`);
  console.log(`   Transaction: ${tx}`);
  console.log(`   VK PDA: ${vkPda.toBase58()}`);

  return { tx, vkPda };
}

async function main() {
  console.log("🚀 Publishing verification keys to Solana\n");

  // Load provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ZkPool as Program<ZkPool>;
  const admin = (provider.wallet as anchor.Wallet).payer;

  console.log(`Program ID: ${program.programId.toBase58()}`);
  console.log(`Admin: ${admin.publicKey.toBase58()}`);

  // Check if pool is initialized
  const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  try {
    const config = await program.account.poolConfig.fetch(configPda);
    console.log(`✅ Pool initialized at ${configPda.toBase58()}\n`);
  } catch (err) {
    console.error(`❌ Pool not initialized! Run 'anchor test' first.`);
    process.exit(1);
  }

  // Upload VKs
  for (const circuit of Object.keys(CIRCUITS)) {
    try {
      await publishVk(program, admin, circuit);
    } catch (err) {
      console.error(`❌ Failed to upload ${circuit} VK:`, err);
    }
  }

  console.log("\n✨ All verification keys published!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
