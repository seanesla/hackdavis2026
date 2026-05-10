import "server-only";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCore } from "@metaplex-foundation/mpl-core";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import { keypairIdentity, type Umi } from "@metaplex-foundation/umi";
import bs58 from "bs58";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const IRYS_DEVNET_URL = "https://devnet.irys.xyz";

let _umi: Umi | null = null;

export function getUmi(): Umi {
  if (_umi) return _umi;

  const secret = process.env.SOLANA_SECRET_KEY;
  if (!secret || secret === "base58_encoded_secret_key_here") {
    throw new Error(
      "SOLANA_SECRET_KEY missing. Run `npm run generate-wallet` and airdrop devnet SOL to the printed address."
    );
  }

  let secretBytes: Uint8Array;
  try {
    secretBytes = bs58.decode(secret);
  } catch {
    throw new Error("SOLANA_SECRET_KEY is not valid base58.");
  }
  if (secretBytes.length !== 64) {
    throw new Error(
      `SOLANA_SECRET_KEY must decode to 64 bytes (got ${secretBytes.length}).`
    );
  }

  const umi = createUmi(RPC_URL)
    .use(mplCore())
    .use(irysUploader({ address: IRYS_DEVNET_URL }));

  const keypair = umi.eddsa.createKeypairFromSecretKey(secretBytes);
  umi.use(keypairIdentity(keypair));

  _umi = umi;
  return umi;
}

export function getPayerAddress(): string {
  return getUmi().identity.publicKey.toString();
}
