# hackdavis2026 — parcel

an AI agent that turns plain-English site descriptions into 3D site plans. built for HackDavis 2026 to make early-stage site planning accessible to community groups, small developers, and affordable-housing nonprofits priced out of tools like Forma or TestFit.

## core idea

the AI never generates 3D geometry. it only fills in JSON parameters that match the `SitePlan` shape in `lib/types.ts`. the renderer turns that JSON into boxes, GLB props, and shader-driven landscape on a grid. same architecture as Forma and TestFit.

## what's in the repo right now

front end, agent backend, voice modes, image-based floor plans, 3D interiors, and cross-session memory are all wired end-to-end.

- landing page: hero, prompt bar, example pills, accent picker, grainient background, floating 3D hammer mascot
- text mode: type a prompt → `/api/plan` runs a Gemini 3 Flash function-calling loop → 3D site plan animates in step-by-step
- voice modes (chrome/edge only): "interview" asks 5 questions and synthesizes a prompt; "freestyle" is an open chat with `/api/chat` until the user says "build it"
- 3D scene (R3F + drei): boxes per building (with a merge rule for letter-shape buildings sharing material + stories + an edge), trees / bushes / fences / walkways / parking / street furniture from the SitePlan, GLB props for cars and street furniture in `public/models/`
- click a floor → `FloorPanel` shows a generated floor-plan image (from `/api/floorplan`, gemini-2.5-flash-image) plus a 3D interior with furniture (from `/api/interior`, structured output)
- cross-session memory via Backboard: every finalized plan is saved to a thread, design preferences are pulled back into future prompts, and `ChatHistoryBox` lets the user ask questions about their past plans through `/api/chat-history`
- past plans stored locally in IndexedDB (max 5) and surfaced on the landing page; export / import a plan as JSON
- ElevenLabs TTS proxy at `/api/tts` so the AI's voice replies sound like a person, not the system speech synthesizer

## stack

- **Next.js 16.2.6** (App Router) — note: post-15 APIs, see `node_modules/next/dist/docs/` before writing route or server code
- **React 19.2.4**, **Tailwind v4** (no `tailwind.config.js`, theming in `app/globals.css`)
- **zustand 5** for state — `lib/store.ts`
- **React Three Fiber 9.6 + drei 10** for the 3D scene; **three 0.184**
- **framer-motion 12** for transitions
- **ogl 1** for the grainient background shader
- **@google/genai 2** with `gemini-3-flash-preview` (agent loop, `thinkingLevel: "low"`, native function calling), `gemini-2.5-flash-image` (floor plan images), and `gemini-2.5-flash` (chat fallback)
- **backboard-sdk 1.5** for cross-session memory
- **ElevenLabs** REST API (eleven_turbo_v2_5) for TTS — proxied through `/api/tts`
- **TypeScript 5**, **ESLint 9**

## scripts

- `npm run dev` — start the next dev server (Turbopack, 8GB Node heap). a preflight check runs first via `scripts/predev-check.mjs` to surface low-RAM / wrong-Node-version warnings.
- `npm run dev:legacy` — fallback dev server using Webpack, in case Turbopack misbehaves.
- `npm run build` — production build (8GB Node heap).
- `npm run start` — run the production build.
- `npm run lint` — eslint.
- `npm run clean` — delete the `.next/` build cache (use if dev seems stuck or stale).
- `npm run reset` — nuke `.next/`, `node_modules/`, and `package-lock.json` and reinstall (use after a system freeze instead of re-cloning).

## API routes (under `app/api/`)

| Route | Purpose | Key calls |
|---|---|---|
| `POST /api/plan` | Gemini agent loop — runs the tools below, returns `stages[]` so the UI replays them step-by-step | `gemini-3-flash-preview` w/ function calling |
| `POST /api/floorplan` | Generates a top-down floor plan image for one (building, story) | `gemini-2.5-flash-image`, in-memory LRU cache (200 entries) |
| `POST /api/interior` | Structured-output room + furniture layout for one (building, story) | `gemini-2.5-flash` |
| `POST /api/chat` | Conversational replies for the freestyle voice mode | `gemini-3-flash-preview`, falls back to `gemini-2.5-flash` |
| `POST /api/save-memory` | Saves a finalized plan (or a note update) to a Backboard thread | `backboard-sdk` |
| `POST /api/chat-history` | Lets the user ask questions about their past plans | `backboard-sdk` |
| `POST /api/tts` | Streams ElevenLabs audio back to the browser | ElevenLabs REST |

every route uses an in-process rate limiter from `lib/rateLimit.ts`.

## agent tools (in `lib/toolDeclarations.ts` / `lib/tools.ts`)

the model only sees these tools — anything outside this list is silently ignored.

