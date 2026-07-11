# DnDSolo — D&D 2024 Systems Audit

> Updated: 2026-07-11  
> Scope: source code and automated tests currently present in this repository.  
> Purpose: an implementation backlog for a Solo D&D AI DM, not legal rules advice.

## Executive result

The project has a strong foundation: typed engine modules, combat bridge state, 2024-oriented character data, oracle/sidekick/session-zero support, persistence, and 219 passing tests.  It is **not yet a rules-complete or world-complete D&D 2024 game**.  The primary risk is not a single missing screen; it is that several good domain models exist beside a different, simplified live runtime model.

Most urgent correctness work:

1. Fix stabilization at 0 HP (the current test and implementation treat it as 1 HP).
2. Replace name-based concentration with spell metadata; the list wrongly includes *Spiritual Weapon*.
3. eliminate or quarantine legacy 2014 exhaustion data that conflicts with the 2024 implementation.
4. finish the authoritative-state migration: CombatBridgeState / item instances / world locations must drive play, not merely coexist with legacy UI state.
5. implement a persistent spatial world graph before choosing a global hex-grid renderer.

## Evidence and method

### Repository checks run

| Check | Result | Meaning |
|---|---:|---|
| `npm test` | 18 files, 219 tests passed | Good regression baseline; does not demonstrate every table rule or UI path. |
| `npm run typecheck` | passed | TypeScript compilation is clean. |
| `npm run lint` | passed, 1 warning | `src/lib/engineAdapters.ts` has an unused eslint-disable directive. |
| Git worktree | user-modified `src/components/DnDSolo.tsx` | Preserve it; do not overwrite it during refactors. |

### Rules references used

