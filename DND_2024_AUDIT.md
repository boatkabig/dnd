# D&D 2024 System Audit

> Audit date: 2026-07-11  
> Scope: Current `main` working tree of this repository.  
> Rules baseline: D&D 2024 Basic Rules / SRD 5.2. This report evaluates rules
> that are available in that public baseline; it does not claim coverage of
> options that only appear in paid books or third-party material.

## Executive summary

The project is a capable **D&D-2024-inspired solo RPG**, with several strong
systems: structured DM responses, atomic DM-update application, encounter
difficulty, a testable combat bridge, rest math, solo oracle, sidekick,
campaign memory, and Session Zero.

It is **not yet rules-accurate end-to-end**. The primary reason is a hybrid
architecture: a new engine implements several rules correctly while the live
React flow in `src/components/DnDSolo.tsx` still owns parts of combat, movement,
spells, and state. Passing engine tests therefore does not necessarily prove
that the player-facing game follows the same rule.

### Priority findings

1. **P0 — Initiative is displayed but does not drive the live turn loop.**
2. **P0 — Surprise still skips enemy retaliation in live UI flow.**
3. **P0 — Grid movement mixes feet and squares; a 30-ft creature can move 30 squares.**
4. **P0 — Damage outside combat can be erased by restoring the player to 1 HP.**
5. **P1 — The repository contains both 2024 and 2014 Exhaustion behavior.**
6. **P1 — Concentration is tracked from a hard-coded display-name list that
   incorrectly includes _Spiritual Weapon_.**
7. **P1 — The spell pipeline validates a slot, but does not fully model targets,
   components, casting time, one-slot-per-turn, or arbitrary SRD effects.**

## Evidence and verification

### Automated checks run

The following targeted suites passed during this audit:

| Suite | Result | What it proves |
|---|---:|---|
| `scripts/test_combat_bridge.ts` | 19 passed | Bridge parsing, engine attack seam, movement budget and engine turn primitives |
| `scripts/test_engine_wiring.ts` | 11 passed | Dice detail, engine action economy and effect start/end triggers |
| `scripts/test_dnd_2024_compliance.ts` | 48 passed | Selected 2024 corrections: rests, exhaustion helper, concentration DC, grapple/shove, encounter thresholds, origins/masteries |
| `npm run build` | Passed | Current Next production build compiles and generates pages |

The checks do **not** currently execute the entire live combat loop in
`DnDSolo.tsx`, which is why the P0 issues below remain possible.

### Tooling health

- `npm run lint` currently fails with three errors: one archived test calls a
  React Hook at top level, and the compliance script uses `require()` imports.
- `npx tsc --noEmit` currently reports a stale `.next` type reference to the
  removed `/api/srd` route, even though `next build` succeeds.
- `.serena/` is untracked at audit time. It was not modified by this audit.

## Authoritative rules used

- [D&D 2024 Playing the Game](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game/)
  — D20 Tests, actions, exploration, combat, initiative, movement, cover and damage.
- [D&D 2024 Rules Glossary](https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary/)
  — conditions, Concentration, rests, exhaustion, death saving throws and glossary actions.
