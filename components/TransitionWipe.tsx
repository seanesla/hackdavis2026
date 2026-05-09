"use client";
import { AnimatePresence, motion } from "framer-motion";

export default function TransitionWipe({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 z-[100] pointer-events-none"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "-100%" }}
          transition={{ duration: 0.65, ease: [0.7, 0, 0.3, 1] }}
        >
          <div className="absolute inset-0 bg-ink" />
          <motion.div
            className="absolute left-0 right-0 h-[2px] bg-accent"
            initial={{ top: "100%", opacity: 0 }}
            animate={{ top: "50%", opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.05 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
