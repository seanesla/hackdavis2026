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
            className="absolute left-1/2 top-[calc(50%+140px)] -translate-x-1/2 font-mono text-[11px] uppercase tracking-[0.3em] text-mute"
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
    </AnimatePresence>
  );
}