- [D&D 2024 Spells](https://www.dndbeyond.com/sources/dnd/br-2024/spells/)
  — spell slots, casting time, components, targeting, range, duration and preparation.
- [D&D 2024 Creating a Character](https://www.dndbeyond.com/sources/dnd/br-2024/creating-a-character/)
  and [Character Origins](https://www.dndbeyond.com/sources/dnd/br-2024/character-origins/)
  — origins, ability-score increases, languages, starting equipment and advancement.

## System-by-system comparison

Legend:

- **Implemented**: usable in the live game and substantially follows the rule.
- **Partial**: an engine or UI exists, but important rule paths are absent or bypass it.
- **Incorrect**: current live behavior conflicts with the 2024 baseline.
- **Missing**: no consistent player-facing system was found.

| System | Status | Current implementation | Gap / concern |
|---|---|---|---|
| Core D20 Tests | Partial | Dice, ability modifiers, PB and advantage/disadvantage exist | Not every action queries the same modifier/condition source |
| Character creation | Partial | Species, background, ASI, skills, feat and equipment UI exist | Origin choices and starting packages are not normalized as one authoritative rules model |
| Character advancement | Partial | XP, ASI/feat, some subclasses and spell preparation are present | Class features/resources remain partly bespoke and incomplete |
| Standard actions | Partial | Several combat actions have UI code | No single authoritative implementation for all 12 2024 actions |
| Initiative / turn order | Incorrect | Initiative is rolled and displayed; bridge can model a turn loop | Live UI batches turns rather than consuming the bridge's active combatant |
| Surprise | Incorrect | Enemy initiative can roll with disadvantage | Live UI still skips retaliation after a surprised opening |
| Movement / position | Incorrect | Grid, token positions and a bridge movement primitive exist | Legacy UI compares squares with feet and ignores several movement rules |
| Attacks / damage | Partial | Player weapon attacks pass through a bridge seam; resistances and crits exist | Action budget and target/position state are not fully bridge-owned |
| Damage at 0 HP | Partial | Death-save engine primitive exists | Non-combat 0 HP is converted back to 1 HP; massive damage is not consistently applied |
| Conditions | Partial | All fifteen 2024 condition IDs exist | Effects, duration, immunity and interactions are not centralized |
| Exhaustion | Incorrect | `gameData` has the 2024 penalty model | `engine/rest.ts` retains 2014 exhaustion table behavior |
| Rest / recovery | Partial | 2024 long-rest frequency, HD recovery and interruption helpers exist | Live Short Rest does not provide full sequential Hit Die choice or all rest guards |
| Spellcasting | Partial | SRD lookup, slot gate, some spells, saves and effects exist | General spell resolution is still a shortcut layer, not spell-data execution |
| Concentration | Incorrect | DC calculation and some replacement behavior exist | Hard-coded spell name list includes a non-concentration spell and omits generic metadata |
| Equipment | Partial | Weapons, armor, items, shop and some magic items exist | Hands, focus/pouch, material cost, ammunition, loading, attunement and carrying are not unified |
| Social interaction | Partial | NPC attitude, reputation and an Influence helper exist | No durable social encounter state with goals, leverage and consequences |
| Exploration / travel | Partial | Map, dungeon, weather, oracle and travel-event helper exist | Pace, marching order, navigation, foraging and hazards are not an integrated procedure |
| Monsters / encounters | Partial | Open5e fetch, encounter thresholds and a Multiattack parser exist | Monster actions still do not execute through the same live turn state |
| Solo-play support | Implemented | Session Zero, oracle, sidekick and campaign memory | These are project strengths; keep them separate from rules adjudication |
| Persistence / data integrity | Partial | Save versioning and atomic DM updates exist | Character/combat/world state is still split across legacy blobs, refs and bridge state |

## Detailed findings

### 1. Core resolution and action economy

#### Correct / useful

- The engine has explicit action trackers and can prevent spending an action,
  bonus action, reaction or movement twice.
- Attack engine tests prove natural 1/20, advantage/disadvantage, cover and
  auditable modifiers at the engine layer.
- Grapple and Shove are modeled as the 2024 saving-throw approach rather than
  the 2014 contested-check approach.

#### Missing or partial

The 2024 action list is: Attack, Dash, Disengage, Dodge, Help, Hide, Influence,
Magic, Ready, Search, Study and Utilize. The project has implementations or
buttons for a subset, but they are not expressed as one action dispatcher with
one shared action budget. This leads to special-case behavior and makes it hard
to guarantee that a new class feature respects the same economy.

**Required direction:** route every player and monster action through the
engine action tracker. The UI should request an action; it must not directly
mutate combat state.

### 2. Initiative, surprise and the combat loop — P0

The 2024 rules require every participant to act in Initiative order every
round. Surprise gives the surprised combatant Disadvantage on its Initiative
roll; it does not remove that combatant's first turn.

#### Current code evidence

- `initCombat` creates `cb.initOrder` from the bridge, but assigns
  `cb.currentInitIdx` once only:
  `src/components/DnDSolo.tsx` around line 1902.
- The player-facing flow still calls `enemyAttacks` as a batch after a player
  action, rather than using `getCombatView(...).currentCombatantId` and
  `endTurn`/`nextTurn`.
- The live spell/normal-action flow contains the branch:
  `Enemy surprised — loses first-turn retaliation` around lines 3213 and 3633.

#### Impact

Initiative becomes presentation only. Reactions refresh at the wrong moments,
effects do not consistently tick at their owner's turn boundary, and surprise
gives a stronger benefit than the 2024 rule permits.

#### Required fix

Make `CombatBridgeState` persistent and authoritative for:

1. active combatant;
2. action, bonus action, reaction and movement budgets;
3. start/end-of-turn effects;
4. round transitions;
5. player and monster HP; and
6. initiative order.

Delete `playerFirst`, `currentInitIdx`, batch `enemyAttacks`, and legacy turn
flags only after their bridge equivalents drive the UI.

### 3. Movement, grid, reach and terrain — P0

The grid rules use 5-foot squares. A creature with Speed 30 ft has six squares
of movement. Difficult Terrain costs extra movement; special movement modes,
size, occupied spaces and line corners matter.

#### Current code evidence

- `movementLeft` is initialized with `cc.speed || 30`, measured in feet.
- `moveCost` is the number of grid squares from `gridDistance`.
- The UI compares those values directly.

This permits 30 squares of movement for a 30-ft Speed.

#### Missing

- large/huge/gargantuan occupied spaces in the live grid;
- difficult terrain;
- climb, swim, fly and burrow movement costs;
- diagonal corner blocking;
- path validation rather than destination-only validation; and
- reach-aware opportunity attacks.

The bridge contains better primitives, but the UI has not adopted them.

### 4. Damage, unconsciousness, death and stabilization — P0

The 2024 sequence is:

1. apply damage and Temporary HP;
2. check instant death/massive damage;
3. at 0 HP, apply Unconscious and start Death Saves at the start of turns;
4. three successes produces Stable at 0 HP; and
5. a stable creature that is not healed regains 1 HP after 1d4 hours.

#### Current code evidence

`submitAction` contains a legacy recovery path around line 3994 that turns a
non-combat `hp <= 0` state into `hp: 1`.

#### Missing

- massive damage / instant death;
- damage while at 0 HP adding Death Save failures;
- critical damage at 0 HP adding two failures;
- Stable state at 0 HP until healing or time passes;
- Medicine/Healer's Kit stabilization; and
- the same HP-0 state machine for combat, traps, falls and DM updates.

### 5. Conditions and Exhaustion — P1

All fifteen official 2024 condition IDs are listed, which is a good foundation.
The missing piece is a single effect model that owns source, target, duration,
immunity, save-to-end logic and every mechanical consequence.

#### Exhaustion contradiction

`src/lib/gameData.ts` follows the 2024 model:

- D20 Test total reduced by `2 × level`;
- Speed reduced by `5 ft × level`;
- death at level 6.

`src/lib/engine/rest.ts` still defines the older 2014 style table with broad
disadvantage, halved speed and halved maximum HP. Which behavior applies
therefore depends on which module a caller uses. This is a rules-version bug,
not merely an implementation detail.

**Required fix:** delete or quarantine the 2014 table, then create one
`applyExhaustion2024()` implementation used by combat, travel, rest and UI.

### 6. Rests, recovery and time — P1

#### Correct / useful

- Long Rest timing uses the 2024 16-hour wait.
- Long Rest recovery returns all Hit Dice, restores HP/slots and reduces
  Exhaustion.
- Rest interruption helpers recognize initiative, non-cantrip spells and damage.

#### Missing or incorrect in the live flow

- Both Short and Long Rest require at least 1 HP to start; this must be checked
  in the UI flow, not only documented in an engine helper.
- A Short Rest lets the player spend one or more Hit Dice **one at a time**,
  choosing after each roll whether to spend another. The current streamlined UI
  does not provide this full choice.
- Long Rest interruption/resume must be tied to actual combat, damage, spells
  and exertion events rather than only a standalone helper.
- Class-specific recovery needs a declarative resource table; hand-written
  `if` branches will drift between classes and editions.

### 7. Spellcasting and magic — P1

#### Correct / useful

- Spell slots are checked before the live cast path consumes a slot.
- The project can fetch SRD spell records.
- It has spell attack/save concepts, upcasting support in places, spell DC and
  attack modifiers, and a concentration DC helper.

#### Incorrect or missing

1. **Concentration is name-based.**
   `CONCENTRATION_SPELL_NAMES` includes `Spiritual Weapon`, although that spell
   does not require Concentration. It should use the spell record's
   `concentration` field/effect metadata, not a display-name allowlist.
2. **One slot spell per turn is not an authoritative turn rule.**
3. **Casting-time rules are incomplete.** Reaction triggers and multi-turn
   casts/rituals are not represented as persistent casting state.
4. **Components are not live inventory constraints.** V/S/M, free hand,
   focus/component pouch, priced components and consumed material are not
   uniformly validated.
5. **Targeting is simplified.** The code often takes the first living enemy;
   it does not consistently offer legal target/origin/area selection.
6. **Range, clear path and cover are partial.** Some attack paths calculate
   cover, but every spell/feature must use the same visibility and path query.
7. **Prepared versus known spells is simplified.** Class-specific preparation
   schedules and always-prepared spells are not modeled as an authoritative
   spell list.
8. **Generic SRD claim is too broad.** Fetching a spell description is not the
   same as executing its unique targeting, duration, summon, transformation,
   object, terrain or narrative effects.

### 8. Character origin, advancement and class features — P1

#### Rules baseline

In 2024, Background provides three eligible abilities for +2/+1 or +1/+1/+1,
an Origin Feat, two skills, a tool proficiency, and a choice of equipment
package or 50 GP. Species grants traits, size and speed; it does not grant the
normal ability-score bonus.

#### Current state

The project is directionally correct on background ASI, origin feats and
species-without-ASI. It also includes some subclasses, feats, spellbook and
sidekick work.

#### Missing

- one normalized Character model rather than an `any` blob;
- complete starting package choice and currency accounting;
- class-specific spell preparation/known spell replacement schedule;
- subclass and feature coverage for all supported class levels;
- resource use/recovery declared by feature data, not component conditionals;
- multiclassing rules, prerequisites and slot progression; and
- level 19 Epic Boon / feat qualification handling where applicable.

### 9. Equipment, inventory and economy — P2

The shop and inventory UI are valuable, but equipment needs an engine-owned
state model before it can be rules authoritative.

Missing or partial areas:

- wielded/worn/stowed location and free hands;
- shields and two-handed/versatile/loading/ammunition behavior;
- ammunition quantity and recovery;
- armor training and spellcasting in armor;
- attunement limit and attunement lifecycle;
- item charges and recharge schedules;
- carrying capacity/encumbrance for extraordinary loads;
- spell focus, component pouch and costly/consumed components; and
- a catalog identity instead of display-name strings for every inventory item.

### 10. Social interaction, exploration and downtime — P2

#### Existing strengths

- NPC attitude and faction reputation state exist.
- The project has an Influence helper, world map, dungeon blueprint, weather,
  oracle, exploration events and campaign memory.

#### Missing

- social encounter goals, attitude progression, leverage/evidence and durable
  consequences;
- travel pace effects, marching order and group stealth;
- navigation, foraging, getting lost, food/water and environmental hazards;
- perception/visibility interaction during exploration;
- persistent NPC location, schedule, knowledge and inventory; and
- downtime activities wired to time, money, proficiency and inventory.

### 11. Monsters, encounters and DM authority — P2

The project can fetch creature records and parses common Multiattack text. That
is a solid start. The live monster turn is not yet an execution of the same
authoritative turn/action/effect state used by the player.

Missing or partial:

- action/bonus action/reaction choices from full monster stat blocks;
- legendary actions, legendary resistance, lair actions and recharge;
- size/reach/space in the live battle grid;
- creature senses and stealth/hidden state;
- stat-block-defined saves, conditions and special traits; and
- surrender, morale, negotiation and non-lethal defeat as encounter outcomes.

For an AI DM, the model should propose fiction and structured intents, while
the engine validates and resolves every rule-bearing state change. The model
must not be an alternate source of HP, dice, DC, targets or action economy.

## Architecture findings

### Current split ownership

| Concern | Legacy owner | New owner | Risk |
|---|---|---|---|
| Initiative | `DnDSolo` flags/order display | `CombatBridgeState` | UI does not advance the bridge turn |
| Movement | `DnDSolo` `movementLeft` | bridge `moveBy` | Different units and validation |
| Attacks | inline feature layering | bridge attack seam | Bridge is often throwaway and skips action spend |
| Enemy HP | enemy blobs | bridge projection | Improved, but not complete combat ownership |
| Player HP / death | character blob | combat engine primitives | Non-combat path bypasses state machine |
| Concentration | buff display names | effects model | Two sources and incorrect name table |
| Exhaustion | `gameData` | `engine/rest` | Two editions at runtime |

### Required target architecture

```text
Player input / AI DM intent
          │
          ▼
Intent validator ──► rule request
          │
          ▼
Game state reducer / CombatBridgeState  ◄── spell, effects, equipment, movement
          │
          ▼
Event log + immutable state transition
          │
          ▼
React UI projection + Thai narration prompt
```

Rules never live in the narration layer. The UI never changes HP, movement,
slots, effects or initiative directly.

## Remediation roadmap

### Phase 0 — lock the baseline

1. Declare the runtime ruleset as `dnd-2024-srd-5.2`.
2. Remove 2014 behavior from live paths or expose it as an explicit legacy
   ruleset that cannot mix with a 2024 campaign.
3. Add a source/edition field to rules data, effects and saves.

### Phase 1 — correct P0 combat behavior

1. Persist `CombatBridgeState` for the whole encounter.
2. Make `currentCombatantId` determine which controls are enabled.
3. Replace batch enemy attacks with one engine turn at a time.
4. Remove surprise turn skipping; apply initiative disadvantage only.
5. Store movement in feet everywhere, converting to squares only for display.
6. Route every damage source through one HP-0 state machine.

### Phase 2 — make effects and spells authoritative

1. Replace name-based concentration with `ActiveEffect.isConcentration`.
2. Implement generic spell validation from SRD metadata.
3. Add a target/origin selection contract before resolution.
4. Model cast-in-progress for rituals and long casting times.
5. Test one-slot-per-turn, reactions and multiple concentration cases.

### Phase 3 — consolidate character and equipment state

1. Introduce strict `CharacterState`, `InventoryItem`, `ResourceState` and
   `SpellcastingState` schemas.
2. Migrate `any` blobs incrementally through adapters.
3. Make feature use/recovery declarative by class/level.

### Phase 4 — deepen D&D pillars and solo support

1. Complete social, travel and downtime procedures.
2. Integrate monster features and encounter outcomes.
3. Keep Session Zero, oracle, sidekick and memory as separate solo modules.

## Regression tests required before claiming compliance

1. Initiative order with player between two monsters; assert actual control order.
2. Surprise: enemy initiative disadvantaged, but enemy still receives turn.
3. Speed 30 ft on a grid: maximum six normal squares.
4. Difficult Terrain, reach-10 weapon and opportunity attack boundary.
5. Trap damage to 0 HP outside combat: unconscious/death-save state.
6. Massive damage death and damage/critical hit at 0 HP.
7. Stable creature remains at 0 HP until healed or 1d4 hours elapse.
8. Concentration: _Bless_, _Spiritual Weapon_, arbitrary SRD concentration spell,
   new concentration replacement, incapacitation and damage checks.
9. Two leveled spells in one turn must fail; cantrip plus slot spell must work.
10. V/S/M components, expensive consumed material and armor training.
11. Short Rest sequential Hit Die spending and interruption.
12. Same scenario exercised through the browser UI, not only engine functions.

## Acceptance definition

The project should call itself **D&D 2024 rules-accurate core** only when:

- a single persistent state owns combat, character resources and effects;
- all P0 scenarios above are covered by UI-level regression tests;
- no 2014 rule applies in a 2024 campaign path;
- each spell effect is either mechanically resolved from validated data or
  clearly labeled as DM-adjudicated narrative; and
- the ruleset/version shown in the UI matches the actual engine behavior.

