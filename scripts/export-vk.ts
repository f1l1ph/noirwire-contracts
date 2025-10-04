#!/usr/bin/env ts-node
/**
 * Export verification keys from circuit build outputs to a format
 * suitable for uploading to Solana
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

interface VkJson {
  protocol: string;
  curve: string;
  nPublic: number;
  vk_alpha_1: string[];
  vk_beta_2: string[][];
  vk_gamma_2: string[][];
  vk_delta_2: string[][];
  IC: string[][];
}

interface VkExport {
  circuit: string;
  nPublic: number;
  vkData: Buffer;
  vkHash: string;
  vkDataHex: string;
}

const CIRCUITS = ["shield", "transfer", "unshield"];
const ZK_CIRCUITS_DIR = path.join(__dirname, "../zk-circuits");
const OUTPUT_DIR = path.join(__dirname, "../.vk-exports");

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

function serializeVk(vkJson: VkJson): Buffer {
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

function exportVk(circuit: string): VkExport | null {
  const vkPath = path.join(ZK_CIRCUITS_DIR, "build", circuit, "vk.json");

  if (!fs.existsSync(vkPath)) {
    console.log(`⚠️  VK not found for ${circuit}: ${vkPath}`);
    return null;
  }

  const vkJson: VkJson = JSON.parse(fs.readFileSync(vkPath, "utf-8"));

  // Validate
  if (vkJson.protocol !== "groth16") {
    throw new Error(`Invalid protocol: ${vkJson.protocol}`);
  }
  if (vkJson.curve !== "bn128") {
    throw new Error(`Invalid curve: ${vkJson.curve}`);
  }

  // Serialize
  const vkData = serializeVk(vkJson);

  // Compute hash
  const vkHash = crypto.createHash("sha256").update(vkData).digest("hex");

  console.log(`✅ Exported ${circuit}:`);
  console.log(`   - Public inputs: ${vkJson.nPublic}`);
  console.log(`   - VK size: ${vkData.length} bytes`);
  console.log(`   - VK hash: ${vkHash}`);

  return {
    circuit,
    nPublic: vkJson.nPublic,
    vkData,
    vkHash,
    vkDataHex: vkData.toString("hex"),
  };
}

function main() {
  console.log("🔧 Exporting verification keys...\n");

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const exports: { [key: string]: VkExport } = {};

  for (const circuit of CIRCUITS) {
    const exported = exportVk(circuit);
    if (exported) {
      exports[circuit] = exported;

      // Write binary file
      const binPath = path.join(OUTPUT_DIR, `${circuit}_vk.bin`);
      fs.writeFileSync(binPath, exported.vkData);

      // Write JSON metadata
      const jsonPath = path.join(OUTPUT_DIR, `${circuit}_vk.json`);
      fs.writeFileSync(
        jsonPath,
        JSON.stringify(
          {
            circuit: exported.circuit,
            nPublic: exported.nPublic,
            vkHash: exported.vkHash,
            vkDataHex: exported.vkDataHex,
          },
          null,
          2
        )
      );
    }
    console.log();
  }

  // Write combined manifest
  const manifestPath = path.join(OUTPUT_DIR, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        circuits: Object.keys(exports),
        vkHashes: Object.fromEntries(
          Object.entries(exports).map(([k, v]) => [k, v.vkHash])
        ),
      },
      null,
      2
    )
  );

  console.log(`\n✨ Exported ${Object.keys(exports).length} verification keys`);
  console.log(`📁 Output directory: ${OUTPUT_DIR}`);
  console.log(`📄 Manifest: ${manifestPath}\n`);
}

main();
