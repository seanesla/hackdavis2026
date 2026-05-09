# SitePlan Agent — HackDavis 2026

AI agent that turns plain-English site descriptions into valid, code-compliant 3D site plans. Democratizes early-stage site planning for community groups, small developers, and affordable-housing nonprofits priced out of Autodesk Forma / TestFit.

## Core insight (don't break this)

**The AI never generates 3D geometry.** It only fills in JSON parameters. Our code converts JSON → boxes. Same architecture as Forma/TestFit. If you find yourself asking the model to emit coordinates for meshes, stop — add a tool instead.

## Architecture

```
User prompt
  → Next.js API route (/api/plan)
  → Agent loop: Gemini 3 Flash + 5 tool functions
      set_lot → place_building → check_setbacks → place_parking → finalize
  → Final SitePlan JSON + tool-call trail
  → Zustand store
  → React Three Fiber scene re-renders (boxes on a grid)
```

Every layer reads/writes the same `SitePlan` shape. That type is the contract — see `lib/types.ts`. Do not let field names drift.

## Tech stack (locked)

- **Next.js 16** (App Router) — note: this is post-15, APIs differ from training data. See `AGENTS.md` and `node_modules/next/dist/docs/` before writing route/server code.
- **React 19**, **Tailwind v4**
- **Zustand 5** for state (`lib/store.ts`)
- **R3F 9.6 + Drei 10** — `<Canvas>`, `<Grid>`, `<OrbitControls>`, `<Box>`
- **Gemini 3 Flash** (`gemini-3-flash-preview`) via `@google/genai` v2.0, native function calling, `thinkingLevel: "low"`
- **Vercel** deploy

## Repo layout

- `app/` — Next.js App Router (layout, page, future `app/api/plan/route.ts`)
- `components/` — `Scene.tsx` (R3F canvas), `SitePlanMesh.tsx` (renders SitePlan JSON), `PromptPanel.tsx` (input + trail)
- `lib/` — `types.ts` (SitePlan + Step contract), `store.ts` (Zustand), `mockPlan.ts` (hand-written plan for offline dev)
- Future: `lib/tools/` (the 5 pure-TS tool functions), `lib/agent.ts` (loop)

## Roles & ownership

- **A — 3D Lead:** `components/Scene.tsx`, `SitePlanMesh.tsx`. Renders whatever's in the store.
- **B — App Shell:** `app/page.tsx`, `app/layout.tsx`, `lib/store.ts`, `PromptPanel.tsx`. Owns layout, fetch, trail UI.
- **C — Agent & Tools:** `app/api/plan/route.ts`, `lib/tools/*`, `lib/agent.ts`. Pure-TS tool fns + loop.
- **D — Design & Demo:** Tailwind styling, example prompts, Devpost, demo video.

## 24-hour timeline

| Hour  | Milestone                                                                 |
|-------|---------------------------------------------------------------------------|
| 0     | Lock `SitePlan` type. All four work in parallel after this.               |
| 0–3   | Skeletons: green box on grid (A), two-col layout + store (B), `/api/plan` smoke test (C), example prompts + palette (D). |
| 3–8   | A renders hand-written SitePlan. C writes 5 tool fns + math (rectangle setback check, greedy parking grid). B wires textbox → POST → store. |
| 8–14  | **Make-or-break:** end-to-end. Type prompt → 3D appears → trail populates. If broken at hour 14, cut scope (drop parking, drop trail). |
| 14–18 | Polish, edge cases, side-panel reasoning trail animation.                 |
| 18–22 | Feature freeze. Bug fixes only. Demo rehearsal.                           |
| 22–24 | Record video, Devpost, deploy, submit.                                    |

## Two failure modes that sink hackathons

1. **Type drift.** A/B/C using slightly different field names → integration breaks at hour 14. The type lives in `lib/types.ts`. Import, don't redeclare.
2. **Agent loops forever.** Cap iterations at ~10. `finalize` must always be callable as a fallback so *something* renders.

## Tool function contract

Each of the 5 tools is pure TypeScript:

```ts
type Tool = (plan: SitePlan, args: object) => { plan: SitePlan; result: string; ok: boolean };
```

Tools never throw — they return `ok: false` with a result string the model can read and react to. The result string is what makes the agent loop work; be specific ("building extends 3ft past front setback" beats "invalid").

## Prize tracks (keep these visible)

- Best Hack for Social Good — affordable-housing accessibility angle
- Best Use of Gemini — real multi-step function-calling agent
- Reconstruct prize — frame as Stage 0 of their plan→build→verify pipeline
- Best Technical Hack — multi-tool agent loop + constraint solving + 3D
- Best Interdisciplinary — recruit civil eng / architecture / planning student

## Conventions

- Units: feet throughout. Grid is XZ plane (Y is up, building height = `stories × 10ft`).
- `SitePlan` is the only shape that crosses the API boundary. No DTOs, no remapping.
- Server-only code (Gemini SDK, API key) stays under `app/api/`. Never import `@google/genai` from a client component.
- Tailwind v4 — no `tailwind.config.js`, theming in `app/globals.css`.
