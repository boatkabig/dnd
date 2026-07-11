# DND Solo — Build Progress

Branch: `feat/build-to-completion` · Baseline: **D&D 2024** · Mode: engine-first rebuild.
Last updated: 2026-07-11 (this session: stripped Claude commit-trailers via history-rewrite `45b4530`; deep "does-it-affect-gameplay" verification audit; 4 edge-bug fixes; **next = combat turn-loop migration off the bridge — see "NEXT PHASE" below**). Detailed roadmap lives at `.claude/plans/build-to-completion.md` (local, gitignored).

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
- **Content consolidation** (`2ad7bd3`+`28b7039`): dropped the dnd5eapi.co / 2014 fallback — `srd.ts` 1152→223 (spells route through `open5e.ts`), `/api/srd` route deleted, engineAdapters monster-fetch falls back to the local bestiary. Open5e v2 is the single content source.
- **De-monolith cut 2** (`61664f2`): extracted `<AdventureLog>` + `<CharacterSheet>` (incl. inventory tab) from DnDSolo (−272). Pure structural.
- **Combat-state Stage A+B** (`a214b19`): enemy HP is now owned by a persistent `cb.bridge` (`combatBridge.buildBridgeState`/`applyBridgeDamage`); every `hpNow` is a projection, all ~19 damage sites reroute through the bridge, zero independent HP arithmetic remains.
- **Combat mechanics** (`56dc64e`): death-save / 0-HP lifecycle → engine `rollDeathSave`; monster Multiattack → `planMultiattackSequence` (Bite+Claw from stat-block text); grapple/shove → engine `resolveContestedAction` (2024 rule).
- **Phase 2 — concentration** (`adbe8d6`): CON-save-on-damage, single-concentration, and end-on-0HP routed through engine `effects.checkConcentration`/`isConcentrationSpellName`.
- **Phase 3 — legality + vision + DM plan** (`b6979f9`): `magic.canCast2024` gates casts before slot/turn spend; `vision.ts` (cover, unseen adv/disadv) wired into attacks + saves; tool-calling DM = additive Stage 0 + migration plan (not flipped — needs live LLM creds). +21 tests.
- **Phase 4 — progression** (`6938471`): new `engine/progression.ts` — subclass features (granted + affect play), feat effects (Fighting Styles apply), prepared-vs-known spellcasting caps. Multiclass = plan-only. +17 tests.
- **Phase 5 — solo systems** (`0d255fe`): pure `engine/oracle.ts` (+ UI modal), `engine/sidekick.ts` (2024 archetypes), `engine/campaignMemory.ts` (persisted, fed to DM prompt). Session-zero = plan-only. +43 tests.
- **Phase 6 — economy / persistence / e2e** (`9b273f9`): `engine/economy.ts` (pricing/bargain/treasure) wired into the shop; persistence round-trip tests (v1→v4 migrate); e2e net 2→7 scenarios (oracle, sheet, long-rest, shop buy, spell-cast). +29 tests. **Suite: tsc 0 / vitest 146 / e2e 7.**

## Decisions locked

- Revive `src/lib/engine/*` as the single source of truth (engine = deterministic rules; LLM DM = narration/judgment only).
- DM contract → tool/function calling (replaces the zod single-JSON-blob validate+repair).
- Game UI state → a tiny hand-rolled store + reducer (`dispatch(action)` is the only mutation; `getState()` for async DM flows); **no new dependency**.
- Content → **Open5e API v2** (2024 document / SRD 5.2) ONLY; dnd5eapi.co / 2014 fallback dropped.
- Character level cap 20; post-20 is a separate tier/mythic layer, not continued leveling.
- Deployment is a private single-user host (localStorage persistence by design; security out of scope).

## ⚠️ NEXT PHASE (2026-07-11 review) — combat is still HYBRID: drive the turn loop off the bridge

Deep re-review confirmed the bridge is used as a per-attack CALCULATOR (a throwaway `startBridgeCombat` + `skipActionSpend:true`, `CombatView.tsx:113`), NOT the turn-loop source of truth. "Stage C landed" is display-only projection — the real turn flow is still legacy "player → all enemies". So these WRONG #1–6 correctness bugs are STILL LIVE (not mere refactor tails):

