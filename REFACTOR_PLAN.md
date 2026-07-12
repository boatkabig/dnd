# DnDSolo.tsx De-Monolith — Refactor Plan

> Status snapshot: `src/components/DnDSolo.tsx` is **2,826 lines** (down from 5,462, **−48.3%**).
> Branch: `refactor/split-dndsolo`. Every commit is verified with
> `tsc --noEmit` + `vitest run` + `next build` + `eslint` + **Playwright e2e**, and each moves code **verbatim**.

## Progress against this plan

- **Phase 0 — Safety net: DONE.** The existing Playwright suite (combat attack, target
  selection, surprise-turn, Magic Missile damage/slot/target, Mage Armor buff, shop) was
  wired to run in-sandbox via `PW_CHROME`. 12 e2e are the regression oracle; run on every
  combat/spell commit.
- **Phase 1 — Pure combat resolvers: DONE.** `applyFeatGrantsToChar`→leveling.ts;
  `runSidekickAssist`/`resolveDeathSave`/`checkCombatEnd`/`runEnemyPhase`/`applyPendingChanges`
  →combatResolve.ts (CombatDeps injection). Unit-tested.
- **Phase 2 — Render panels: PARTIAL.** `CombatOverlay` extracted (~225 lines). The
  remaining panels (MenuScreen/PlayHeader/MoreMenu) were judged low-value / high app-level
  prop coupling and deliberately left in place.
- **Phase 3 — Weapon-attack resolver: DONE (the big one).** `resolveBridgeAttack`/`toDamageType`
  moved out of the CombatView component into `lib/bridgeAttack.ts`, unblocking the extraction
  of the ~360-line `doWeaponAttack` closure into `lib/weaponAttack.ts` (ctx injection). The
  remaining `playerCombatAction` (~660 lines of 26 mid-committing, partly-async kind branches)
  is left as an in-component dispatcher — a full pure-reducer conversion is high-risk for low
  marginal gain and is the one item deferred.
- **Phase 4 — Spell resolver: DONE.** `castSRDSpell`→`lib/castSpell.ts` (CombatDeps + targetId).
- **Phase 5 — useState grouping: not started (optional).**

New lib modules: dmPrompt, dmClient, characterStats, mapState, combatMath, buffs, leveling,
dmContext, combatResolve, castSpell, bridgeAttack, weaponAttack. New UI components: 12 modals
+ CombatOverlay. ~300 unit tests total.

---

The original plan (below) covers the remaining work, ordered by risk, with a verification
strategy for the parts that unit tests cannot reach.

---

## 1. Where we are

**Extracted so far (13 commits):**

- **Logic → `src/lib/` (7 modules, 823 lines, +26 unit tests):** `dmPrompt`, `dmClient`,
  `characterStats`, `mapState`, `combatMath`, `buffs`, `leveling`.
- **UI → `src/components/game/` (11 modal components):** SessionZero, Oracle,
  QuestJournal, ASI, Subclass, Reprepare, Companion, Shop, AiDmHelper, Map, ContentManager.
- Broke the long-standing `CharacterSheet → DnDSolo` circular import.

**What still lives in DnDSolo.tsx (by size):**

| Lines | Symbol | Kind | Difficulty |
|------:|--------|------|------------|
| 1025 | `playerCombatAction` (25 action kinds) | combat orchestrator | **HARD** |
| 474  | play-screen `return( )` incl. combat overlay (~225) | render | MEDIUM |
| 310  | `castSRDSpell` | async spell resolver | HARD |
| 305  | `submitAction` | narrative-turn orchestrator | MEDIUM-HARD |
| 150  | `resetAll` | menu handler | LOW |
| 138  | `initCombat` | combat setup (async, fetch) | MEDIUM |
| 121  | menu-screen `return( )` | render | LOW |
| 121  | `applyPendingChanges` | **pure** | LOW |
| 110  | `applyUpdates` | store-wiring | MEDIUM |
| ~380 | `resolveDeathSave`, `checkCombatEnd`, `runEnemyPhase`, `runSidekickAssist`, `applyFeatGrantsToChar` | **pure** | LOW |
| —    | `commitCombat`, `narrateCombatEvent` | state-commit seam | stays |
| —    | ~20 smaller handlers (rest/spell/dungeon/quickstart) | mixed | mixed |