- `set_lot` — establishes lot dimensions + setbacks; called first; re-calling wipes the plan.
- `place_building` — appends one building; multiple calls allowed for multi-building sites and letter-shape decompositions (L, T, U, +, E, F, H, courtyard).
- `check_setbacks` — validates every placed building, returns clearances or which side(s) violate.
- `place_parking` — packs 9×18 ft stalls into the buildable envelope, avoids buildings.
- `place_trees` — perimeter / front / back / left / right / scattered, four species (oak, pine, palm, maple).
- `place_walkway` — flat paved strip between two points; defensively snaps endpoints to a building's south-face entrance coordinate.
- `place_fence` — additive; later calls override earlier ones on overlapping sides; styles wood / wrought-iron / hedge.
- `place_street_furniture` — bench, trash_can, mailbox, fire_hydrant, planter, bus_stop, stop_sign, dumpster. placement is deterministic — the system picks the slot from each kind's designated zone.
- `place_bushes` — ground-level shrubs (boxwood / hedge_round / flowering); auto-avoids buildings, parking, walkways, trees, fenced sides.
- `finalize` — exits the loop; the route also auto-finalizes if the agent runs out of iterations or hits a Gemini rate limit with a valid plan in hand.

## repo layout

```
app/
  api/
    chat/             POST — freestyle voice chat
    chat-history/     POST — ask-your-past-plans (Backboard)
    floorplan/        POST — top-down floor-plan image
    interior/         POST — rooms + furniture for one floor
    plan/             POST — main agent loop
    save-memory/      POST — persist a plan to Backboard
    tts/              POST — ElevenLabs proxy
  layout.tsx          root layout — mounts AccentApplier + LoadingCurtain + FloatingHammer
  page.tsx            landing (Hero, PromptBar, ExamplePills, voice mode buttons)
  plan/page.tsx       plan view — Scene + SideRail + DebugToggle + (InterviewFlow | FreestyleFlow)
  globals.css         tailwind v4 theme tokens
  icon.png            favicon
components/
  AccentApplier.tsx   reads accent → CSS vars
  AccentPicker.tsx    swatch picker
  ChatHistoryBox.tsx  ask questions about past plans
  ImportPlanButton.tsx  load a JSON plan from disk
  LoadingCurtain.tsx  drafting overlay between landing and plan
  PastPlans.tsx       recent plans rail (IndexedDB)
  Scene.tsx           R3F canvas + lights + camera
  SitePlanMesh.tsx    renders a SitePlan (buildings, parking, landscape)
  bg/                 grainient ogl shader background
  hammer/             FloatingHammer + Hammer3D (GLB mascot) + HammerFire
  landing/            Hero, PromptBar, ExamplePills, PromptDropdown
  models/GltfModel.tsx  generic GLB loader with auto-scale + fallback
  plan/               SideRail, Step, DebugToggle, FloorPanel, CompartmentFire
  voice/              InterviewFlow, FreestyleFlow, MuteToggle
lib/
  accent.ts           accent state
  agent.ts            client-side wrapper around /api/chat (with canned fallback)
  backboard.ts        Backboard SDK helpers (saveSession, getPreferences, chatWithHistory)
  debugStore.ts       debug overlay toggles
  exportPlan.ts       JSON download / import for a plan
  floorPlanPrompt.ts  prompt builder + cache key for /api/floorplan
  furniture.ts        FURNITURE_CATALOG + interior types and target counts
  geometry.ts         setbacks / overlap / clearance helpers (used by tools)
  mockPlan.ts         hand-written plan + step trail for offline dev
  modelConfig.ts      per-model rotateY / scaleBoost overrides
  pastPlansDb.ts      IndexedDB CRUD for past plans (max 5)
  placementZones.ts   deterministic zones for street furniture
  rateLimit.ts        in-process per-IP per-bucket limiter
  speech.ts           Web Speech API wrapper (recognition + synthesis)
  store.ts            zustand store, runFromPrompt, voice flow state
  toolDeclarations.ts function-call schemas the model sees
  tools.ts            pure tool functions — never throw, return { plan, result, ok }
  types.ts            SitePlan + Step + enums — single source of truth
  useDataUrlTexture.ts  R3F texture hook for floor-plan dataURLs
  userIdentity.ts     localStorage-backed userId + Backboard threadId
public/
  models/             hammer.glb + GLB props for trees, cars, benches, etc.
  parcel-logo.gif
scripts/
  predev-check.mjs    pre-dev RAM / Node version warning
```

## conventions

- units are feet. grid is XZ plane, Y is up, building height = `stories × 10ft`.
- origin (0, 0) is the **front-left corner** of the lot. +x runs left-to-right, +z runs front-to-back (away from the street).
- for `place_building`, `(x, z)` is the **front-left corner** of the footprint, not the center.
- the only shape that crosses the API boundary is `SitePlan`. import from `lib/types.ts`, do not redeclare.
- server-only code (Gemini SDK, ElevenLabs key, Backboard key) belongs under `app/api/`. do not import server SDKs from a client component.
- tools never throw — they return `{ plan, result, ok }`. the `result` string is what the model reads to react.
- letter-shape buildings are built as multiple `place_building` calls that share material + stories and edge-touch with no gap; `SitePlanMesh` then merges them into a single hollow shell.

## getting started

