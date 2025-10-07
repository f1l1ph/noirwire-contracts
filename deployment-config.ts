/**
 * Deployment Configuration for NoirWire Contracts
 *
 * This file contains all deployment-related constants and addresses
 * for the NoirWire privacy pool on Solana.
 */

import { PublicKey } from "@solana/web3.js";

export const NETWORK = "devnet";

export const RPC_ENDPOINT = "https://api.devnet.solana.com";

export const DEPLOYER = new PublicKey(
  "42UU1MVEAT3tsD3EuzsHaQSWsXJ4M5MyDGRMmNSrsdHL"
);

/**
 * Program IDs
 */
export const PROGRAMS = {
  ZK_POOL: new PublicKey("Hza5rjYmJnoYsjsgsuxLkyxLoWVo6RCUZxCB3x17v8qz"),
  NOIRWIRE_CONTRACTS: new PublicKey(
    "6vySUQGyA67t7UtXKuauvn5QHZscj9fG26SZegq7UnCf"
  ),
} as const;

/**
 * IDL Account Addresses (on-chain program interfaces)
 */
export const IDL_ACCOUNTS = {
  ZK_POOL: new PublicKey("7sujPS7pdgf4h5TLDKAArbC3UqugZMKJPKQRs4B6NQvu"),
  NOIRWIRE_CONTRACTS: new PublicKey(
    "G3WEAhW97AGtjDbTwBBDD1dJZ5BWK3zncUssNt1qvRYB"
  ),
} as const;

/**
 * PDA Seeds for deriving program addresses
 */
export const SEEDS = {
  CONFIG: Buffer.from("config"),
  ROOTS: Buffer.from("roots"),
  NULLIFIERS: Buffer.from("nullifiers"),
  TREASURY: Buffer.from("treasury"),
  VK: Buffer.from("vk"),
} as const;

/**
 * Circuit Types
 */
export enum CircuitType {
  Shield = 0,
  Transfer = 1,
  Unshield = 2,
}

/**
 * Pool Configuration Constants
 */
export const POOL_CONFIG = {
  MERKLE_DEPTH: 20,
  MAX_NOTES: 2 ** 20, // 1,048,576 notes
  ROOT_WINDOW_SIZE: 64,
  NULLIFIER_SHARD_CAPACITY: 100_000,
} as const;

/**
 * Derive PDA addresses
 */
export class PDAs {
  /**
   * Get the pool config PDA
   */
  static getConfigPDA(
    programId: PublicKey = PROGRAMS.ZK_POOL
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([SEEDS.CONFIG], programId);
  }

  /**
   * Get the roots account PDA
   */
  static getRootsPDA(
    programId: PublicKey = PROGRAMS.ZK_POOL
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([SEEDS.ROOTS], programId);
  }

  /**
   * Get a nullifier shard PDA
   */
  static getNullifierPDA(
    shardIndex: number,
    programId: PublicKey = PROGRAMS.ZK_POOL
  ): [PublicKey, number] {
    const shardBuffer = Buffer.alloc(4);
    shardBuffer.writeUInt32LE(shardIndex);

    return PublicKey.findProgramAddressSync(
      [SEEDS.NULLIFIERS, shardBuffer],
      programId
    );
  }

  /**
   * Get the treasury PDA
   */
  static getTreasuryPDA(
    programId: PublicKey = PROGRAMS.ZK_POOL
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([SEEDS.TREASURY], programId);
  }

  /**
   * Get a verification key PDA
   */
  static getVkPDA(
    circuit: CircuitType,
    programId: PublicKey = PROGRAMS.ZK_POOL
  ): [PublicKey, number] {
    const circuitBuffer = Buffer.alloc(1);
    circuitBuffer.writeUInt8(circuit);

    return PublicKey.findProgramAddressSync(
      [SEEDS.VK, circuitBuffer],
      programId
    );
  }
}

/**
 * Deployment Status
 */
export const DEPLOYMENT_STATUS = {
  deployed: true,
  initialized: false,
  verificationKeysUploaded: false,
  readyForTransactions: false,
} as const;

/**
 * Explorer URLs
 */
export const EXPLORER_URLS = {
  ZK_POOL: `https://explorer.solana.com/address/${PROGRAMS.ZK_POOL.toBase58()}?cluster=${NETWORK}`,
  NOIRWIRE_CONTRACTS: `https://explorer.solana.com/address/${PROGRAMS.NOIRWIRE_CONTRACTS.toBase58()}?cluster=${NETWORK}`,
  DEPLOYER: `https://explorer.solana.com/address/${DEPLOYER.toBase58()}?cluster=${NETWORK}`,

  transaction: (signature: string) =>
    `https://explorer.solana.com/tx/${signature}?cluster=${NETWORK}`,

  address: (address: string) =>
    `https://explorer.solana.com/address/${address}?cluster=${NETWORK}`,
} as const;

/**
 * Deployment Metadata
 */
export const DEPLOYMENT_INFO = {
  network: NETWORK,
  deployedAt: "2025-10-07T17:41:00Z",
  deployer: DEPLOYER.toBase58(),
  zkPoolSignature:
    "3H99Y5RPQ7jBoH7HpX8n29MJGtu6ppCcwEmDR5MoTdEgzixRG9AvyeeF1F8YbX5KqZm62FPnixSwdPmiNnMdSuwM",
  noirwireSignature:
    "5QZLjwJmbDMV4LuQaNPKPmJYMcEnzkaYVKC4WsfZjgSuc12ygX1NNtRv13sLUHdT8DstgMRinQMF2K2HLWay4PCM",
} as const;

/**
 * Helper to print deployment info
 */
export function printDeploymentInfo() {
  console.log("🚀 NoirWire Deployment Info");
  console.log("============================");
  console.log(`Network: ${NETWORK}`);
  console.log(`RPC: ${RPC_ENDPOINT}`);
  console.log("");
  console.log("Programs:");
  console.log(`  zk-pool: ${PROGRAMS.ZK_POOL.toBase58()}`);
  console.log(
    `  noirwire-contracts: ${PROGRAMS.NOIRWIRE_CONTRACTS.toBase58()}`
  );
  console.log("");
  console.log("PDAs:");
  console.log(`  Config: ${PDAs.getConfigPDA()[0].toBase58()}`);
  console.log(`  Roots: ${PDAs.getRootsPDA()[0].toBase58()}`);
  console.log(`  Treasury: ${PDAs.getTreasuryPDA()[0].toBase58()}`);
  console.log(`  Nullifiers[0]: ${PDAs.getNullifierPDA(0)[0].toBase58()}`);
  console.log(
    `  VK Shield: ${PDAs.getVkPDA(CircuitType.Shield)[0].toBase58()}`
  );
  console.log(
    `  VK Transfer: ${PDAs.getVkPDA(CircuitType.Transfer)[0].toBase58()}`
  );
  console.log(
    `  VK Unshield: ${PDAs.getVkPDA(CircuitType.Unshield)[0].toBase58()}`
  );
  console.log("");
  console.log("Explorer:");
  console.log(`  ${EXPLORER_URLS.ZK_POOL}`);
}

// If running directly
if (require.main === module) {
  printDeploymentInfo();
}