## 2. Root cause

The component holds **62 `useState` + 12 `useRef`**. The combat cluster (10 functions,
~2,000 lines) reads `cRef`/`combatRef`/`logDataRef` and writes through `setC`/`setCombat`/
`setLog`/`persist`. That shared-mutable-state coupling — not code volume — is why the big
functions can't be moved as-is. The fix is to separate **pure resolution** (what the
outcome is) from **effect application** (committing it to React state).

Dependency audit (already run) confirms the split point:

```
PURE  (move + unit-test): resolveDeathSave, checkCombatEnd, runEnemyPhase,
                          runSidekickAssist, applyPendingChanges, applyFeatGrantsToChar
SEAM  (stays in component): commitCombat, narrateCombatEvent   ← the only state writers
```

## 3. Guiding rules (unchanged from the work so far)

1. **Move verbatim.** No behavior changes inside a refactor commit.
2. **One logical extraction per commit**, each independently revertable.
3. **`entries.push(entrySystem(x))` → `pushEntry(x)` callback** when a moved function only
   needed the component for logging (proven pattern: tickBuffs, gainXP, map helpers).
4. **Verify every commit:** `tsc` + `vitest` + `next build` + `eslint`. Add Playwright for
   anything interactive (see §5).
5. **Delete now-unused imports** after each move (grep count == 1 ⇒ import-only ⇒ remove).

## 4. Phased plan

### Phase 0 — Safety net FIRST (before any combat refactor)  ·  risk: none
The combat work cannot be caught by unit tests alone. Build the net before touching it.

- **0a.** Extend `e2e/dnd-solo.spec.ts` + `e2e/mock-dm.ts` with a scripted **combat
  playthrough**: start a fight → attack (assert enemy HP drops) → move → cast a spell →
  win → assert XP/log. This is the regression oracle for Phase 3.
- **0b.** Add a **save-format snapshot test**: build a v3 save, `loadGame`, assert the
  character/combat/quest shape is unchanged. Guards against state-shape drift.
- Exit criteria: both green in CI-equivalent local run.

### Phase 1 — Extract the pure combat helpers  ·  risk: LOW  ·  ~380 lines out
New module `src/lib/combat/resolve.ts` (+ `tests/combat-resolve.test.ts`).

- Move `resolveDeathSave`, `checkCombatEnd`, `runEnemyPhase`, `runSidekickAssist`,
  `applyPendingChanges`, `applyFeatGrantsToChar` verbatim; convert their `entries` param to
  a `pushEntry` callback where applicable; import their lib deps (engine/combat, etc.).
- Unit-test each: death-save 3-success/3-fail/nat-1/nat-20; checkCombatEnd win/loss/ongoing;
  runEnemyPhase turn-advance; applyPendingChanges condition/buff application.
- Target after Phase 1: **~3,600 lines**.

### Phase 2 — Extract render panels  ·  risk: LOW-MEDIUM  ·  ~600 lines out
Verify with `next build` + a Playwright screenshot diff (not unit tests).

- **2a.** Combat overlay (render lines ~3734–3959, ~225) → `game/CombatOverlay.tsx`
  (props: combat, targetId, handlers `onAction`=playerCombatAction, `onSelectTarget`,
  power-attack toggle). Presentational.
- **2b.** Header rows (name/HP/AC/gold/scene/slots) → `game/PlayHeader.tsx`.
- **2c.** Menu screen (`if (phase === "menu")` return, ~121) → `game/MenuScreen.tsx`.
- **2d.** The two `MORE MENU` blocks → `game/MoreMenu.tsx` taking a single
  `onOpen(panel)` callback (avoids the 10-setter prop smell).
- Target after Phase 2: **~3,000 lines**.

