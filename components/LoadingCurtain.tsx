"use client";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";

export default function LoadingCurtain() {
  const loading = useStore((s) => s.loading);
  const running = useStore((s) => s.running);
  const plan = useStore((s) => s.plan);
  const pathname = usePathname();
  const onPlan = pathname?.startsWith("/plan") ?? false;
  // On /plan, hide once the first stage lands and buildings start animating —
  // the centered overlay would otherwise cover the construction.
  const active = onPlan ? (loading || running) && plan === null : loading;

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
    </AnimatePresence>
  );
}
