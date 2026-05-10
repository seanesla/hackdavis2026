"use client";
import { motion } from "framer-motion";

export default function Hero() {
  return (
    <div className="flex flex-col items-center text-center">
      <motion.img
        src="/parcel-logo.gif"
        alt="parcel"
        className="select-none w-[clamp(20rem,72vw,56rem)] h-auto"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        draggable={false}
      />

      <motion.div
        className="survey-line w-[clamp(10rem,30vw,22rem)] mt-2 origin-left"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
      />

      <motion.p
        className="mt-8 text-mute font-mono text-sm sm:text-base tracking-tight"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5 }}
      >
        describe a site. parcel plans it.
      </motion.p>

      <motion.p
        className="mt-2 text-mute/70 font-mono text-xs sm:text-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.5 }}
      >
        for nonprofits, community developers, and small teams. no CAD required.
      </motion.p>
    </div>
  );
}
