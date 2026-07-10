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
- **De-monolith cut 1 — `<CharacterCreation>`** (`1644582`): extracted the 11-step wizard (all `cc*` state + validation + confirm step) into `src/components/game/CharacterCreation.tsx` (544 lines) with an `onComplete(character)/onCancel()` interface. Pure structural; `DnDSolo.tsx` −527 lines (6052 → ~5525). Verified tsc 0 / vitest 12/12 / e2e green.
- **Analysis (not code)**: 2024 rules audit (5 blocker / 14 high / 42 med) + live gameplay-state inventory (input for the store design).
- **Game store + reducer** (`src/lib/store/**`): standalone, hand-rolled, zero-dependency store (`createStore` → `getState`/`dispatch`/`subscribe`) with a PURE reducer. Headline: `APPLY_DM_UPDATES` is atomic — it builds a brand-new state in full and only commits at the end, so a malformed payload that throws mid-application rolls back everything (fixes the legacy partial-commit bug where `setQuests`/`setGameTime`/`setPhase` fired in-flight). Log ids come from a `_seq` counter in state (no `Date.now`/`Math.random`), so `(state, action)` is deterministic. Rules-heavy follow-ups surface as `pending` signals (`levelUp`/`shortRest`/`longRest`) for the engine to resolve — the store stays UI-state-only. TDD: 29 tests (per-field application, atomicity, purity, determinism, container contract). (`8ff3b51`)
- **1c-a — store wired into `DnDSolo.tsx`** (`424d4b3`): the DM-update path now routes the `ValidUpdates` subset through the store's atomic `APPLY_DM_UPDATES` reducer (no more partial-commit), while the DnDSolo-specific extras stay layered on top and unchanged (consumable heal/cure, forced-march exhaustion, full `gainXP` level-up class math, death→phase). tsc 0 / vitest green / e2e green.
- **1c-b — bridge-backed combat attack seam + target selection** (`2b6c965`): new `src/components/game/CombatView.tsx`. `resolveBridgeAttack()` runs every player weapon attack's to-hit + crit + base damage through `combatBridge.performAttack` → `resolveAttack` (the previously-dead engine now executes on every attack); feature dice still layer on top; single resistance pass preserved. `CombatEnemyList` is a real target picker — clicking an enemy sets `combatTargetId`, attacks land on the chosen enemy. Flips e2e test 2 from `test.fail()` to a real pass. tsc 0 / vitest 41/41 / e2e 2/2.
- **Deterministic bridge test** (`2300109`): the combat-bridge test's live `api.open5e.com` brown-bear call is replaced by a cached fixture via an injectable `setOpen5eFetch` seam in `open5e.ts` — full loader path still exercised, suite is now green offline.

## Decisions locked

- Revive `src/lib/engine/*` as the single source of truth (engine = deterministic rules; LLM DM = narration/judgment only).
- DM contract → tool/function calling (replaces the zod single-JSON-blob validate+repair).
- Game UI state → a tiny hand-rolled store + reducer (`dispatch(action)` is the only mutation; `getState()` for async DM flows); **no new dependency**.
- Content → **Open5e API v2** (2024 document / SRD 5.2) ONLY; dnd5eapi.co / 2014 fallback dropped.
- Character level cap 20; post-20 is a separate tier/mythic layer, not continued leveling.
- Deployment is a private single-user host (localStorage persistence by design; security out of scope).

## Pending

- **Next (resume here)** — finish the combat migration begun in 1c-b: (a) migrate combat **state** (initiative/round/turn loop, enemy HP) to a bridge-owned `CombatBridgeState` rendered via `getCombatView`, retiring the legacy `cb` object + inline `playerCombatAction`/`enemyAttacks` loops; (b) wire monster **Multiattack**, the engine **death-save** lifecycle, and **grapple/shove** (`combat.ts`) through the bridge. Also revisit the 1c-b re-plumb notes: Savage Attacker's `_lastWeaponDamageRoll.total` is now post-ability-mod, the combat log lost per-die detail, and the adv/disadv "ghost die" is no longer shown.
- Extract remaining panels (sheet / inventory / dungeon / adventure log / DM chat) → thin `DnDSolo.tsx` shell, then fan out.
- **Phase 2** death/HP/concentration · **Phase 3** tool-calling DM + spell legality (wire vision here) · **Phase 4** subclass/feats/multiclass/prepared-vs-known/equipment · **Phase 5** solo systems (sidekick, oracle, exploration, campaign memory, session zero) · **Phase 6** content/economy/persistence + delete dead code trees + e2e scenarios.
- 2024-audit fixes distributed to the phase that wires each module (most defects are dormant dead-code; fixed at wiring time, keeping one 2024 copy and deleting the 2014 duplicate).
- Consolidate the content layer to Open5e v2 only — drop the dnd5eapi.co / 2014 fallback in `src/lib/srd.ts` (1152 lines, imported live by DnDSolo / CharacterCreation / engineAdapters / combatBridge / spells) + the `/api/srd` route. A cross-cutting refactor: each of the 5 importers must be verified against the Open5e v2 shape. Deferred (not a quick task).

## Problems / risks encountered

- **Central disease**: three parallel combat implementations (`engine/*`, root `lib/*`, inline in `DnDSolo.tsx`); only the buggy inline monolith ran; the correct engine code was dead. Being resolved by engine-as-SoT.
- **2014/2024 mixed, no single source**: correct 2024 and obsolete 2014 impls coexist in different files (exhaustion, grapple/shove, weapon-mastery set, half-caster level). Consolidating: keep 2024, delete the 2014 duplicate.
- **Recurring failure mode**: "compiles and renders but is silently inert" (the dead engine; the targeting stub). Guard: the e2e net + the rule that every change must be shown to AFFECT gameplay, not merely compile.
- **Monolith**: `DnDSolo.tsx` at 6009 lines is the maintainability + parallelism bottleneck. Being split into components + a store.
- **DM can't run locally without creds**: needs `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL` in `.env.local` (gitignored). Not blocking engine work.
- **Tech-debt from cut 1**: `CharacterCreation.tsx` re-imports `makeCharacter`/`d`/`SRD_OK` from `DnDSolo.tsx` (a circular import — tsc- and runtime-clean, but should be moved to a shared `src/lib/**` module during the store/1c work).
- **Flaky test**: the combat-bridge test makes one live `api.open5e.com` call — a network blip could redden `vitest run`. Replace with a cached fixture.
- **Process note**: a leftover background agent auto-pushed this branch to `origin` and set upstream without an explicit instruction (main untouched, no PR opened, no secrets — `.env*` and `.claude` are gitignored). Recorded for transparency.
