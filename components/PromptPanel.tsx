"use client";
import { useStore } from "@/lib/store";

const examples = [
  "0.5 acre lot, 25 ft front setback, 10 ft sides, fit a 3-story building with 12 parking spots.",
  "Quarter-acre infill lot, single-family home, 2 stories, 4 parking stalls.",
  "1 acre lot, mixed-use 4-story building, 30 parking spaces.",
];

export default function PromptPanel() {
  const { prompt, setPrompt, runMock, steps, running } = useStore();

  return (
    <aside className="w-[380px] shrink-0 h-screen border-r border-zinc-800 bg-zinc-950 text-zinc-100 flex flex-col">
      <div className="p-5 border-b border-zinc-800">
        <h1 className="text-lg font-semibold">SitePlan Agent</h1>
        <p className="text-xs text-zinc-400 mt-1">
          Describe a site. The agent reasons through zoning constraints and
          renders a 3D plan.
        </p>
      </div>

      <div className="p-4 space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="0.5 acre lot, 25 ft front setback…"
          className="w-full h-28 rounded-md bg-zinc-900 border border-zinc-800 p-3 text-sm focus:outline-none focus:border-zinc-600 resize-none"
        />
        <button
          onClick={runMock}
          disabled={running}
          className="w-full rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-medium py-2 text-sm"
        >
          {running ? "Running…" : "Run"}
        </button>

        <div className="space-y-1.5 pt-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            Examples
          </div>
          {examples.map((ex, i) => (
            <button
              key={i}
              onClick={() => setPrompt(ex)}
              className="block w-full text-left text-xs text-zinc-300 hover:text-white p-2 rounded bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
          Reasoning
        </div>
        {steps.length === 0 && (
          <div className="text-xs text-zinc-600 italic">
            Steps will appear here as the agent works.
          </div>
        )}
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li
              key={i}
              className="rounded border border-zinc-800 bg-zinc-900/60 p-2.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs ${
                    s.ok ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {s.ok ? "✓" : "✗"}
                </span>
                <span className="font-mono text-xs text-zinc-200">
                  {s.tool}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 ml-5">{s.note}</p>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
