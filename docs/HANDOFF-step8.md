# Handoff — Step 8: after M2-T1 (Zinc ledger shell) → M2-T2 (Operations / Businesses tabs)

**Read first:** `AGENTS.md`, `docs/SPEC.md` (§2.3, §7 M2), this note. **Branch:** `m2-t1-ledger-shell`.

## State
- `npm test`: 208 tests green (+20 new). `npm run lint` clean, `npm run typecheck` clean, `npm run build` (`tsc -b`) clean.
- Bundle: JS 152 KB gzipped + CSS 4.9 KB (budget 250 KB).
- 1280x720 headless Chromium (`docs/screenshots/m2-t1-ledger-shell.png`): 0 console errors, no horizontal scroll, Street Cash 24px bold amber (largest text), Safe Cash 20px.
- `/src/engine/` untouched; no existing test assertion changed.

## What landed
- Tailwind v4 (`@tailwindcss/vite`, `src/index.css`, no animations), `@/` alias, hand-copied shadcn primitives in `src/components/ui/` (button, badge, card, tabs, tooltip, separator, popover, switch), `lucide-react`, `zustand`. Dark Zinc locked in `index.html`.
- `src/store/gameStore.ts` (vanilla `createStore` + `useGameStore`; wraps `gameReducer`), `src/store/selectors.ts` (`selectSundayProjection`, rank, net worth, incoming raids). Projection reuses engine helpers and is parity-tested against `advanceWeek`.
- `src/ui/terms.ts`: `plainEventText`, `plainRejection`, shared `plainWords` (also used by `plainStatusMessage`).
- `TopLedgerBar` (2-tier sticky HUD), `LedgerShell` (4 tabs, placeholders in 1–3, working filterable Weekly Log), `StatusToast`, `GlossaryDrawer`, `ForecastPopover`.
- `App.tsx`: ledger by default, `?greybox=1` → `GreyboxApp`. `App.test.tsx` greybox assertions now render `<GreyboxApp />` directly (same strings); new ledger/route test added.
- `AGENTS.md`: "28-week Replay Scrubber".

## Next: M2-T2
Operations + Businesses & Raids tab content using `VERBS`, `verbLock`, `rollPreview`, `buildSiegeRows`. Propose a plan first.

## Known issues / parked
- `devOmniscient` is stored and has a switch but nothing consumes it yet (Rivals tab, M2-T3).
- Projection excludes the random Heat>=70 Police Raid and in-week actions (stated in the popover).
- Weekly Log filters are text heuristics on translated events (structured events still parked).
- Tooltips/popovers have no animation by design. `TooltipProvider` is mounted but no tooltips are used yet.
- Carried over: `calculateSyndicateDefense` unused, no AI defend verb, no CI, `npm run typecheck` checks nothing (solution tsconfig; `build` is the real check).

## Out of scope
Tab 1–3 contents, Wiretap drawer, Prep modal, Recharts/Replay, engine changes, Diplomacy, Lieutenants.
