# DND Solo — Project Status

> **This is the single source of truth for current build state, feature status, and backlog.**
> Last updated: 2026-07-12. Supersedes the older snapshots in `PROGRESS.md` for anything that
> conflicts (see [Doc map](#doc-map) below).

## Current build state

- **`main` @ `c20a374`** — merge of Wave A (task-tracker items #12–#28: turn-loop/initiative/
  surprise/movement/action-economy correctness fixes) and the Phase 0–4 de-monolith refactor
  (`REFACTOR_PLAN.md`).
- **Verified suite (green):** `tsc --noEmit` 0 errors · `vitest` 278/278 passed (28 files) ·
  `playwright e2e` 12/12 passed.
- **Detailed feature-status matrix and evidence:** [`DND_2024_FULL_AUDIT_TH.md`](./DND_2024_FULL_AUDIT_TH.md)
  (Thai, dated 2026-07-12, code state `c20a374`) — treat as authoritative over any other audit
  doc. This tracker condenses it; go there for full evidence per capability.

## Condensed feature-status matrix

Full detail and per-row evidence: [`DND_2024_FULL_AUDIT_TH.md`](./DND_2024_FULL_AUDIT_TH.md) §"Feature-coverage matrix".
Status legend: **Implemented** (live UI + test evidence) · **Partial** (exists, gaps or not
state-authoritative) · **Model only** (type/data exists, not confirmed live) · **Incorrect**
(behavior contradicts 2024 rules) · **Missing**.

| Area | Status | Key gap |
|---|---|---|
| Core resolution / action economy | Partial | No single modifier-source authority across features/conditions |
| Initiative, turn order | Partial | UI still mirrors initiative/current-index instead of reading `CombatBridgeState` alone |
| Surprise (2024 = disadvantage, not lost turn) | **Implemented** (this regression only) | Needs a deterministic disadvantage-roll test |
| Target selection (weapon + single-target spell) | **Implemented** (tested paths only) | AoE/secondary/summon targeting not covered |
| Movement (5-ft grid) | Partial | No path/terrain/diagonal/elevation/squeeze modeling |
| 0 HP / Unconscious / death saves | **Incorrect / Partial** | `applyDeathSaveRoll` snaps HP to 1 on stabilize; 2024 = stay at 0 HP + Unconscious. See [HP-0 workstream](#hp-0--death--dying-state-machine) |
| Concentration | **Incorrect** | Name-based list wrongly includes *Spiritual Weapon*; not metadata-driven |
| Exhaustion | **Incorrect / conflicting** | 2014 and 2024 tables coexist |
| Spellcasting core (slots, cantrips, target) | Partial | Only Magic Missile/Fire Bolt paths are E2E-proven; no central spell-legality validator |
| Character creation / 12 classes | Partial | All classes at "catalog + some features"; per-class resource/subclass coverage incomplete |
| Equipment / inventory / economy | Partial | No canonical `ItemInstance`; buy-decrement is the only tested economy path |
| Monsters / encounters / DM authority | Partial | AI DM output still needs engine to be the sole arbiter of dice/HP/DC/targets |
| World / quests / dungeon / social | Partial / Model split | No persisted `CampaignWorldState`; quest transitions not event-driven |
| Session Zero | **Implemented** | Solo-play strength |
| Oracle | **Implemented** | Solo-play aid, not a rules system |
| Campaign memory | Partial | Needs provenance; see [Story Notes v2 workstream](#story-notes--campaign-memory-v2) |
| Save/load/migration | Partial | Versioned save exists; combat/world/item/effect state still migrate as separate blobs |

## Backlog (from `DND_2024_FULL_AUDIT_TH.md`)

### P0 — rules correctness & state authority

| ID | Task | Status |
|---|---|---|
| P0-1 | Fix stable/0 HP state machine (stay at 0 HP + Unconscious, not snapped to 1) | **In flight** — see [HP-0 workstream](#hp-0--death--dying-state-machine); task-tracker #31 |
| P0-2 | Concentration → metadata (`SpellDef.concentration` + effect ID), remove name lists | Open |
| P0-3 | Pick one Exhaustion ruleset (2024), migrate saves | Open |
| P0-4 | Make `CombatBridgeState` the single owner (UI = projection/intent only) | Open |
| P0-5 | AI DM narrates + proposes intent only; engine resolves all rule-bearing state | Open (schema/adapters exist; not fully enforced) |

### P1 — feature completeness & persistent world

| ID | Task | Status |
|---|---|---|
| P1-1 | Central spell legality/resolution validator | Open |
| P1-2 | Effect/condition authority (lifecycle, one modifier query) | Open |
| P1-3 | Canonical character build/progression validator (12-class coverage) | Open |
| P1-4 | Canonical item instances + merchant state | Open |
| P1-5 | `CampaignWorldState` + spatial graph | Open |
| P1-6 | Campaign clock / event queue | Open |

### P2 — campaign depth & polish

| ID | Task | Status |
|---|---|---|
| P2-1 | Travel/hazards/downtime loop | Open |
| P2-2 | Full monster stat-block behavior (recharge, legendary/lair, morale) | Open |
| P2-3 | Social/quest simulation (goals, NPC schedule/knowledge, event-driven quests) | Open |
| P2-4 | Coverage/quality dashboard (machine-readable support matrix) | Open |

> Task statuses above are derived from `DND_2024_FULL_AUDIT_TH.md`, `PROGRESS.md`, and the
> `.claude/plans/*.md` specs — no live task-tracking tool was available in this environment to
> pull statuses from directly. Re-verify against whatever the team's current task tracker says
> before treating "Open" as unstarted.

## In-flight workstreams

### HP-0 / Death & Dying State Machine

Fixes P0-1 (audit) / task-tracker #31 (stabilize), #32 (damage-at-0), #33 (unconscious gate).
Full spec: [`.claude/plans/dnd-hp0-state-machine.md`](.claude/plans/dnd-hp0-state-machine.md)
*(local file, gitignored — present on the main checkout, not tracked in git)*.

- **Problem:** `applyDeathSaveRoll` (`src/lib/engine/combat.ts:683-691`) sets HP to 1 on the 3rd
  death-save success; 2024 RAW keeps the character at 0 HP + Unconscious until healed. Three more
  defects: tempHp bypassed at 3 of 4 damage seams, stale `deathSaves` on heal, no Unconscious
  condition added on downing.
- **Approach (advisor-approved, bounded):** centralize damage/heal/death logic into pure
  functions operating on the existing live `cc` shape (do NOT adopt `engine/character.ts`'s typed
  model as live state — reference only).
- **Plan:** Wave 1 (pure engine functions + unit tests, `src/lib/engine/combat.ts` /
  `hpState.ts`) → Wave 2 (route every hp-change seam through them; serialized with Story Notes
  on `DnDSolo.tsx`).
- **Status:** spec resolved and scoped; Wave 1 not yet landed.

### Story Notes / Campaign Memory v2

Addresses audit §9 "Campaign memory = Partial — needs provenance."
Full spec: [`.claude/plans/dnd-story-notes-v2.md`](.claude/plans/dnd-story-notes-v2.md)
*(local file, gitignored)*.

- **Problem:** `CampaignMemory.facts` is a flat, unordered `CampaignFact[]`; no status/priority/
  source/visibility, no relevance sort, and no layer separation between authoritative game state,
  structured campaign facts, and narrative Story Notes.
- **Approach:** new `StoryNote` type (`status`, `priority`, `source`, `visibility`,
  `linkedEntityIds`) with a relevance-sorted selector; a single `buildNarrativeContext()` that
  composes memory + session-zero + notes into a prompt block explicitly delimited as
  data-not-instructions (prompt-injection safety, audit P0-5).
- **Plan:** Wave 1 (lib + context builder, new `src/lib/engine/storyNotes.ts`, save-version bump
  5→6 with additive migration).
- **Integration order (resolved 2026-07-12):** HP-0 Wave 2 lands first on `DnDSolo.tsx`
  (game-breaking correctness); Story Notes Wave 2 rebases on top.
- **Status:** spec resolved and scoped; Wave 1 not yet landed.

## Recently completed

- **Wave A correctness (#12–#28), merged to `main` @ `c20a374`:** death-saves outside combat, DM
  number-string coercion, single-source concentration tracking, tool-calling DM migration,
  initiative-driven turn loop off `CombatBridgeState`, enemy AI extracted to pure
  `engine/enemyAI.ts`, movement unit-mismatch fix (feet-consistent), surprise no-longer-skips-turn
  fix.
- **De-monolith Phases 0–4** (`REFACTOR_PLAN.md`): `DnDSolo.tsx` 5,462 → 2,826 lines (**−48.3%**).
  Phase 0 (Playwright safety net) done. Phase 1 (pure combat resolvers → `combatResolve.ts`) done.
  Phase 2 (render panels) partial — `CombatOverlay` extracted; MenuScreen/PlayHeader/MoreMenu
  deliberately left in place (low value / high prop coupling). Phase 3 (weapon-attack resolver →
  `lib/bridgeAttack.ts` + `lib/weaponAttack.ts`) done; the ~660-line `playerCombatAction`
  dispatcher itself deferred (high risk, low marginal gain). Phase 4 (spell resolver →
  `lib/castSpell.ts`) done. Phase 5 (useState grouping) not started — optional.
  See [`REFACTOR_PLAN.md`](./REFACTOR_PLAN.md) for the full phase breakdown and verification strategy.

## Next steps

1. Land HP-0 Wave 1 (pure engine functions + tests) — unblocks P0-1 / #31-#33.
2. Land HP-0 Wave 2 (route all hp-change seams through it) before Story Notes Wave 2 touches
   `DnDSolo.tsx` (integration order resolved above).
3. Land Story Notes v2 Wave 1 (lib + context builder, save-version bump).
4. Pick up remaining P0s not yet spec'd into a workstream: P0-2 (concentration metadata), P0-3
   (single exhaustion ruleset), P0-4 (`CombatBridgeState` sole owner), P0-5 (enforce AI
   narrate-only / engine-resolves boundary).
5. Re-run `DND_2024_FULL_AUDIT_TH.md`'s test gaps list (surprise-disadvantage determinism,
   stable-at-0-HP suite, concentration-from-metadata, per-condition modifier/expiry tests) as each
   P0 item lands, and update that audit's matrix + this tracker together (per its own
   "next update" rule — don't upgrade a status without live-flow evidence, not just a passing unit test).

## Doc map

| Doc | Role | Status |
|---|---|---|
| `PROJECT_STATUS.md` (this file) | Single source of truth: build state, condensed matrix, backlog, in-flight work | Living |
| [`DND_2024_FULL_AUDIT_TH.md`](./DND_2024_FULL_AUDIT_TH.md) | Authoritative feature-status matrix + full evidence (Thai) | Living — update alongside this file when a feature's status changes |
| [`REFACTOR_PLAN.md`](./REFACTOR_PLAN.md) | `DnDSolo.tsx` de-monolith detail (phases, verification strategy, file-by-file breakdown) | Living — Phases 0–4 done, 2 optional/deferred items remain |
| [`PROGRESS.md`](./PROGRESS.md) | Older build log (last full update 2026-07-11, task numbering stops at #21) | **Stale** — superseded by this file for current state; kept for historical build narrative. Candidate for archive; left for user decision (see below) |
| [`docs/archive/DND_2024_AUDIT.md`](./docs/archive/DND_2024_AUDIT.md) | 2026-07-11 audit (219 tests) | Archived — history only, superseded by `DND_2024_FULL_AUDIT_TH.md` |
| [`docs/archive/DND_2024_SYSTEMS_AUDIT.md`](./docs/archive/DND_2024_SYSTEMS_AUDIT.md) | 2026-07-11 systems audit (219 tests) | Archived — history only, superseded by `DND_2024_FULL_AUDIT_TH.md` |
| `.claude/plans/dnd-hp0-state-machine.md` | HP-0 workstream spec | Local, gitignored — linked above, not absorbed |
| `.claude/plans/dnd-story-notes-v2.md` | Story Notes v2 workstream spec | Local, gitignored — linked above, not absorbed |
| `.claude/plans/*.md` (others: `build-to-completion.md`, `combat-turn-loop.md`, `dnd-2024-remediation.md`, `connect-github-boatkabig-dnd.md`) | Earlier planning docs, largely executed (build-to-completion = original roadmap now landed as Phases 0–6 in `PROGRESS.md`; combat-turn-loop = task #17, done; dnd-2024-remediation = pre-TH-audit reconciliation, superseded by `DND_2024_FULL_AUDIT_TH.md`'s own backlog; connect-github-boatkabig-dnd = one-time repo-hosting setup, unrelated to feature status) | Local, gitignored — historical, not linked individually above |
| `archive/` (repo root) | Archived **dead source code** (Phase 5 cleanup) — unrelated to this docs consolidation | Unchanged |
