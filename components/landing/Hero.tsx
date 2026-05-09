"use client";
import { motion } from "framer-motion";

const word = "parcel".split("");

export default function Hero() {
  return (
    <div className="flex flex-col items-center text-center">
      <motion.h1
        className="font-display font-extrabold text-paper leading-none select-none"
        style={{
          fontSize: "clamp(5rem, 18vw, 14rem)",
          letterSpacing: "-0.05em",
        }}
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
        }}
      >
        {word.map((c, i) => (
          <motion.span
            key={i}
            className="inline-block"
            variants={{
              hidden: { y: "0.6em", opacity: 0 },
              show: {
                y: 0,
                opacity: 1,
                transition: { type: "spring", stiffness: 140, damping: 18 },
              },
            }}
          >
            {c}
          </motion.span>
        ))}
      </motion.h1>

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
