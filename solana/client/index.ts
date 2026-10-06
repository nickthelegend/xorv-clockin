/**
 * Node-side client for the Xorv Solana program: PDAs, instruction builders and
 * account readers shared by the tests, the devnet setup script and the
 * provider node. (The mobile app carries its own dependency-light copy.)
 */
import anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createRequire } from "node:module";
import type { Xorv } from "./xorv-types.js";

const require = createRequire(import.meta.url);
export const IDL = require("./xorv.json");
export const PROGRAM_ID = new PublicKey(IDL.address);

export const STATUS = { FUNDED: 0, DELIVERED: 1, REFUNDED: 2, REJECTED: 3 } as const;
export const STATUS_OFFSET = 112;
export const DECIMALS = 6;
export const UNIT = 1_000_000n;

export const pda = {
  config: () => PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0],
  mint: () => PublicKey.findProgramAddressSync([Buffer.from("skr-mint")], PROGRAM_ID)[0],
  provider: (authority: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("provider"), authority.toBuffer()], PROGRAM_ID)[0],
  bond: (provider: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("bond"), provider.toBuffer()], PROGRAM_ID)[0],
  job: (buyer: PublicKey, nonce: bigint | number) => {
    const n = Buffer.alloc(8);
    n.writeBigUInt64LE(BigInt(nonce));
    return PublicKey.findProgramAddressSync([Buffer.from("job"), buyer.toBuffer(), n], PROGRAM_ID)[0];
  },
  vault: (job: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("vault"), job.toBuffer()], PROGRAM_ID)[0],
  user: (wallet: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("user"), wallet.toBuffer()], PROGRAM_ID)[0],
};

export const ata = (owner: PublicKey) => getAssociatedTokenAddressSync(pda.mint(), owner, true);

export function makeProgram(connection: Connection, wallet: Keypair): Program<Xorv> {
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {
    commitment: "confirmed",
  });
  return new anchor.Program<Xorv>(IDL, provider);
}

export function loadKeypair(path: string): Keypair {
  const fs = require("node:fs") as typeof import("node:fs");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8"))));
}

export const explorer = (sig: string, cluster = "devnet") =>
  `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;
