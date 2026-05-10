"use client";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";

export default function LoadingCurtain() {
  const loading = useStore((s) => s.loading);
  const running = useStore((s) => s.running);
  const plan = useStore((s) => s.plan);
  const error = useStore((s) => s.error);
  const pathname = usePathname();
  const onPlan = pathname?.startsWith("/plan") ?? false;
  // On /plan, hide once the first stage lands and buildings start animating —
  // the centered overlay would otherwise cover the construction.
  const active = onPlan ? (loading || running) && plan === null : loading;
  // Surface a setup error prominently when there's no plan to fall back on.
  // The most common culprit is a missing GEMINI_API_KEY in .env.local — without
  // this, the curtain used to dismiss silently and leave the user staring at
  // an empty canvas wondering what went wrong.
  const showErrorBanner = error && !plan && !active;

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="curtain"
          className="fixed inset-0 z-[80] pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            // On /plan, shift right by 208px so the text centers under the
            // hammer in the visible scene area (right of the SideRail) rather
            // than the whole viewport. Off /plan (landing page transition),
            // viewport-centered is correct.
            className="absolute -translate-x-1/2 top-[calc(50%+100px)] font-mono text-[11px] uppercase tracking-[0.3em] text-mute"
            style={{ left: onPlan ? "calc(50% + 208px)" : "50%" }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{
              duration: 1.6,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.4,
            }}
          >
            drafting…
          </motion.div>
        </motion.div>
      )}

      {showErrorBanner && (
        <motion.div
          key="error-banner"
          role="alert"
          aria-live="assertive"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] max-w-[560px] w-[calc(100%-2rem)] glass rounded-xl px-5 py-4 border border-rose-500/40"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 inline-block w-2 h-2 rounded-full bg-rose-400 shrink-0"
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-rose-300">
                couldn&apos;t draft this plan
              </div>
              <div className="mt-1 font-mono text-[12px] text-paper/85 leading-relaxed break-words">
                {error}
              </div>
              {/GEMINI_API_KEY/i.test(error ?? "") && (
                <div className="mt-2 font-mono text-[11px] text-mute/80 leading-relaxed">
                  Add your key to{" "}
                  <code className="text-accent">.env.local</code> as{" "}
                  <code className="text-accent">GEMINI_API_KEY=…</code>, then
                  restart the dev server.
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
