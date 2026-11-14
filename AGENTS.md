# AGENTS.md — Syndicate Ledger Engineering Rules

Project Specification: @[Spec](docs/SPEC.md)

You are building **Syndicate Ledger**, a deterministic, client-side turn-based crime strategy game and Utility AI portfolio showcase. Follow every invariant below without exception.

## 1. Workflow Protocol (Explore -> Plan -> Execute)
- **Plan Before Writing:** When given a Task ID (e.g., `W1-T1`), inspect existing files first and output a brief file-by-file plan. Wait for approval if in interactive review mode before editing files.
- **Strict Scope Fence:** Implement **ONLY** the requested Task ID. Do NOT proactively scaffold future milestones (e.g., do not build Diplomacy, Lieutenants, or `shadcn/ui` components during Week 1–2 tasks; stub minimal fields only if required by types).
- **Test-Gated Completion:** Every task touching `/src/engine/` or `/src/data/` MUST add or update `Vitest` unit tests and pass `npm test` + `npm run typecheck` with zero errors before completion.
- **Never Weaken Tests:** Never delete or loosen an existing test assertion just to force a green build. Surface math/balance mismatches explicitly.

## 2. Hard Architectural Invariants
- **Engine Purity (`/src/engine/`):** Files inside `/src/engine/` MUST be 100% pure TypeScript. They are strictly forbidden from importing `react`, `zustand`, DOM/`window` APIs, `localStorage`, or CSS. The engine must execute headlessly in Node.js for CLI Monte Carlo simulations.
- **Strict Determinism:** `Math.random()`, `Date.now()`, and `crypto.randomUUID()` are **BANNED** inside `/src/engine/`. All randomness must flow through the seeded `mulberry32` PRNG state stored in `GameState.rngState`. Given an identical seed and action sequence, `advanceWeek()` must produce a bit-identical `GameState`.
- **Integer Math Only:** Store all currency (`dirtyCash`, `cleanCash`, payouts, payroll) as **whole integers** (`$1` units). Store probabilities and Heat as integers (`0` to `100`). Never leave unrounded floats in `GameState`.
- **Immutability & Replay Snapshots:** Engine reducers must treat input `GameState` as read-only and return a new `GameState` plus structured `DecisionTrace` logs so the 52-week Replay Scrubber can inspect any historical week.
- **Zero-Cheat AI Symmetry:** AI syndicates MUST validate and execute actions through the exact same `applyAction()` and weekly economy functions used by the human player. Never give AI hidden resource bonuses or rule exemptions.

## 3. Code & UI Standards
- **TypeScript Strictness:** `strict: true`, `noUncheckedIndexedAccess: true`, zero `any`, zero `@ts-ignore`. Validate static JSON data in `/src/data/` using `zod`.
- **UI Constraint (Milestone 2+ Only):** Weeks 1–3 use raw semantic HTML tables/buttons only (greybox). From Milestone 2 onward, use stock `shadcn/ui` (`Zinc` dark palette), `Tailwind CSS` utility classes, `Lucide` icons, and `Recharts` only. Do NOT write custom `.css` animation files or canvas maps.
- **Static Deployment Only:** Zero backend servers, zero external runtime API calls, zero secret keys. Everything runs client-side on Cloudflare Pages / Vercel (`< 250 KB` gzipped bundle budget).
