type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  isConnected?: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toString(): string };
  }>;
  disconnect: () => Promise<void>;
};

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

export function getPhantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const provider = window.solana;
  if (!provider?.isPhantom) return null;
  return provider;
}

export async function connectPhantomAddress(): Promise<string> {
  const provider = getPhantom();
  if (!provider) {
    throw new Error(
      "Phantom not detected. Install the Phantom browser extension and set it to Devnet."
    );
  }
  const res = await provider.connect();
  return res.publicKey.toString();
}

export {};
