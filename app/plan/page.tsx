"use client";
import { Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import SideRail from "@/components/plan/SideRail";
import DebugToggle from "@/components/plan/DebugToggle";

const Scene = dynamic(() => import("@/components/Scene"), { ssr: false });
const ContourBackground = dynamic(
  () => import("@/components/bg/ContourBackground"),
  { ssr: false }
);

function PlanInner() {
  const params = useSearchParams();
  const promptParam = params.get("prompt") ?? "";
  const runFromPrompt = useStore((s) => s.runFromPrompt);
  const prompt = useStore((s) => s.prompt);
  const running = useStore((s) => s.running);
  const plan = useStore((s) => s.plan);
  const selectedFloor = useStore((s) => s.selectedFloor);
  const fetchInteriorFor = useStore((s) => s.fetchInteriorFor);
  const prefetchAllInteriors = useStore((s) => s.prefetchAllInteriors);
  const selectFloor = useStore((s) => s.selectFloor);

  useEffect(() => {
    if (promptParam && promptParam !== prompt && !running) {
      runFromPrompt(promptParam);
    }
  }, [promptParam, prompt, running, runFromPrompt]);

  // The moment the plan stops streaming, kick off interior generation for
  // every unique (footprint × story) so the user gets an instant 3D reveal
  // on click. Acts as the safety net too — even if prefetch hasn't finished
  // by the time they click, the per-floor fetch below is still idempotent.
  useEffect(() => {
    if (!running && plan?.buildings && plan.buildings.length > 0) {
      prefetchAllInteriors();
    }
  }, [running, plan, prefetchAllInteriors]);

  useEffect(() => {
    if (selectedFloor) {
      fetchInteriorFor(selectedFloor.buildingIndex, selectedFloor.storyIndex);
    }
  }, [selectedFloor, fetchInteriorFor]);

  // Escape closes the open floor.
  useEffect(() => {
    if (!selectedFloor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") selectFloor(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedFloor, selectFloor]);

  return (
    <div className="relative flex h-screen w-screen overflow-hidden">
      <ContourBackground />
      <SideRail />
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.2 }}
        className="flex-1 relative"
      >
        <Scene />
        <DebugToggle />
      </motion.main>
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
