"use client";
import { Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import SideRail from "@/components/plan/SideRail";

const Scene = dynamic(() => import("@/components/Scene"), { ssr: false });
const AccentGrainient = dynamic(
  () => import("@/components/bg/AccentGrainient"),
  { ssr: false }
);

function PlanInner() {
  const params = useSearchParams();
  const promptParam = params.get("prompt") ?? "";
  const { runFromPrompt, prompt, running, steps } = useStore();

  useEffect(() => {
    if (promptParam && promptParam !== prompt && !running && steps.length === 0) {
      runFromPrompt(promptParam);
    }
  }, [promptParam, prompt, running, steps.length, runFromPrompt]);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <AccentGrainient subtle />
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.2 }}
        className="absolute inset-0"
      >
        <Scene />
      </motion.main>
      <SideRail />
    </div>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={null}>
      <PlanInner />
    </Suspense>
  );
}