- **Initiative doesn't drive turns** — `currentInitIdx` is set at combat start and never advances; flow is player-then-all-enemies, not initiative order. `DnDSolo.tsx:1902`.
- **Surprise skips the enemy turn** — still does "enemy loses first-turn retaliation"; 2024 = disadvantage on the initiative roll ONLY, never lose a turn. `DnDSolo.tsx:3213, 3633`.
- **Movement wrong unit** — `movementLeft` held in FEET (30) but decremented per-SQUARE (1) → 30 squares instead of 6. `DnDSolo.tsx:1873, 3300`.
- **Action economy legacy** — bonus/action/reaction/movement not driven through the bridge `actionTrackers`/`spendAction`/`endTurn`.
- **HP 0 outside combat forced back to 1** — trap/DM damage can't drop the player to unconscious/death-saves. `DnDSolo.tsx:3994`.
- **Monster turn** — bridge has `endTurn`/`moveBy`/`runEnemyTurn` but the UI never drives them as the backbone.
- **Spell targeting incomplete** — many casts pick the first enemy; AoE origin fixed to the player's position.
- **Concentration data** — Spiritual Weapon wrongly in `CONCENTRATION_SPELL_NAMES` (`effects.ts:641`); concentration should derive from the spell's own `concentration` field (Open5e v2), not a hard-coded name list. (Verify Spiritual Weapon's 2024 status against Open5e v2 before changing — 2024 may differ from 2014.)

**Directive (do in this order):** migrate the whole turn loop to `CombatBridgeState` and delete legacy `cb` piece by piece — **initiative → surprise → movement → action economy → HP/death**. Maps onto the Stage C–F plan below, but the point is to DRIVE the loop off the bridge (advance `currentInitIdx`, call `endTurn`/`nextTurn`, spend from `actionTrackers`), not just project displays off it.

### Project-quality (same review)
- `tsc --noEmit` fails on a stale `.next/types/validator.ts` referencing the deleted `/api/srd` route — a build-cache artifact (clean after `rm -rf .next` / `next build`), NOT a source error; make the gate robust (build before tsc, or exclude `.next`).
- eslint: 3 errors — an archive test calls a React Hook outside a component; the compliance script uses `require()`.
- `.serena/` was untracked (now gitignored).

## Pending

Phases 0–6 are landed (see Done). What remains is refactor tails + deferred sub-items, not new phases:

- **Combat-state Stage C — LANDED**: initiative order + `currentInitIdx` now project off `cb.bridge`. The app still rolls initiative (app RNG) and prints the "Initiative" log line verbatim, but FEEDS those totals into `buildBridgeState` (new optional `RawCombatantInput.initiative`); `cb.initOrder`/`cb.currentInitIdx` are derived from `getCombatView(cb.bridge).order`, so no parallel copy is held. `createCombat`'s sort reproduces the app's prior stable descending order exactly (proven for ties — see `tests/combat-bridge.test.ts`, +5 tests). Zero e2e-visible change.
- **Combat-state Stages D–F — DEFERRED** (precise blockers): **D (round)** — `cb.round` is a per-player-turn counter driving the "รอบที่ {round}" display (`DnDSolo.tsx:5238`), incremented at 8 scattered sites (2499/2519/2992/3044/3412/3461/3759/4032); the engine's `combat.round` is per-full-initiative-cycle, a different cadence. The bridge's turn lifecycle is never driven (the app never calls `endTurn`/`nextTurn` on `cb.bridge`), so making the engine own the display value requires either a separate per-player counter (a second source again) or driving the whole turn loop across those 8 sites — out of clean, value-identical scope. **E (action economy)** — `movementLeft` has a unit quirk: `moveCost = dist` in SQUARES (`DnDSolo.tsx:3078`) decrements a budget initialized to `cc.speed` in FEET (`1670`), so the engine's feet-based `spendMovement` would change the displayed "เหลือ movement N ช่อง" number; and mapping `bonusUsed`/`extraAction`/`reactionUsed` requires driving `resetTurnActions` on the bridge at every turn boundary (same 8 sites as D). **F (delete `cb`)** — blocked on D+E, and `cb` still holds many app-only fields the engine doesn't model (`enemyPositions`, `playerPos`, `grid`, per-enemy `conditions`/`glow`/`reactionUsed`, `readyAction`, `spiritualWeapon`, `dodge`, `invisible`); full deletion needs a positions/conditions engine seam first. Stage A+B (enemy HP) + C (initiative) shipped.
- **Deferred sub-items — mostly LANDED since:** ✅ sidekick companion UI + GWM/Sharpshooter toggle + ASI-granting feats + long-rest re-prepare (`e7b637c`); ✅ extract DungeonView + DMChat panels (`5ddca0a`); ✅ session-zero wizard + exploration-turn UI (`49f262c`). **Still genuinely blocked (not skipped):** tool-calling DM route flip — needs live LLM creds to verify a switchover (Stage 0 tool descriptor + full migration plan shipped); multiclass — needs a single-class→`classLevels[]` character-model rewrite + combined-slot engine seam (file:line plan shipped). Smaller open follow-ups: sidekick HP/targeting (currently assist-only), more subclass features that affect play beyond detection.
- **Dead-code cluster** `src/lib/domains.ts` + `ruleEngine.ts` + `gameState.ts` (0 live importers) → archive (not hard-delete), owner decision. `archive/**` and `src/lib/engineDecision.md` intentionally left untouched.
- 2024-audit fixes distributed to the phase that wires each module (most defects are dormant dead-code; fixed at wiring time, keeping one 2024 copy and deleting the 2014 duplicate).