The audit is aligned to the official [D&D 2024 Basic Rules](https://www.dndbeyond.com/sources/dnd/br-2024), especially [Playing the Game](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game/), [Rules Glossary](https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary/), [Spells](https://www.dndbeyond.com/sources/dnd/br-2024/spells/), and [Equipment](https://www.dndbeyond.com/sources/dnd/br-2024/equipment). These pages cover the player rules, DM toolbox, conditions, rests, travel, magic items, and combat framework. This document paraphrases rules rather than reproducing them.

### Status vocabulary

| Status | Meaning |
|---|---|
| Implemented | Present in the live runtime with meaningful tests. |
| Partial | Present but simplified, incomplete, or not authoritative. |
| Model only | Useful types/data exist but the live campaign does not reliably use them. |
| Missing | No sufficient runtime system found. |
| Incorrect | Contradicts a 2024 rule or has a proved implementation defect. |

## Whole-system inventory

| Area | Status | Current assessment |
|---|---|---|
| Session zero, campaign memory, oracle, sidekick | Implemented | Important solo-specific foundations are present and tested. |
| Ability checks, d20 rolls, proficiency | Partial | Core mechanic exists; contextual adjudication is DM/LLM dependent. |
| Initiative / turns | Partial | Bridge-backed order is now used; legacy combat mirrors remain. |
| Surprise | Partial | Earlier “skip enemy turn” behavior is gone; regression coverage is still absent. |
| Movement / range | Partial | Foot-based 5-foot movement conversion is fixed; terrain, size, and path rules are incomplete. |
| Actions, bonus actions, reactions | Partial | Main action economy exists; trigger-driven reaction ledger is incomplete. |
| Attacks / damage / criticals | Partial | Normal loop exists; 0-HP edge cases remain incomplete. |
| Death saves / stabilization | Incorrect | Stable creature is incorrectly changed to 1 HP. |
| Conditions | Partial | Effects exist but no complete condition authority, expiry/event matrix, or all 2024 effects. |
| Exhaustion | Incorrect / conflicting | A 2024 path coexists with an old 2014-style table. |
| Spells / slots / targeting | Partial | Target selection and AoE origin improved; generic spell legality and geometry are incomplete. |
| Concentration | Incorrect | Hard-coded name list is incomplete and includes a non-concentration spell. |
| Short and long rests | Partial | Engine helpers exist; live rest workflow does not implement all entry/choice/interruption rules. |
| Character creation / advancement | Partial | Good data/tests; level, multiclass, feat, prerequisite, and migration coverage needs review. |
| Equipment / wealth | Partial / model split | Engine equipment model is richer than string-based live inventory. |
| Magic items / attunement / crafting | Partial | Data concepts exist; lifecycle and item-instance behavior are not authoritative. |
| Monsters / encounter building | Partial / model split | Combat can run monsters; complete stat-block systems are not consistently live. |
| Exploration / travel / hazards | Partial | Exploration module exists; procedure, time, supplies, travel pace, and hazard loop are incomplete. |
| Settlements / maps / rooms | Model only / Missing | No unified persistent hierarchical location system drives the campaign. |
| Doors / connections / visibility | Missing | Links are data fields, not a stateful traversal and perception system. |
| NPC social world | Partial / model split | Attitude/reputation are simple records; NPCs lack live location, schedule, knowledge, and relations. |
| Shops / economy | Partial | Buy/sell UI exists but relies on global catalog and player-gold heuristics rather than merchant state. |
| Quest engine | Partial / model split | Journal/reducers exist; objectives and branches are not event-driven game state. |
| AI DM output safety | Partial | Typed schema and atomic updates improved reliability; rules/world authority is still too diffuse. |

## Detailed findings

### Combat and survival

#### COMBAT-01 — Two combat state authorities remain

- **Status:** Partial; high architectural risk.
- **Evidence:** `src/components/DnDSolo.tsx` maintains legacy combat fields while using `CombatBridgeState` through `getCombatView`, `endTurn`, `moveBy`, and bridge damage helpers.
- **Why it matters:** initiative, current actor, spent resources, death state, movement, and conditions can drift when both representations are changed by separate paths.
- **Required end state:** one `CombatState` is authoritative. UI-only fields may be derived, never independently mutated.
- **Acceptance tests:** replay the same combat action log through reducer/engine and UI commands; assert identical actor, HP, resources, conditions, movement, and round after every event.

#### COMBAT-02 — Movement is corrected but geometry is not complete

- **Status:** Partial.
- **Evidence:** live movement converts grid steps into 5-foot cost and tracks movement in feet. This corrects the previous 5x mismatch.
- **Missing:** difficult terrain cost; flying/swimming/climbing/burrowing modes; creature size/footprint; legal-path validation; diagonal/corner policy; squeezing; prone/crawl; occupied-space and opportunity-attack transitions; terrain elevation; door traversal.
- **Rules reference:** combat uses 5-foot spaces where a grid is used, but a grid is a play aid rather than a requirement. See [Playing the Game](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game/).
- **Acceptance tests:** difficult terrain consumes 10 feet per 5-foot square; a Large creature footprint cannot pass a 5-foot choke; a closed door blocks path and line of sight.

#### COMBAT-03 — Surprise needs a rules regression test

- **Status:** Partial, likely behavior corrected.
- **Evidence:** current live paths clear `cb.surprise` and continue the turn rather than returning early. That is compatible with 2024 surprise applying Disadvantage to Initiative, rather than a skipped turn.
- **Missing:** a dedicated surprise test; initiative effect must be applied exactly once before ordering.
- **Acceptance test:** surprised creature retains a turn and rolls initiative with Disadvantage; no extra lost turn is introduced.

#### DEATH-01 — Stabilized is not 1 HP

- **Status:** Incorrect; priority P0.
- **Evidence:** `tests/death-save.test.ts` expressly expects “3rd success stabilizes and snaps hp to 1”. `applyDeathSaveRoll` follows that model.
- **2024 expectation:** a stable creature remains at 0 HP and Unconscious. Without healing, it regains 1 HP after 1d4 hours. See the [Rules Glossary](https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary/).
- **Fix:** model `hp: 0`, `stable: true`, `unconscious: true`, plus a recovery timer/event. Only magical healing, successful rest/recovery event, or another defined rule restores HP.
- **Tests:** stable state does not permit actions; damage at 0 updates death failures; recovery after 1d4 hours changes HP to 1; healing ends death-save/stable tracking correctly.

#### DEATH-02 — 0-HP rule family is incomplete

- **Status:** Partial; P0/P1 depending on campaign lethality.
- **Missing / verify:** instant death from massive damage; damage while at 0 HP; critical hit counting two death-save failures; Medicine check and Healer’s Kit stabilization; unconscious condition; temporary HP interaction; death state cleanup on healing.
- **Positive change:** out-of-combat 0-HP actions now route into death-save resolution rather than clamping HP, which is a meaningful fix.

### Conditions, effects, rests, and time

#### EFFECT-01 — Conditions need a declarative rules engine

- **Status:** Partial.
- **Current problem:** conditions/buffs are represented in several places and are difficult to apply consistently to initiative, rolls, movement, targeting, and expiry.
- **Required model:** effect source, target, start event, duration unit, concentration flag, stacking rule, save/escape cadence, modifier list, and deterministic expiry trigger.
- **Acceptance test:** applying/reapplying condition, turn-start/end expiry, save-at-end, concentration loss, and rest expiry all pass through one engine API.

#### EFFECT-02 — Concentration is name-based and wrong

- **Status:** Incorrect; P0.
- **Evidence:** `src/lib/engine/effects.ts` exports `CONCENTRATION_SPELL_NAMES`; it includes `Spiritual Weapon`, which does not require Concentration, and can only cover a small hand-maintained subset.
- **Fix:** add `concentration: boolean` to canonical spell definitions. Effects must preserve `sourceSpellId`, `casterId`, and duration. Resolve concentration checks on qualifying damage through the engine, and end all source effects on failure/incapacitation/death as rules require.
- **Tests:** *Spiritual Weapon* never occupies concentration; two actual concentration spells cannot coexist; damage triggers correct saving throw; ending concentration removes linked effects only.

#### EFFECT-03 — Exhaustion data conflicts

- **Status:** Incorrect / maintainability P0.
- **Evidence:** `src/lib/gameData.ts` contains 2024-oriented exhaustion handling, while `src/lib/engine/rest.ts` retains an old table based on disadvantage/halved speed/HP maximum reduction.
- **2024 expectation:** exhaustion imposes a cumulative D20 Test penalty and speed reduction by level, with death at level 6; do not mix it with the former table. See the [Rules Glossary](https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary/).
- **Fix:** one `rulesVersion: '2024'` table, one modifier pipeline, migration for saved campaigns, and a guard banning imports of obsolete tables.

#### REST-01 — Long-rest eligibility and interruptions are incomplete

- **Status:** Partial.
- **Evidence:** DnDSolo delegates recovery math to engine helpers, but the live entry path primarily checks combat/thinking and elapsed time.
- **Missing:** the 2024 requirement to start the rest with at least 1 HP; explicit interruption tracking; a player-facing long-rest activity/time record; all recovery consequences applied atomically.
- **Acceptance tests:** cannot start at 0 HP; interrupted rest does not grant full recovery unless conditions are met; HP, Hit Point Maximum, slots, and exhaustion resolve once.

#### REST-02 — Short rest must offer sequential Hit Die choices

- **Status:** Partial.
- **Evidence:** current flow rolls one available Hit Die and completes the rest.
- **Fix:** begin rest, allow the player to spend zero or more Hit Dice one at a time, show result and remaining dice, then explicitly finish; support relevant class/feature recovery separately.

#### TIME-01 — No unified campaign clock/event scheduler

- **Status:** Missing; P1.
- **Why it matters:** rests, travel, shop stock, NPC schedules, quest deadlines, ongoing effects, random encounters, and stable recovery all need the same clock.
- **Required model:** `CampaignTime`, scheduled events with conditions, and deterministic advancement API. Never have UI components directly add arbitrary hours.

### Magic and character rules

#### MAGIC-01 — Spell legality is not data-complete

- **Status:** Partial.
- **Present:** slot checks, selected-target handling, and AoE-origin handling have recently improved; auto-hit damaging spells are now classified correctly.
- **Missing:** target type/count; range/line of sight; area shapes (cone, line, cube, cylinder, emanation); components and costly/consumed materials; focus/free-hand constraints; casting time; ritual procedure; reaction triggers; per-turn spell-slot rule; duration and upcasting metadata.
- **Rules reference:** [Spells](https://www.dndbeyond.com/sources/dnd/br-2024/spells/).
- **Fix direction:** schema-first spell catalogue plus `validateCast(state, castIntent)` returning structured reasons, then `resolveCast`.

#### MAGIC-02 — Spell effects are too bespoke

- **Status:** Partial.
- **Risk:** individual spell-name branches cannot scale to the rules corpus and invite silent behavior divergence.
- **Required primitives:** attack roll, saving throw, healing, damage formula, condition, summoned entity, terrain/zone, forced movement, resource restoration, choice prompt, and scripted exception hook.

#### CHAR-01 — Advancement needs a single legal-build validator

- **Status:** Partial.
- **Check and implement:** class feature choices, feat prerequisites, ability-score choices, spell preparation/known spell limits, multiclass prerequisites and slot progression, background/origin grants, retraining/legacy campaign migration.
- **Acceptance test:** every saved character validates on load and produces actionable migration errors rather than silently dropping illegal state.

### Equipment, economy, monsters

#### ITEM-01 — Engine item model and live inventory are split

- **Status:** Partial / model split; P1.
- **Evidence:** `src/lib/engine/equipment.ts` has richer definitions and slots, while the live UI still depends heavily on string-like inventory/worn fields.
- **Consequences:** no dependable per-item quantity, charges, ownership, container, weight, attunement, durability/state, ammunition, or audit trail.
- **Fix:** canonical `ItemInstance` IDs pointing to an `ItemDefinition`; inventory is a container graph. UI displays derived data only.

#### ITEM-02 — 2024 equipment details are incomplete

- **Status:** Partial.
- **Missing / verify:** weapon properties and mastery (ensure obsolete Flex is absent from 2024 definitions); armor training and spellcasting interaction; shields/hands; ammunition/loading; tool actions; mounts/vehicles; services; crafting; magic item rarity/identification/activation/attunement/curses/sentience.
- **Rules reference:** [Equipment](https://www.dndbeyond.com/sources/dnd/br-2024/equipment) and the magic-item chapters in the [Basic Rules](https://www.dndbeyond.com/sources/dnd/br-2024).

#### SHOP-01 — Shops are catalogs, not merchants

- **Status:** Partial; P1 for a living world.
- **Evidence:** the shop UI reads global weapon/armor/magic/consumable data. There is a `ShopInventory`/economy model in `src/lib/world.ts`, but it is not the authoritative campaign store.
- **Missing:** merchant identity/location/faction, stock quantity and replenishment date, buy/sell spread, demand, services, appraisal, credit/debt, stolen-goods response, availability gates, and transaction ledger.
- **Fix:** `MerchantState` owns stock item instances and pricing policy; all trade emits a `TradeEvent` that changes player and merchant atomically.

#### MONSTER-01 — Monster data must drive the encounter runtime

- **Status:** Partial / model split.
- **Present:** monster/NPC definitions and enemy AI helpers exist.
- **Missing / verify:** recharge, limited uses, legendary actions/resistances, lair actions, multiattack sequencing from data, senses/languages, size/reach, morale/surrender, encounter XP/difficulty, loot, summon ownership, and creature-specific conditions.

### World, exploration, NPCs, quests, and maps

#### WORLD-01 — Rich world types are not yet live campaign authority

- **Status:** Model only / Partial; P0 architecture.
- **Evidence:** `src/lib/world.ts` defines `WorldMap`, `Location`, exits, quests, factions, and shop/economy structures. The active DnDSolo flow instead keeps simplified map/quest/NPC records.
- **Risk:** additions in one model do not appear in play; saves cannot reliably represent a canonical campaign.
- **Fix:** define one persisted `CampaignWorldState`, migrate legacy saves once, and have DM tool updates call world reducers only.

#### WORLD-02 — Build a layered spatial graph; do not begin with universal hexes

- **Status:** Missing; P0 for location-aware solo play.
- **Requirement:** the player should know their current known location, available exits, visible nearby NPCs/features, and what is unknown/blocked — even outside combat.
- **Recommended layers:**

```text
CampaignWorld
  └─ region / wilderness travel graph (optional hex overlay)
       └─ settlement / district / building graph
            └─ dungeon / floor / room graph
                 └─ tactical encounter grid (normally 5-foot squares)
```

- **Why:** a hex grid is good for wilderness distance, discovery, weather, and random encounters. It is poor as the only representation for a town shop, building rooms, doors, and tactical 5-foot combat.
- **Minimum `LocationNode`:** ID, type, parent, display name, known/visited state, description, map coordinates optional, occupants, features, encounter zone, and connection IDs.
- **Minimum `Connection`:** endpoints, direction/label, traversal mode/distance/time, open/closed/locked/blocked/secret state, key/skill requirement, one-way property, visibility/sound permeability, and discovery state.

#### WORLD-03 — Doors are not a real game system

- **Status:** Missing; P1.
- **Evidence:** current exit data supports direction and a basic locked flag. It cannot represent an open/closed state, secret door, barricade, key, DC, damage threshold, trap, or who changed it.
- **Fix:** make every door/portal a first-class mutable connection state. Combat movement, exploration, sight, sound, locks, traps, and NPC pathing query the same connection.
- **Acceptance tests:** closed door prevents movement/vision but may allow sound; unlocking with a key updates shared state; secret exit is hidden until discovered; opening a door exposes new occupants.

#### NPC-01 — NPCs need presence and knowledge, not only attitude

- **Status:** Partial; P0 for AI-DM believability.
- **Current data:** simple attitude/reputation records, plus richer NPC definitions elsewhere.
- **Required `NPCState`:** identity/template, alive/available state, current location, schedule/route, faction, disposition toward player, relationships, goals, secrets/knowledge facts, inventory/service role, dialogue memory, and combat stat linkage.
- **Player-facing rule:** show only NPCs discoverable from current location/visibility/time; never expose undiscovered secrets in UI context sent to the AI.
- **AI DM requirement:** tool payload must include NPC IDs and allowed knowledge facts; LLM text cannot mutate NPC truth without a validated event.

#### QUEST-01 — Quest journal is not a quest engine

- **Status:** Partial; P1.
- **Present:** quest add/update normalization and atomic reducer handling were improved; a quest journal can be rendered.
- **Missing:** typed objective triggers tied to game events; prerequisite graph; branch/choice locks; owner/location/faction relation; deadline/clock; reward claim; failure/abandon states; visibility/discovery; idempotency.
- **Fix:** `QuestDefinition` plus `QuestInstance`, and an event processor that consumes `LocationEntered`, `NPCSpokenTo`, `ItemAcquired`, `CreatureDefeated`, `ClockAdvanced`, etc.
- **Acceptance tests:** one event only increments an objective once; alternate branches lock correctly; a deadline changes status at scheduled time; reward cannot be claimed twice.

#### EXPLORE-01 — Exploration lacks a repeatable procedure

- **Status:** Partial.
- **Required loop:** choose destination/activity → validate connection and travel mode → advance clock/resources → resolve discoveries/encounters/hazards → update known map, NPC positions, and quest triggers → render current situation and choices.
- **Missing systems:** travel pace, marching order, navigation/getting lost, visibility/light, food/water, weather, random encounter tables, foraging, wilderness rest safety, traps, hazards, and downtime.
- **Rules reference:** the DM toolbox includes travel pace and environmental subsystems in the [Basic Rules](https://www.dndbeyond.com/sources/dnd/br-2024).

### AI DM integration

#### DM-01 — AI must propose events; rules engine must decide state

- **Status:** Partial.
- **Positive:** `dmSchema` and atomic updates are a real improvement over arbitrary JSON mutations.
- **Required boundary:** AI generates narration and an intent/tool request. Reducers validate IDs, prerequisites, visibility, rules legality, and transition invariants. The engine returns canonical events; the AI narrates their results.
- **Do not allow:** free-form AI HP edits, teleportation, inventory changes, quest completion, or NPC knowledge changes outside typed commands and authority checks.

## Proposed target architecture

```text
UI / AI narration
       │ intents only
       ▼
Command validation ──► Rules engine ──► Domain events ──► Campaign reducers
       │                    │                 │                 │
       │                    └─ combat/spells   │                 └─ canonical save
       │                       effects/rest    │
       ▼                                      ▼
Derived player view ◄──────────────── World/quest/NPC/item time state
```

Non-negotiable invariants:

1. One canonical persisted state per concern (combat, world, items, quests, NPCs, clock).
2. Every mutation has a typed command/event with a stable ID for replay/idempotency.
3. UI and prompt context are derived from state and player visibility; they are never authority.
4. Rule version is explicit in saved campaigns (`'2024'`); legacy compatibility is a migration, not a parallel table.
5. Reducers must be deterministic and testable without React or an LLM.

## Ordered implementation backlog

### Phase 0 — Rule correctness blockers

1. **DEATH-01:** represent stable 0 HP correctly; add all 0-HP tests.
2. **EFFECT-02:** spell metadata concentration; remove hard-coded spell list and `Spiritual Weapon` error.
3. **EFFECT-03:** remove/quarantine old exhaustion table; migrate all callers to 2024 modifiers.
4. Add surprise, rest, 0-HP, concentration, exhaustion test cases before any UI polish.

### Phase 1 — Make engine state authoritative

1. Complete CombatBridgeState migration and delete mirrored mutable combat fields only after parity tests.
2. Create `CampaignClock` and event scheduler.
3. Make spell, condition, equipment, and item-instance schemas canonical.
4. Enforce command validation at all DM tool boundaries.

### Phase 2 — Living world vertical slice

Build one complete playable path: **town square → tavern/shop → NPC conversation → quest accepted → door/dungeon room → encounter → return/reward**. It must use canonical location, connection, NPC, merchant, quest, inventory, and clock state. Do not build many disconnected screens first.

### Phase 3 — Expand geography and content

1. Add settlement/building/room graph UI and fog-of-knowledge.
2. Add optional wilderness hex overlay only for overland travel.
3. Add full merchant stock/economy, NPC schedules, and event-driven quests.
4. Extend monsters, travel/hazards, crafting/downtime, magic items, and advanced spell geometry.

## Test plan for coding agents

Add focused engine tests, then one thin UI integration test per user-visible flow:

| Suite | Minimum cases |
|---|---|
| `death-save` | three successes remain HP 0; 1d4-hour recovery; crit at 0 gives two failures; stabilization methods; massive damage. |
| `concentration` | canonical metadata; no *Spiritual Weapon* concentration; damage check; linked effect cleanup. |
| `exhaustion` | levels 1–6, D20 penalty, speed reduction, death at 6, save migration. |
| `rest` | long-rest HP entry rule, interruptions, sequential Hit Dice, exhaustion/slot recovery. |
| `world-graph` | discovery, connections, locked/secret/open door behavior, location visibility. |
| `npc` | schedule/location, knowledge visibility, relation changes, dead/unavailable NPC. |
| `merchant` | stock depletion/replenishment, buy/sell atomicity, price policy, insufficient funds. |
| `quest-engine` | event objectives, branch locks, deadline, idempotent reward claim. |
| `combat-parity` | command-log replay has identical bridge and rendered combat view after each event. |

Required local verification after each change:

```powershell
npm test
npm run typecheck
npm run lint
```

## Notes for future audits

- A passing test count is not a completeness metric: most missing work is integration and rule coverage, not syntax/type safety.
- Do not mark a domain model “implemented” until a saved campaign loads it, a live player flow changes it, and automated tests exercise its invariants.
- Do not make hexes mandatory. Use them where they serve overland travel; use graphs for locations/doors and 5-foot tactical grids for combat.
- Treat every current legacy/engine duplicate as a migration task with an owner and deletion criterion.
