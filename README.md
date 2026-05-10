# hackdavis2026 — siteplan agent

an AI agent that turns plain-english site descriptions into valid, code-compliant 3D site plans. built for HackDavis 2026 to make early-stage site planning accessible to community groups, small developers, and affordable-housing nonprofits priced out of tools like Forma or TestFit.

## core idea

the AI never generates 3D geometry. it only fills in JSON parameters that match the `SitePlan` shape in `lib/types.ts`. the renderer turns that JSON into boxes on a grid. same architecture as Forma and TestFit.

## current status

the frontend, agent backend, and cross-session memory are all wired end-to-end.

- ✅ landing page with prompt bar, example pills, and recent plans
- ✅ floating 3D hammer mascot with drafting → sidebar fly-up
- ✅ plan route with side rail (brief, status, step trail)
- ✅ R3F scene rendering a `SitePlan` from the zustand store
- ✅ accent picker + grainient background
- ✅ `/api/plan` route with Gemini 3 Flash function-calling agent loop + tool functions (`set_lot`, `place_building`, `check_setbacks`, `place_parking`, `place_trees`, `place_walkway`, `place_fence`, `finalize`)
- ✅ Backboard memory: past plans recalled via `/api/history`, surfaced on the landing page

## stack

- Next.js 16 (App Router) — note: post-15 APIs, see `node_modules/next/dist/docs/` before writing route or server code
- React 19, Tailwind v4 (no `tailwind.config.js`, theming in `app/globals.css`)
- zustand 5 for state — `lib/store.ts`
- React Three Fiber 9.6 + drei 10 for the 3D scene
- framer-motion 12 for transitions
- ogl for the grainient background
- `@google/genai` v2 with Gemini 3 Flash, `thinkingLevel: "low"`, native function calling
- `backboard-sdk` for cross-session memory of past plans

## scripts

- `npm run dev` — start the next dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — eslint

## repo layout

```
app/
  layout.tsx          root layout, mounts FloatingHammer + accent
  page.tsx            landing (Hero, PromptBar, ExamplePills)
  plan/page.tsx       plan view (SideRail + Scene)
  globals.css         tailwind v4 theme tokens
components/
  Scene.tsx           R3F canvas
  SitePlanMesh.tsx    renders a SitePlan as boxes
  LoadingCurtain.tsx  "drafting…" overlay
  AccentApplier.tsx   accent → CSS vars
  AccentPicker.tsx    accent swatch picker
  bg/                 grainient background (ogl shader)
  hammer/             FloatingHammer + Hammer3D (GLB mascot)
  landing/            Hero, PromptBar, ExamplePills
  plan/               SideRail, Step
lib/
  types.ts            SitePlan + Step contract — single source of truth
  store.ts            zustand store, runFromPrompt drives mock steps
  mockPlan.ts         hand-written plan + step trail for offline dev
  accent.ts           accent state
public/
  models/hammer.glb   hammer mascot model
```

## conventions

- units are feet. grid is XZ plane, Y is up, building height = `stories × 10ft`.
- the only shape that crosses the API boundary is `SitePlan`. import from `lib/types.ts`, do not redeclare.
- server-only code (Gemini SDK, API key) belongs under `app/api/`. do not import server SDKs from a client component.
- when the agent is wired, every tool returns `{ plan, result, ok }` and never throws — the `result` string is what the model reads to react.

## getting started

```bash
npm install
npm run dev
```

then open http://localhost:3000, type a prompt, and the mock plan animates into the 3D scene.

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
4. on success, click **view on solscan** — you'll see the mint, the metadata URI, and the Arweave-hosted PNG. open Phantom → collectibles (devnet) and the NFT shows up there too.

### env vars

- `SOLANA_SECRET_KEY` — base58-encoded 64-byte secret. backend signs and pays with this.
- `SOLANA_RPC_URL` — optional; defaults to `https://api.devnet.solana.com`. only override if you have a faster devnet RPC.

### code layout

- `lib/solana.ts` — singleton `Umi` (devnet RPC + mpl-core + Irys uploader) keyed off `SOLANA_SECRET_KEY`
- `app/api/mint-plan/route.ts` — accepts `{ imageBase64, planJson, recipientAddress, brief }`; returns `{ signature, mintAddress, metadataUri, solscanUrl }`
- `lib/phantom.ts` — typed Phantom provider; reads the public key only, never signs
- `components/plan/MintNftButton.tsx` — captures the canvas, calls the endpoint, renders the success/error modal
- `scripts/generate-wallet.ts` — keypair generator, run via `npm run generate-wallet`

