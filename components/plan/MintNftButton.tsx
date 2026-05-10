"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { connectPhantomAddress } from "@/lib/phantom";

type MintResult = {
  signature: string;
  mintAddress: string;
  metadataUri: string;
  imageUri: string;
  solscanUrl: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "minting" }
  | { kind: "done"; result: MintResult }
  | { kind: "error"; message: string };

function captureCanvas(): string | null {
  // R3F renders a single <canvas> inside the <Canvas> wrapper. There is only
  // one canvas in the plan view, so a tagName lookup is sufficient.
  const canvas = document.querySelector("canvas");
  if (!canvas) return null;
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export default function MintNftButton() {
  const plan = useStore((s) => s.plan);
  const running = useStore((s) => s.running);
  const prompt = useStore((s) => s.prompt);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [open, setOpen] = useState(false);

  const ready = !running && plan !== null && (plan.buildings?.length ?? 0) > 0;

  async function onMint() {
    setStatus({ kind: "minting" });
    setOpen(true);

    let address: string;
    try {
      address = await connectPhantomAddress();
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not connect Phantom.",
      });
      return;
    }

    const imageBase64 = captureCanvas();
    if (!imageBase64) {
      setStatus({
        kind: "error",
        message:
          "Could not capture the 3D scene. Try interacting with the canvas once and retry.",
      });
      return;
    }

    try {
      const res = await fetch("/api/mint-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          planJson: plan,
          recipientAddress: address,
          brief: prompt,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus({
          kind: "error",
          message: data.detail
            ? `${data.error} ${data.detail}`
            : data.error ?? "Mint failed.",
        });
        return;
      }
      setStatus({
        kind: "done",
        result: {
          signature: data.signature,
          mintAddress: data.mintAddress,
          metadataUri: data.metadataUri,
          imageUri: data.imageUri,
          solscanUrl: data.solscanUrl,
        },
      });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    }
  }

  function reset() {
    setOpen(false);
    setStatus({ kind: "idle" });
  }

  if (!ready) return null;

  return (
    <>
      <button
        onClick={onMint}
        disabled={status.kind === "minting"}
        className="group w-full rounded-lg border border-accent/40 bg-accent/10 hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-accent transition-colors"
      >
        {status.kind === "minting" ? "minting…" : "mint as NFT"}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget && status.kind !== "minting") reset();
            }}
          >
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              className="glass relative w-[440px] max-w-[92vw] rounded-2xl p-7"
            >
              {status.kind === "minting" && (
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                  <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-paper/80">
                    minting on solana devnet
                  </div>
                  <div className="font-mono text-[10px] text-mute text-center">
                    uploading to arweave + signing tx (5–15s)
                  </div>
                </div>
              )}

              {status.kind === "done" && (
                <div className="flex flex-col gap-4">
                  <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
                    minted ✓
                  </div>
                  <div className="font-mono text-[12px] text-paper/85 leading-relaxed">
                    Your plan is now an NFT in your Phantom wallet.
                  </div>
                  <div className="space-y-2 font-mono text-[10px] text-mute">
                    <div className="flex flex-col gap-1">
                      <span className="uppercase tracking-[0.2em]">mint address</span>
                      <span className="text-paper/70 break-all">
                        {status.result.mintAddress}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="uppercase tracking-[0.2em]">tx signature</span>
                      <span className="text-paper/70 break-all">
                        {status.result.signature.slice(0, 24)}…
                      </span>
                    </div>
                  </div>
                  <a
                    href={status.result.solscanUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full rounded-lg border border-accent/40 bg-accent/10 hover:bg-accent/20 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-accent text-center transition-colors"
                  >
                    view on solscan →
                  </a>
                  <div className="font-mono text-[10px] text-mute/80 text-center">
                    open Phantom (devnet) to see it in your collectibles
                  </div>
                  <button
                    onClick={reset}
                    className="font-mono text-[10px] uppercase tracking-[0.25em] text-mute hover:text-paper transition-colors"
                  >
                    close
                  </button>
                </div>
              )}

              {status.kind === "error" && (
                <div className="flex flex-col gap-4">
                  <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-red-400">
                    mint failed
                  </div>
                  <div className="font-mono text-[12px] text-paper/85 leading-relaxed break-words">
                    {status.message}
                  </div>
                  <button
                    onClick={reset}
                    className="w-full rounded-lg border border-rule/60 hover:bg-paper/5 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-paper/80 transition-colors"
                  >
                    close
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
