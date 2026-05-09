"use client";
import dynamic from "next/dynamic";
import PromptPanel from "@/components/PromptPanel";

const Scene = dynamic(() => import("@/components/Scene"), { ssr: false });

export default function Home() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-900">
      <PromptPanel />
      <main className="flex-1 relative">
        <Scene />
      </main>
    </div>
  );
}
