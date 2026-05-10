"use client";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/store";

// Hammer overlay for the planning state. Renders as a body-level fixed
// element over the 3D scene so the user sees the hammer prepping the plan,
// then it fades out and the panel-resident hammer (in SideRail) takes over
// once the plan exists.
const Hammer3D = dynamic(() => import("@/components/hammer/Hammer3D"), {
  ssr: false,
  loading: () => null,
});

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
          className="fixed inset-0 z-[80] pointer-events-none flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Hammer + caption render as a single column centered on the
              viewport, so the hammer sits directly above the text and the
              two read as one anchored unit. Sized to match the SideRail
              slot (400×260) so the visual weight stays consistent across
              the hand-off when planning completes. */}
          <motion.div
            className="w-[400px] h-[260px]"
            initial={{ opacity: 0, scale: 0.85, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <Hammer3D isLoading forging={false} subtle={false} />
          </motion.div>

          <motion.div
            className="mt-2 font-mono text-[11px] uppercase tracking-[0.3em] text-mute"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{
              duration: 1.6,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.4,
            }}
          >
            planning…
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