requirements:
- **Node 22** — if you have nvm: `nvm install 22 && nvm use` (a `.nvmrc` is committed).
- **at least 4 GB of free RAM** at first compile. close Chrome tabs / Discord / Spotify before running dev — the first compile of the 3D stack is heavy and can freeze a busy machine.
- a `.env.local` with at minimum `GEMINI_API_KEY` (see below).

setup:
```bash
nvm use            # picks Node 22 from .nvmrc (skip if you don't use nvm)
npm install
npm run dev
```

then open http://localhost:3000, type a prompt, and the plan animates into the 3D scene.

## environment variables

create a `.env.local` in the repo root. only `GEMINI_API_KEY` is required for the core flow; the others unlock optional features.

| Variable | Required? | Used for |
|---|---|---|
| `GEMINI_API_KEY` | **required** | `/api/plan`, `/api/chat`, `/api/floorplan`, `/api/interior`. without it, those routes return 500 / 503 and the UI falls back to a local mock plan in interview mode. |
| `BACKBOARD_API_KEY` | optional | cross-session memory — saving plans, recalling design preferences, ask-your-history chat. without it the app still works; memory features become no-ops. |
| `ELEVENLABS_API_KEY` | optional | `/api/tts`. without it, voice modes fall back to the browser's built-in `speechSynthesis`. |
| `ELEVENLABS_VOICE_ID` | optional | overrides the default Rachel voice (`21m00Tcm4TlvDq8ikWAM`). |
| `SOLANA_SECRET_KEY` | optional | NFT minting. base58-encoded 64-byte secret used by the backend to sign and pay for `/api/mint-plan` mints. without it the route returns 500 with a setup hint. generate via `npm run generate-wallet`. |
| `SOLANA_RPC_URL` | optional | overrides the default `https://api.devnet.solana.com`. only set if you have a faster devnet RPC. |

## if `npm run dev` froze your computer

short version: don't re-clone. run this instead:

```bash
npm run reset
```

that deletes `.next/`, `node_modules/`, and `package-lock.json`, then reinstalls. takes ~30 seconds. then `npm run dev` again.

if it still freezes:
1. close every other app (especially Chrome, Discord, Slack, Spotify, Docker Desktop). the first compile needs ~4 GB of free RAM.
2. try the webpack fallback: `npm run dev:legacy`. some 3D libraries occasionally trip up Turbopack.
3. confirm you're on Node 22: `node -v`. earlier versions have weaker memory behavior.

why this happens: the project bundles a heavy 3D + animation stack (three.js, react-three-fiber, drei, ogl, framer-motion). on a busy machine with little free RAM, the first compile can OOM and lock the OS. Node now has an 8 GB heap ceiling so it'll error cleanly instead of freezing your computer — but if free RAM is below ~2 GB at compile time, that ceiling won't save you.

## NFT minting (solana devnet)

after a plan finalizes, the side rail shows a **mint as NFT** button. clicking it captures the 3D canvas as a PNG, uploads it + the plan metadata to Arweave (via Irys), and mints a Metaplex Core asset directly to your Phantom wallet. the backend pays — no Phantom popups, no signing on the user side.

### one-time setup

1. **generate a backend keypair**

   ```bash
   npm run generate-wallet
   ```

   this creates a fresh keypair, base58-encodes the secret to `.env.local` as `SOLANA_SECRET_KEY`, and prints the public address. it refuses to overwrite an existing key.

2. **fund it with devnet SOL** — copy the printed address and either:

   ```bash
   solana airdrop 2 <address> --url devnet
   ```

   or paste the address into [faucet.solana.com](https://faucet.solana.com) (pick devnet). 1 SOL is plenty for many mints; airdrop limits are per-address-per-epoch, so re-run if you hit the cap.

3. **restart the dev server** so it picks up the new env var.

4. **point Phantom at devnet** — open Phantom → settings → developer settings → change network → devnet.

### testing the full flow

1. generate any plan ("0.5 acre lot, 2-story brick townhouse, oak trees along the front") and wait for the run to finalize
2. click **mint as NFT** — Phantom asks for permission to share your address (one-time per origin); approve it
3. the modal shows a spinner for ~5–15s while the backend uploads to Arweave and lands the tx
4. on success, click **view on solana explorer** — you'll see the mint, the metadata URI, and the Arweave-hosted PNG. open Phantom → collectibles (devnet) and the NFT shows up there too.

### code layout

- `lib/solana.ts` — singleton `Umi` (devnet RPC + mpl-core + Irys uploader) keyed off `SOLANA_SECRET_KEY`
- `app/api/mint-plan/route.ts` — accepts `{ imageBase64, planJson, recipientAddress, brief }`; returns `{ signature, mintAddress, metadataUri, explorerUrl }`. caps `imageBase64` at 3 MB and rate-limits to 2 mints / minute / IP.
- `lib/phantom.ts` — typed Phantom provider; reads the public key only, never signs
- `components/plan/MintNftButton.tsx` — captures the canvas (scoped to `id="plan-canvas"`), calls the endpoint, renders the success/error modal
- `scripts/generate-wallet.ts` — keypair generator, run via `npm run generate-wallet`
