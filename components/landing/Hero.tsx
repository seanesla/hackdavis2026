"use client";
import { motion } from "framer-motion";

export default function Hero() {
  return (
    <div className="flex flex-col items-center text-center">
      {/*
        LCP element. Don't opacity-animate this — that delays when the
        browser reports the LCP paint and tanks the score on slow networks.
        We keep the small y-slide for entrance polish. fetchPriority="high"
        nudges the browser to load this ahead of the JS chunks below it.
      */}
      <motion.img
        src="/parcel-logo.gif"
        alt="parcel"
        className="select-none w-[clamp(20rem,72vw,56rem)] h-auto"
        initial={{ y: 12 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
        draggable={false}
        fetchPriority="high"
        decoding="async"
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
        for the people who can&apos;t afford autodesk.
      </motion.p>
    </div>
  );
}
