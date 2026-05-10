/**
 * Generates a fresh Solana keypair, base58-encodes the secret, and writes it
 * to .env.local as SOLANA_SECRET_KEY (preserving any existing keys). Prints
 * the public address so you can airdrop devnet SOL to it.
 *
 * Run: npm run generate-wallet
 */
import { promises as fs } from "fs";
import path from "path";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import bs58 from "bs58";

const ENV_FILE = path.join(process.cwd(), ".env.local");
const KEY = "SOLANA_SECRET_KEY";

async function readEnv(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(ENV_FILE, "utf-8");
    const out: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return out;
  } catch {
    return {};
  }
}

function serializeEnv(obj: Record<string, string>): string {
  return (
    Object.entries(obj)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n"
  );
}

async function main() {
  const umi = createUmi("https://api.devnet.solana.com");
  const kp = umi.eddsa.generateKeypair();
  const encoded = bs58.encode(kp.secretKey);
  const address = kp.publicKey.toString();

  const env = await readEnv();
  const existing = env[KEY];
  if (existing && existing !== "base58_encoded_secret_key_here") {
    console.error(
      `\n${KEY} already set in .env.local. Refusing to overwrite.\n` +
        `If you really want a new wallet, delete that line and re-run.\n`
    );
    process.exit(1);
  }
  env[KEY] = encoded;
  await fs.writeFile(ENV_FILE, serializeEnv(env), "utf-8");

  console.log("\nGenerated new Solana wallet.");
  console.log("Public address:", address);
  console.log("Secret written to .env.local as", KEY);
  console.log("\nNext steps:");
  console.log(`  1. Airdrop devnet SOL:`);
  console.log(`     solana airdrop 2 ${address} --url devnet`);
  console.log(`     (or use https://faucet.solana.com — pick devnet)`);
  console.log(`  2. Verify balance:`);
  console.log(`     solana balance ${address} --url devnet`);
  console.log(`  3. Restart the dev server so it picks up the new env var.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