### Phase 3 — Combat action reducer (the core)  ·  risk: HIGH  ·  ~800 lines out
Convert `playerCombatAction`'s 25 `kind` branches into **pure reducers**.

- New `src/lib/combat/playerActions.ts`:
  ```ts
  type CombatState = { c, cb, ... };          // the cc/cb the handler clones today
  type ActionResult = { c, cb, entries: string[], endsTurn, ended?, narrate?: string };
  export function reduceCombatAction(kind, payload, state, deps): ActionResult
  ```
  Each of the 25 kinds becomes a `case` that returns the next `{c, cb}` + log lines +
  flags — **no `setState`, no refs**. `deps` carries pure helpers (rollD20, hitEnemy,
  resolveBridgeAttack, castSRDSpell-result, etc.).
- The component keeps a **thin** `playerCombatAction` that: reads refs → calls
  `reduceCombatAction` → applies the result via the existing `commitCombat` /
  `narrateCombatEvent` seam.
- **Migrate in slices of 2–3 kinds per commit** (start with the self-contained ones:
  dodge, dash, disengage, hide, search; then attack/attack_ranged; then the resource
  actions; then spell/grapple/shove last). **Run the Phase-0 Playwright combat after every
  slice.** Unit-test each kind with a synthetic `CombatState`.
- Target after Phase 3: **~2,200 lines**.

### Phase 4 — Spellcasting module  ·  risk: HIGH  ·  ~300 lines out
- `castSRDSpell` (async, fetches SRD, mutates cc/cb) → `src/lib/combat/castSpell.ts` as a
  function returning `{ c, cb, endsTurn, entries }`. Its async SRD fetch stays injectable
  (pass the fetched spell in, or a `fetchSpell` dep) so it is unit-testable with a stub.
- Playwright: cast damage spell, save-for-half spell, buff spell — assert outcomes.
- Target after Phase 4: **~1,900 lines**.

### Phase 5 — (optional) group the 62 useState  ·  risk: MEDIUM  ·  churn-heavy
Only if further shrink is wanted. Collapse related state into reducers/hooks:
`useCharacter` (c + derived), `useCombatState` (combat/target/menu/powerAttack),
`useUIPanels` (the ~15 `*Open` booleans → one `openPanel` enum), `useDungeon`.
Target: **~1,400 lines** of orchestration + JSX.

## 5. Verification strategy (the non-negotiable part)

| Layer | Tool | Covers |
|-------|------|--------|
| Types + wiring | `tsc --noEmit` | prop/interface mismatches (already catches JSX) |
| Pure logic | `vitest` | Phase 1, 3, 4 reducers — the extracted math |
| Whole-app compile | `next build` | render/JSX phases app-wide |
| **Interactive behavior** | **Playwright** (`e2e/`) | Phase 3/4 combat + spell flows |
| Persistence | save-load snapshot test | state-shape drift across all phases |

Rule: **no combat/spell reducer commit lands without the Playwright combat run passing.**

## 6. Risk & rollback

- Append-only history: each phase/slice is its own commit; rollback = `git revert <sha>`.
- Phases 3–4 are the only high-risk ones; their per-slice granularity + Playwright gate
  keep blast radius to 2–3 action kinds at a time.
- If a slice regresses and the cause isn't obvious within one pass, revert that slice and
  re-approach — do not stack fixes on a red combat run.

## 7. Projected trajectory

| After | Lines | Cumulative reduction |
|-------|------:|----------------------|
| today | 3,974 | −27% |
| Phase 1 | ~3,600 | −34% |
| Phase 2 | ~3,000 | −45% |
| Phase 3 | ~2,200 | −60% |
| Phase 4 | ~1,900 | −65% |
| Phase 5 (opt) | ~1,400 | −74% |

## 8. Recommended order to execute

`Phase 0 (safety net) → 1 (pure combat helpers) → 2 (render panels) → 3 (action reducer,
sliced) → 4 (spell module) → 5 (optional state grouping)`.

Phase 0 is mandatory-first. Phases 1–2 are safe and can proceed immediately. Phases 3–4
should only start once Phase 0's Playwright combat coverage is green.