## Combat-state migration plan (task #12 — retire the legacy `cb`)

The `cb` blob (`DnDSolo.tsx:1518-1527`: `enemies[]` with `hpNow`/`conditions`, `round`, `playerFirst`, `surprise`, `bonusUsed`, `extraAction`, `movementLeft`, `hasMoved`, `initOrder`, `currentInitIdx`, `grid`, `playerPos`, `enemyPositions`) duplicates state the engine owns inside one `CombatBridgeState.combat` (`combatBridge.ts:256-260`). The pieces are NOT equally clean to migrate — stage them so each lands whole and gate-green:

- **Stage A (enabler, ship with B, never alone)**: adapter `enemyBlob → EnemyMemberInput`/`Combatant` (bestiary/SRD blobs are not `NormalizedCreature`, which `startBridgeCombat` expects), and persist `cb.bridge = startBridgeCombat(...)` in `initCombat`. On its own it's an unread second state = the disease, so it must not ship without B. Risk: MED.
- **Stage B (the big lever)**: delete `enemies[].hpNow`, derive a read-model from `getCombatView(cb.bridge)`; reroute all ~15 `.hpNow =` sites + the `.map` HP updates (weapon ~2653-2685; cleave 2530; ready-action 1679-1680; spells 2076-2226; Spirit Guardians 2815-2832; item throws 2748; map updates 896-957) through `combatBridge.performAttack`/`applyDamage`. Keep `.enemy-card`/`.hpbar-label` markup reading `e.hpNow`/`e.hp` as projected getters. Conceptually clean (matching semantics; math already bridged), but HIGH breadth.
- **Stage C**: initiative order + `currentInitIdx` — reconcile the app-RNG roll + its log line with engine-seeded `rollInitiative`, then derive from `getCombatView().order`+`phase` (UI at 4982-4983). Risk: HIGH (RNG/log values are e2e-visible).
- **Stage D**: round/turn counter — `cb.round` is a per-player-action-cycle counter (incremented at 2280/2300/2795/2847/3200/3249/3547/3783), semantically ≠ the engine's per-initiative-cycle `combat.round`; reconcile before deleting (reads at 1595, 2846-2848, 3276, 4915). Risk: MED-HIGH.
- **Stage E**: action economy — map `bonusUsed`/`extraAction`/`movementLeft`/`hasMoved` (+ `enemies[].reactionUsed` 2847/3249) onto bridge `actionTrackers` via `spendAction`/`spendMovement`/`endTurn`. Risk: MED.
- **Stage F**: delete `cb`; UI + AI-context reads go through `getCombatView`. Risk: LOW once A-E land.

## Problems / risks encountered

- **Central disease**: three parallel combat implementations (`engine/*`, root `lib/*`, inline in `DnDSolo.tsx`); only the buggy inline monolith ran; the correct engine code was dead. Being resolved by engine-as-SoT.
- **2014/2024 mixed, no single source**: correct 2024 and obsolete 2014 impls coexist in different files (exhaustion, grapple/shove, weapon-mastery set, half-caster level). Consolidating: keep 2024, delete the 2014 duplicate.
- **Recurring failure mode**: "compiles and renders but is silently inert" (the dead engine; the targeting stub). Guard: the e2e net + the rule that every change must be shown to AFFECT gameplay, not merely compile.
- **Monolith**: `DnDSolo.tsx` at 6009 lines is the maintainability + parallelism bottleneck. Being split into components + a store.
- **DM can't run locally without creds**: needs `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL` in `.env.local` (gitignored). Not blocking engine work.
- **Tech-debt from cut 1**: `CharacterCreation.tsx` re-imports `makeCharacter`/`d`/`SRD_OK` from `DnDSolo.tsx` (a circular import — tsc- and runtime-clean, but should be moved to a shared `src/lib/**` module during the store/1c work).
- **Flaky test**: the combat-bridge test makes one live `api.open5e.com` call — a network blip could redden `vitest run`. Replace with a cached fixture.
- **Process note**: a leftover background agent auto-pushed this branch to `origin` and set upstream without an explicit instruction (main untouched, no PR opened, no secrets — `.env*` and `.claude` are gitignored). Recorded for transparency.
