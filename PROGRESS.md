# DND Solo — Build Progress

Branch: `feat/build-to-completion` · Baseline: **D&D 2024** · Mode: engine-first rebuild.
Last updated: 2026-07-10. Detailed roadmap lives at `.claude/plans/build-to-completion.md` (local, gitignored).

## Architecture (target)

```
DnDSolo shell (thin) ── renders components ──> CharacterCreation / CombatView / CharacterSheet / DungeonView / DMChat / AdventureLog
        │ reads/writes via dispatch(action)
Game store + reducer  (tiny, no dep; getState() for async DM flows)  ── UI state only
        │ combat slice calls into
Rules Engine  src/lib/engine/*  ── SINGLE SOURCE OF TRUTH (pure, seeded, tested)
        ▲ tools call engine ops
LLM DM  /api/dm  (OpenAI-compatible endpoint; tool/function calling; narrates + judges, never does math)
```

## Done (committed)

- **Phase 0 — unblock + safety net** (`0df435e`): cross-platform npm scripts (node, not bun/POSIX); DM provider `z-ai-web-dev-sdk` → OpenAI-compatible SDK (env `OPENAI_BASE_URL`/`OPENAI_API_KEY`/`OPENAI_MODEL`); hardened DM apply-path (cap `on_fail_damage`, strict quest/dungeon schemas replacing `z.any()`, fix `xp_award` early-return transaction); vitest runner + 9 engine tests green.
- **UX quick-wins** (`5c69506`): creation off-by-one (confirm step reachable), mobile type sizes, 44px tap targets, auto-scroll guard, safe-area insets, sticky creation nav.
- **Engine combat core + vision** (`2862fe2`): `resolveAttack` now returns the real d20 RollResult (auditable dice + per-source modifiers, not a fabricated result); turn loop wired to action economy (per-turn budget reset/spend) + effects (turn start/end triggers); new pure vision/LOS module (senses, obscurement, cover, 2024 unseen-attacker/target rules). Tests 11/11.
- **Combat bridge** (`e528bd0`): pure API seam engine↔UI — `startBridgeCombat` / `getCombatView` / `performAttack` / `moveBy` / `endTurn` / `runEnemyTurn`; Multiattack parsed from stat-block text; enemy data mapped from Open5e v2.
- **E2E smoke net** (`e4e7fbb`): `npm run e2e` (Playwright, DM route-mocked → deterministic, no creds) drives creation → combat → attack. The regression gate for the de-monolith.
- **Analysis (not code)**: 2024 rules audit (5 blocker / 14 high / 42 med) + live gameplay-state inventory (input for the store design).

## Decisions locked

- Revive `src/lib/engine/*` as the single source of truth (engine = deterministic rules; LLM DM = narration/judgment only).
- DM contract → tool/function calling (replaces the zod single-JSON-blob validate+repair).
- Game UI state → a tiny hand-rolled store + reducer (`dispatch(action)` is the only mutation; `getState()` for async DM flows); **no new dependency**.
- Content → **Open5e API v2** (2024 document / SRD 5.2) ONLY; dnd5eapi.co / 2014 fallback dropped.
- Character level cap 20; post-20 is a separate tier/mythic layer, not continued leveling.
- Deployment is a private single-user host (localStorage persistence by design; security out of scope).

## Pending

- **In progress**: extract `<CharacterCreation>` out of the 6009-line `DnDSolo.tsx` (first monolith cut).
- **1c**: build the game store + reducer (atomic `APPLY_DM_UPDATES` fixes the partial-commit-on-error bug); rewrite the combat slice as `<CombatView>` backed by the bridge — real initiative loop, surprise, grid movement in feet, monster speed/Multiattack, target selection, grapple/shove via `combat.ts`, 0-HP→death-save lifecycle; flips the e2e target-selection tripwire green.
- Extract remaining panels (sheet / inventory / dungeon / adventure log / DM chat) → thin `DnDSolo.tsx` shell, then fan out.
- **Phase 2** death/HP/concentration · **Phase 3** tool-calling DM + spell legality (wire vision here) · **Phase 4** subclass/feats/multiclass/prepared-vs-known/equipment · **Phase 5** solo systems (sidekick, oracle, exploration, campaign memory, session zero) · **Phase 6** content/economy/persistence + delete dead code trees + e2e scenarios.
- 2024-audit fixes distributed to the phase that wires each module (most defects are dormant dead-code; fixed at wiring time, keeping one 2024 copy and deleting the 2014 duplicate).
- Replace the bridge test's live Open5e call with a cached fixture (test determinism).
- Consolidate the content layer to Open5e v2 only.

## Problems / risks encountered

- **Central disease**: three parallel combat implementations (`engine/*`, root `lib/*`, inline in `DnDSolo.tsx`); only the buggy inline monolith ran; the correct engine code was dead. Being resolved by engine-as-SoT.
- **2014/2024 mixed, no single source**: correct 2024 and obsolete 2014 impls coexist in different files (exhaustion, grapple/shove, weapon-mastery set, half-caster level). Consolidating: keep 2024, delete the 2014 duplicate.
- **Recurring failure mode**: "compiles and renders but is silently inert" (the dead engine; the targeting stub). Guard: the e2e net + the rule that every change must be shown to AFFECT gameplay, not merely compile.
- **Monolith**: `DnDSolo.tsx` at 6009 lines is the maintainability + parallelism bottleneck. Being split into components + a store.
- **DM can't run locally without creds**: needs `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL` in `.env.local` (gitignored). Not blocking engine work.
- **Process note**: a leftover background agent auto-pushed this branch to `origin` and set upstream without an explicit instruction (main untouched, no PR opened, no secrets — `.env*` and `.claude` are gitignored). Recorded for transparency.
