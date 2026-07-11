/**
 * Phase 1 smoke test — DM schema validation
 * Run: npx tsx scripts/test_dm_schema.ts
 */
import {
  validateDMResponse,
  DMResponseSchema,
  HP_DELTA_CAP,
  GOLD_DELTA_CAP,
  XP_AWARD_CAP,
  VALID_CONDITION_IDS,
} from "../src/lib/dmSchema";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}`); fail++; }
}

console.log("\n=== Phase 1: DM Schema Validation ===\n");

// Test 1: Valid response passes
console.log("Test 1: Valid DM response passes");
const valid = {
  narration: "พ่อค้ายิ้มแล้วตอบคำถาม",
  scene: "stonehill_inn",
  updates: { hp_delta: -5, gold_delta: -50, xp_award: 100 },
};
const r1 = validateDMResponse(valid);
assert(r1.success === true, "valid response succeeds");
assert(r1.data?.narration === "พ่อค้ายิ้มแล้วตอบคำถาม", "narration preserved");
assert(r1.data?.updates?.hp_delta === -5, "hp_delta preserved");

// Test 2: Delta caps reject absurd values
console.log("\nTest 2: Delta caps reject absurd values");
const absurd = {
  narration: "test",
  updates: { hp_delta: -99999, gold_delta: 999999, xp_award: 999999 },
};
const r2 = validateDMResponse(absurd);
assert(!r2.success, "absurd response fails strict validation");
// Lenient fallback should still have narration
assert(r2.data?.narration === "test", "narration salvaged from absurd response");
// Updates should be dropped (failed validation)
assert(r2.data?.updates === null || r2.data?.updates === undefined, "absurd updates dropped");

// Test 3: Unknown condition IDs dropped individually, valid ones kept
// (was: whole field rejected on any bad item — now per-item salvage, see PROGRESS)
console.log("\nTest 3: Unknown conditions dropped individually, valid ones kept");
const invalidCond = {
  narration: "test",
  updates: { conditions_add: ["blinded", "fake_condition", "stunned"] },
};
const r3 = validateDMResponse(invalidCond);
assert(r3.success === true, "mixed valid/invalid conditions still succeeds");
assert(JSON.stringify(r3.data?.updates?.conditions_add) === JSON.stringify(["blinded", "stunned"]), "unknown condition dropped, valid ones kept");
assert(r3.warnings.some((w) => w.includes("fake_condition")), "warning names the dropped condition");

// Test 4: Cannot have both requires AND start_combat
console.log("\nTest 4: requires + start_combat conflict resolved");
const conflict = {
  narration: "test",
  requires: { type: "check", skill: "athletics", dc: 13 },
  start_combat: { monsters: ["goblin"] },
};
const r4 = validateDMResponse(conflict);
assert(r4.success === true, "conflict response still succeeds (with warning)");
assert(r4.warnings.length > 0, "warning generated for conflict");
assert(r4.data?.requires === null, "requires dropped (combat takes priority)");
assert(r4.data?.start_combat !== null, "start_combat preserved");

// Test 5: Cannot have world_map AND map_update
console.log("\nTest 5: world_map + map_update conflict resolved");
const mapConflict = {
  narration: "test",
  world_map: [{ id: "town", name: "Town", type: "town" }],
  map_update: { move_to: "forest" },
};
const r5 = validateDMResponse(mapConflict);
assert(r5.success === true, "map conflict succeeds with warning");
assert(r5.data?.map_update === null, "map_update dropped (world_map takes priority)");
assert(r5.data?.world_map !== null, "world_map preserved");

// Test 6: Empty/missing narration fails gracefully
console.log("\nTest 6: Missing narration handled gracefully");
const noNarr = { scene: "town" };
const r6 = validateDMResponse(noNarr);
assert(!r6.success, "missing narration fails strict");
assert(r6.data?.narration?.includes("DM ตอบกลับไม่ถูกต้อง") === true, "fallback narration provided");

// Test 7: Skill check DC capped at 1-40
console.log("\nTest 7: Skill check DC capped");
const highDC = {
  narration: "test",
  requires: { type: "check", skill: "athletics", dc: 999 },
};
const r7 = validateDMResponse(highDC);
assert(!r7.success, "DC 999 rejected");

// Test 8: Start combat monsters array validated
console.log("\nTest 8: start_combat monsters validated");
const badCombat = {
  narration: "test",
  start_combat: { monsters: [] },  // empty array
};
const r8 = validateDMResponse(badCombat);
assert(!r8.success, "empty monsters array rejected");

// Test 9: world_map id must be snake_case
console.log("\nTest 9: world_map id must be snake_case");
const badId = {
  narration: "test",
  world_map: [{ id: "Bad ID With Spaces", name: "Town", type: "town" }],
};
const r9 = validateDMResponse(badId);
assert(!r9.success, "non-snake_case id rejected");

// Test 10: Buff validation
console.log("\nTest 10: Buff validation");
const badBuff = {
  narration: "test",
  updates: {
    buffs_add: [{ name: "Test", type: "invalid_type", duration: 5 }],
  },
};
const r10 = validateDMResponse(badBuff);
assert(!r10.success, "invalid buff type rejected");

// Test 11: Delta cap values
console.log("\nTest 11: Delta cap constants are sensible");
assert(HP_DELTA_CAP === 200, `HP_DELTA_CAP = 200 (got ${HP_DELTA_CAP})`);
assert(GOLD_DELTA_CAP === 10000, `GOLD_DELTA_CAP = 10000 (got ${GOLD_DELTA_CAP})`);
assert(XP_AWARD_CAP === 5000, `XP_AWARD_CAP = 5000 (got ${XP_AWARD_CAP})`);

// Test 12: All 15 conditions in VALID_CONDITION_IDS
console.log("\nTest 12: All 15 conditions valid");
assert(VALID_CONDITION_IDS.length === 15, `15 conditions (got ${VALID_CONDITION_IDS.length})`);
assert(VALID_CONDITION_IDS.includes("blinded"), "blinded included");
assert(VALID_CONDITION_IDS.includes("exhaustion"), "exhaustion included");
assert(VALID_CONDITION_IDS.includes("unconscious"), "unconscious included");

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);

// === A1: Stray key tolerance test ===
console.log("\n=== A1: Stray key tolerance ===\n");

const strayKeyResponse = {
  narration: "test with stray",
  scene: "town",
  requires: { type: "check", skill: "athletics", dc: 13 },
  updates: { hp_delta: -5, gold_delta: 50 },
  stray_unknown_field: "this should not break parsing",
  another_stray: 123,
};
const strayResult = validateDMResponse(strayKeyResponse);
assert(strayResult.data?.requires !== null, "A1: requires preserved with stray key");
assert(strayResult.data?.updates?.hp_delta === -5, "A1: updates.hp_delta preserved with stray key");
assert(strayResult.data?.updates?.gold_delta === 50, "A1: updates.gold_delta preserved with stray key");

// Stray key in updates too
const strayInUpdates = {
  narration: "test",
  updates: { hp_delta: 10, custom_field: "ignore me", foo: 42 },
};
const strayUpdatesResult = validateDMResponse(strayInUpdates);
assert(strayUpdatesResult.data?.updates?.hp_delta === 10, "A1: updates.hp_delta preserved with stray key inside updates");

// start_combat with stray key
const strayCombat = {
  narration: "test",
  start_combat: { monsters: ["goblin"] },
  stray_field: "ignore",
};
const strayCombatResult = validateDMResponse(strayCombat);
assert(strayCombatResult.data?.start_combat !== null, "A1: start_combat preserved with stray key");

console.log(`\n=== A1 Results: pass ===\n`);

// === Correctness hardening: quest schema strictness + partial updates salvage ===
console.log("\n=== Correctness Hardening: quest_add/quest_update strictness + partial updates salvage ===\n");

// H1: malformed quest_update (missing required 'id') must not drop sibling xp_award/loot_drop
console.log("\nH1: malformed quest_update does not drop xp_award/loot_drop");
const questCombo = {
  narration: "test",
  updates: {
    xp_award: 200,
    loot_drop: ["50gp", "Longsword"],
    quest_update: { status: "completed" }, // missing required 'id'
  },
};
const rH1 = validateDMResponse(questCombo);
assert(!rH1.success, "H1: top-level parse fails (quest_update malformed)");
assert(rH1.data?.updates?.xp_award === 200, "H1: xp_award salvaged");
assert(JSON.stringify(rH1.data?.updates?.loot_drop) === JSON.stringify(["50gp", "Longsword"]), "H1: loot_drop salvaged");
assert(rH1.data?.updates?.quest_update === undefined, "H1: malformed quest_update dropped");
assert(rH1.warnings.some((w) => w.includes("quest_update")), "H1: warning names quest_update");

// H2: malformed quest_add (missing required 'objectives') dropped without dropping sibling hp_delta
console.log("\nH2: malformed quest_add dropped without dropping hp_delta");
const questAddBad = {
  narration: "test",
  updates: {
    hp_delta: -10,
    quest_add: { id: "q1", title: "Find the amulet", description: "find it" }, // objectives missing
  },
};
const rH2 = validateDMResponse(questAddBad);
assert(!rH2.success, "H2: top-level parse fails (quest_add missing objectives)");
assert(rH2.data?.updates?.hp_delta === -10, "H2: hp_delta salvaged");
assert(rH2.data?.updates?.quest_add === undefined, "H2: malformed quest_add dropped");

// H3: valid quest_add / quest_update pass the strict schema end-to-end
console.log("\nH3: valid quest payloads pass strict schema");
const questGood = {
  narration: "test",
  updates: {
    quest_add: { id: "q1", title: "Find the amulet", description: "find it", objectives: [{ text: "หาสร้อย", done: false }] },
  },
};
const rH3 = validateDMResponse(questGood);
assert(rH3.success === true, "H3: valid quest_add succeeds");
assert(rH3.data?.updates?.quest_add?.id === "q1", "H3: quest_add preserved");

// H4: dungeon_enter with a malformed room never throws, and sibling updates still salvaged
console.log("\nH4: malformed dungeon room does not throw and does not drop sibling updates");
const dungeonBad = {
  narration: "test",
  updates: { xp_award: 50 },
  dungeon_enter: {
    id: "crypt1", name: "Crypt", entranceRoomId: "r1",
    rooms: [{ role: "entrance" }], // missing required id/name/description
    connections: [],
  },
};
let rH4: ReturnType<typeof validateDMResponse> | null = null;
let threw = false;
try { rH4 = validateDMResponse(dungeonBad); } catch { threw = true; }
assert(!threw, "H4: validateDMResponse never throws on malformed dungeon room");
assert(!!rH4 && !rH4.success, "H4: top-level parse fails (malformed room)");
assert(rH4?.data?.updates?.xp_award === 50, "H4: sibling updates.xp_award still salvaged");

console.log(`\n=== Hardening Results: ${pass} passed, ${fail} failed ===\n`);

// === Robustness Hardening: real-play shape variance (quest_add array,
// condition aliases/case, partial updates salvage, bare-object dungeon/world_map) ===
console.log("\n=== Robustness Hardening: LLM shape variance ===\n");

// R1: quest_add sent as a 1-item array (observed in live play) — normalizes to a single object
console.log("\nR1: quest_add as a 1-item array succeeds and normalizes to a single object");
const questArrOne = {
  narration: "test",
  updates: {
    quest_add: [{ id: "q1", title: "Find the amulet", description: "find it", objectives: [{ text: "หาสร้อย", done: false }] }],
  },
};
const rR1 = validateDMResponse(questArrOne);
assert(rR1.success === true, "R1: quest_add as 1-item array succeeds");
assert(!Array.isArray(rR1.data?.updates?.quest_add), "R1: quest_add normalized to a single object, not an array");
assert(rR1.data?.updates?.quest_add?.id === "q1", "R1: quest_add fields preserved");

// R2: quest_add sent as a multi-item array — uses first, warns about the rest (never silently drops everything)
console.log("\nR2: quest_add as a multi-item array uses the first, warns about extras");
const questArrTwo = {
  narration: "test",
  updates: {
    quest_add: [
      { id: "q1", title: "Quest One", description: "d1", objectives: [{ text: "a" }] },
      { id: "q2", title: "Quest Two", description: "d2", objectives: [{ text: "b" }] },
    ],
  },
};
const rR2 = validateDMResponse(questArrTwo);
assert(rR2.success === true, "R2: quest_add array of 2 still succeeds (uses first)");
assert(rR2.data?.updates?.quest_add?.id === "q1", "R2: first quest kept");
assert(rR2.warnings.some((w) => w.includes("quest_add") && w.includes("array")), "R2: warning about extra ignored quest");

// R3: quest_update sent as an array — same normalization applies
console.log("\nR3: quest_update as a 1-item array succeeds and normalizes to a single object");
const questUpdateArr = {
  narration: "test",
  updates: { quest_update: [{ id: "q1", status: "completed" }] },
};
const rR3 = validateDMResponse(questUpdateArr);
assert(rR3.success === true, "R3: quest_update as array succeeds");
assert(!Array.isArray(rR3.data?.updates?.quest_update), "R3: quest_update normalized to single object");

// R4: an unknown condition mixed with valid ones — keep recognized, drop unknown, still succeed
console.log("\nR4: unknown condition mixed with valid ones (matches the observed live-play bug)");
const mixedConditions = {
  narration: "test",
  updates: { conditions_add: ["blinded", "exhausted", "not_a_real_condition"] },
};
const rR4 = validateDMResponse(mixedConditions);
assert(rR4.success === true, "R4: mixed valid/invalid/alias conditions still succeeds");
assert(JSON.stringify(rR4.data?.updates?.conditions_add) === JSON.stringify(["blinded", "exhaustion"]), "R4: alias resolved + valid kept, unknown dropped");
assert(rR4.warnings.some((w) => w.includes("not_a_real_condition")), "R4: warning names the dropped condition");

// R5: case-insensitive condition matching
console.log("\nR5: case-insensitive condition matching");
const caseInsensitive = {
  narration: "test",
  updates: { conditions_add: ["Poisoned", "STUNNED"] },
};
const rR5 = validateDMResponse(caseInsensitive);
assert(rR5.success === true, "R5: case-insensitive conditions succeed");
assert(JSON.stringify(rR5.data?.updates?.conditions_add) === JSON.stringify(["poisoned", "stunned"]), "R5: case normalized to canonical ids");

// R6: a payload with mixed valid/invalid fields — apply the valid subset, never the whole payload
console.log("\nR6: mixed valid/invalid updates fields — valid subset still applies");
const mixedPayload = {
  narration: "test",
  updates: {
    hp_delta: -15,
    xp_award: 100,
    buffs_add: [{ name: "Blessed", type: "not_a_type", duration: 3 }], // invalid enum, strict (no .catch())
  },
};
const rR6 = validateDMResponse(mixedPayload);
assert(!rR6.success, "R6: top-level parse fails (buffs_add invalid type)");
assert(rR6.data?.updates?.hp_delta === -15, "R6: hp_delta salvaged from mixed payload");
assert(rR6.data?.updates?.xp_award === 100, "R6: xp_award salvaged from mixed payload");
assert(rR6.data?.updates?.buffs_add === undefined, "R6: only invalid buffs_add dropped, not the whole payload");

// R7: dungeon_enter rooms/connections sent as bare objects instead of arrays
console.log("\nR7: dungeon_enter rooms/connections as bare objects coerced to arrays");
const dungeonSingleRoom = {
  narration: "test",
  dungeon_enter: {
    id: "crypt2", name: "Crypt", entranceRoomId: "r1",
    rooms: { id: "r1", name: "Entry", role: "entrance", shape: "square", size: "small", description: "d" },
    connections: { id: "c1", from: "r1", to: "r2", type: "door", direction: "n" },
  },
};
const rR7 = validateDMResponse(dungeonSingleRoom);
assert(rR7.success === true, "R7: dungeon_enter with bare room/connection object succeeds");
assert(Array.isArray(rR7.data?.dungeon_enter?.rooms) && rR7.data?.dungeon_enter?.rooms?.length === 1, "R7: rooms coerced to array");
assert(Array.isArray(rR7.data?.dungeon_enter?.connections) && rR7.data?.dungeon_enter?.connections?.length === 1, "R7: connections coerced to array");

// R8: world_map sent as a bare object instead of an array
console.log("\nR8: world_map as a bare object coerced to an array");
const worldMapSingle = {
  narration: "test",
  world_map: { id: "town", name: "Town", type: "town" },
};
const rR8 = validateDMResponse(worldMapSingle);
assert(rR8.success === true, "R8: world_map bare object succeeds");
assert(Array.isArray(rR8.data?.world_map) && rR8.data?.world_map?.length === 1, "R8: world_map coerced to array");

// R9: a valid start_combat must survive a malformed SIBLING field (e.g. bad
// buffs_add) — the whole response must not collapse to bare narration.
console.log("\nR9: valid start_combat survives a malformed sibling updates field");
const combatSurvives = {
  narration: "A goblin ambushes you!",
  start_combat: { monsters: ["goblin"] },
  updates: { buffs_add: [{ name: "X", type: "bogus", duration: 3 }] }, // invalid enum, strict
};
const rR9 = validateDMResponse(combatSurvives);
assert(!rR9.success, "R9: top-level parse fails (buffs_add invalid type)");
assert(rR9.data?.start_combat != null, "R9: valid start_combat survives a malformed sibling field");
assert(rR9.data?.updates?.buffs_add === undefined, "R9: malformed buffs_add still dropped");

// R10: a valid dungeon_enter must survive a malformed sibling updates field
console.log("\nR10: valid dungeon_enter survives a malformed sibling updates field");
const dungeonSurvives = {
  narration: "test",
  dungeon_enter: { id: "crypt3", name: "Crypt", rooms: [{ id: "r1", name: "Entry", role: "entrance", shape: "square", size: "small", description: "d" }] },
  updates: { buffs_add: [{ name: "X", type: "bogus", duration: 3 }] },
};
const rR10 = validateDMResponse(dungeonSurvives);
assert(!rR10.success, "R10: top-level parse fails (buffs_add invalid type)");
assert(rR10.data?.dungeon_enter?.id === "crypt3", "R10: valid dungeon_enter survives a malformed sibling field");

// R11: a valid requires survives a malformed sibling — and semantic dedup
// (requires vs start_combat) still applies to the salvaged fallback too.
console.log("\nR11: semantic dedup (requires vs start_combat) applies to the salvaged fallback");
const dedupOnFallback = {
  narration: "test",
  requires: { type: "check", skill: "athletics", dc: 13 },
  start_combat: { monsters: ["goblin"] },
  updates: { buffs_add: [{ name: "X", type: "bogus", duration: 3 }] },
};
const rR11 = validateDMResponse(dedupOnFallback);
assert(!rR11.success, "R11: top-level parse fails (buffs_add invalid type)");
assert(rR11.data?.start_combat != null, "R11: start_combat survives");
assert(rR11.data?.requires === null, "R11: requires dropped by semantic dedup even on the salvaged fallback");

// R12: quest_add sent as an array of BARE STRINGS (quest titles) — coerced
// into a minimal valid quest object per string, first one kept.
console.log("\nR12: quest_add as an array of bare strings coerced to a quest object");
const questAddStringArr = {
  narration: "test",
  updates: { quest_add: ["Find the tomb", "Warn the village"] },
};
const rR12 = validateDMResponse(questAddStringArr);
assert(rR12.success === true, "R12: quest_add as array of bare strings succeeds");
assert(!Array.isArray(rR12.data?.updates?.quest_add), "R12: normalized to a single object");
assert(rR12.data?.updates?.quest_add?.title === "Find the tomb", "R12: title preserved from first string");
assert(!!rR12.data?.updates?.quest_add?.id, "R12: id derived from title");
assert(Array.isArray(rR12.data?.updates?.quest_add?.objectives) && rR12.data?.updates?.quest_add?.objectives.length === 1, "R12: objectives synthesized");
assert(rR12.warnings.some((w) => w.includes("quest_add") && w.includes("array")), "R12: warning about the extra ignored quest");

// R13: quest_add sent as a single bare string — coerced the same way
console.log("\nR13: quest_add as a single bare string coerced to a quest object");
const questAddSingleString = {
  narration: "test",
  updates: { quest_add: "Rescue the merchant" },
};
const rR13 = validateDMResponse(questAddSingleString);
assert(rR13.success === true, "R13: quest_add as single bare string succeeds");
assert(rR13.data?.updates?.quest_add?.title === "Rescue the merchant", "R13: title preserved");
assert(rR13.data?.updates?.quest_add?.description === "Rescue the merchant", "R13: description defaulted from title");
assert(!!rR13.data?.updates?.quest_add?.id, "R13: id derived from title");

// R14: conditions_add with a mix of [valid, unknown] — valid kept, only the
// unknown one dropped, field never rejected as a whole.
console.log("\nR14: conditions_add mix of [valid, unknown] keeps valid, drops only unknown");
const conditionsMixed = {
  narration: "test",
  updates: { conditions_add: ["poisoned", "not_a_real_condition"] },
};
const rR14 = validateDMResponse(conditionsMixed);
assert(rR14.success === true, "R14: mix of valid+unknown condition still succeeds");
assert(JSON.stringify(rR14.data?.updates?.conditions_add) === JSON.stringify(["poisoned"]), "R14: valid kept, unknown dropped");
assert(rR14.warnings.some((w) => w.includes("not_a_real_condition")), "R14: warning names the dropped unknown condition");

// R15: quest_add bare-string titles in Thai (the app's primary language) must
// not collapse to the same id — the slug regex is Latin/digits-only, so two
// distinct Thai titles must still resolve to two distinct ids via the hash
// fallback in questFromTitle.
console.log("\nR15: quest_add bare Thai titles get distinct ids, not a shared collapsed id");
const rThai1 = validateDMResponse({ narration: "test", updates: { quest_add: "หาสร้อย" } });
const rThai2 = validateDMResponse({ narration: "test", updates: { quest_add: "เตือนหมู่บ้าน" } });
assert(rThai1.success === true, "R15: Thai quest_add title succeeds");
assert(rThai1.data?.updates?.quest_add?.title === "หาสร้อย", "R15: Thai title preserved");
assert(!!rThai1.data?.updates?.quest_add?.id && rThai1.data?.updates?.quest_add?.id !== "quest", "R15: id is not the bare fallback constant");
assert(rThai1.data?.updates?.quest_add?.id !== rThai2.data?.updates?.quest_add?.id, "R15: two distinct Thai titles get distinct ids");

// R16: quest_add is a proper object, but `objectives` is an array of BARE
// STRINGS instead of {text, done?} objects — this is the shape that still
// dropped with "Invalid input: expected object, received string" even after
// R12/R13 (each objectives array element is validated against
// QuestObjectiveSchema, an object schema, so a string item fails per-item).
console.log("\nR16: quest_add.objectives as an array of bare strings coerced to {text} objects");
const questObjectivesStringArr = {
  narration: "test",
  updates: {
    quest_add: {
      id: "q1",
      title: "Find the amulet",
      description: "find it",
      objectives: ["Find the amulet", "Return it to the elder"],
    },
  },
};
const rR16 = validateDMResponse(questObjectivesStringArr);
assert(rR16.success === true, "R16: quest_add with bare-string objectives succeeds");
assert(rR16.data?.updates?.quest_add?.objectives.length === 2, "R16: both objectives preserved");
assert(rR16.data?.updates?.quest_add?.objectives[0].text === "Find the amulet", "R16: first objective text preserved");
assert(rR16.data?.updates?.quest_add?.objectives[1].text === "Return it to the elder", "R16: second objective text preserved");

// R17: quest_add.objectives is a SINGLE bare string (not even wrapped in an array)
console.log("\nR17: quest_add.objectives as a single bare string coerced to a one-element array");
const questObjectivesSingleString = {
  narration: "test",
  updates: {
    quest_add: {
      id: "q1",
      title: "Find the amulet",
      description: "find it",
      objectives: "Find the amulet and return it",
    },
  },
};
const rR17 = validateDMResponse(questObjectivesSingleString);
assert(rR17.success === true, "R17: quest_add with single-string objectives succeeds");
assert(rR17.data?.updates?.quest_add?.objectives.length === 1, "R17: one objective synthesized");
assert(rR17.data?.updates?.quest_add?.objectives[0].text === "Find the amulet and return it", "R17: objective text preserved");

// R18: quest_add.objectives mixes bare strings AND proper {text} objects —
// both forms tolerated in the same array.
console.log("\nR18: quest_add.objectives mix of [string, {text}] both survive");
const questObjectivesMixed = {
  narration: "test",
  updates: {
    quest_add: {
      id: "q1",
      title: "Find the amulet",
      description: "find it",
      objectives: ["Find the amulet", { text: "Return it", done: true }],
    },
  },
};
const rR18 = validateDMResponse(questObjectivesMixed);
assert(rR18.success === true, "R18: mixed objectives array succeeds");
assert(rR18.data?.updates?.quest_add?.objectives[0].text === "Find the amulet", "R18: bare string objective coerced");
assert(rR18.data?.updates?.quest_add?.objectives[1].done === true, "R18: proper object objective preserved untouched");

// === requires hardening: tolerate reasonable LLM shape variance instead of
// hard-dropping the whole field on a partial mismatch ===

// R19: requires sent as a single-element array (same toArray-style leniency
// used elsewhere) unwraps to the object.
console.log("\nR19: requires as a single-element array unwraps");
const requiresArray = {
  narration: "test",
  requires: [{ type: "check", skill: "athletics", dc: 13 }],
};
const rR19 = validateDMResponse(requiresArray);
assert(rR19.success === true, "R19: requires as 1-item array succeeds");
assert(rR19.data?.requires?.type === "check", "R19: requires normalized to a single object");

// R20: requires type alias ("skill_check"/"saving_throw") and alternate field
// names (ability sent as `save`) are folded to the canonical shape.
console.log("\nR20: requires type aliases + alt field names tolerated");
const requiresAltCheck = { narration: "test", requires: { type: "skill_check", skill: "athletics", dc: 13 } };
const rR20a = validateDMResponse(requiresAltCheck);
assert(rR20a.success === true, "R20: type alias 'skill_check' normalizes to 'check'");
assert(rR20a.data?.requires?.type === "check", "R20: requires.type is 'check'");

const requiresAltSave = { narration: "test", requires: { type: "saving_throw", save: "dex", dc: 13 } };
const rR20b = validateDMResponse(requiresAltSave);
assert(rR20b.success === true, "R20: type alias 'saving_throw' + alt field 'save' normalizes");
assert(rR20b.data?.requires?.type === "save" && (rR20b.data?.requires as { ability?: string })?.ability === "dex", "R20: requires.ability derived from alt field 'save'");

// R21: requires.ability full-word ("dexterity") and requires.dc as a numeric
// string ("13") are both coerced instead of dropped.
console.log("\nR21: requires ability full-word + numeric-string dc coerced");
const requiresFullWordAbility = { narration: "test", requires: { type: "save", ability: "dexterity", dc: 13 } };
const rR21a = validateDMResponse(requiresFullWordAbility);
assert(rR21a.success === true, "R21: ability full-word 'dexterity' succeeds");
assert((rR21a.data?.requires as { ability?: string })?.ability === "dex", "R21: ability normalized to 'dex'");

const requiresStringDc = { narration: "test", requires: { type: "check", skill: "athletics", dc: "13" } };
const rR21b = validateDMResponse(requiresStringDc);
assert(rR21b.success === true, "R21: numeric-string dc succeeds");
assert((rR21b.data?.requires as { dc?: number })?.dc === 13, "R21: dc coerced to number 13");

// R22: a bare-string `requires` (free-form prose) is DELIBERATELY not coerced
// — it cannot seed the required `dc`, so fabricating a DC the DM never sent
// would violate "engine doesn't trust the LLM". It must drop cleanly with a
// warning (never crash, never invent a check).
console.log("\nR22: bare-string requires drops cleanly with a warning (no crash, no fabricated DC)");
const requiresBareString = { narration: "test", requires: "athletics check DC 13" };
const rR22 = validateDMResponse(requiresBareString);
assert(rR22.data?.narration === "test", "R22: narration still salvaged (no crash)");
assert(rR22.data?.requires == null, "R22: un-coercible bare-string requires dropped, not fabricated");
assert(rR22.warnings.some((w) => w.includes("requires")) || rR22.errors.some((e) => e.includes("requires")), "R22: drop is reported (warn/error), not silent");

console.log(`\n=== Robustness Hardening Results: ${pass} passed, ${fail} failed ===\n`);

// === Bug fix: world_map location "dir" — full-word / bad values must not
// drop the whole world_map array (see WorldMapLocationSchema.dir) ===
console.log("\n=== Bug fix: world_map location dir tolerance ===\n");

// D1: full-word direction "north" parses and normalizes to "n"
console.log("\nD1: world_map location dir 'north' normalizes to 'n'");
const worldMapFullWordDir = {
  narration: "test",
  world_map: [{ id: "town", name: "Town", dir: "north" }],
};
const rD1 = validateDMResponse(worldMapFullWordDir);
assert(rD1.success === true, "D1: world_map with dir 'north' succeeds");
assert(rD1.data?.world_map?.[0]?.dir === "n", "D1: dir 'north' normalized to 'n'");

// D2: garbage dir value falls back to a default instead of dropping world_map
console.log("\nD2: world_map location with garbage dir falls back, world_map not dropped");
const worldMapBadDir = {
  narration: "test",
  world_map: [{ id: "somewhere", name: "Somewhere", dir: "sideways" }],
};
const rD2 = validateDMResponse(worldMapBadDir);
assert(rD2.success === true, "D2: world_map with garbage dir still succeeds");
assert(rD2.data?.world_map != null, "D2: world_map not dropped");
assert(!!rD2.data?.world_map?.[0]?.dir, "D2: dir falls back to a default value");

// D3: one bad dir among several locations must not drop the valid siblings
console.log("\nD3: world_map array with one bad dir keeps valid sibling locations");
const worldMapMixedDirs = {
  narration: "test",
  world_map: [
    { id: "town", name: "Town", dir: "n" },
    { id: "forest", name: "Forest", dir: "garbage_dir" },
    { id: "cave", name: "Cave", dir: "southwest" },
  ],
};
const rD3 = validateDMResponse(worldMapMixedDirs);
assert(rD3.success === true, "D3: world_map array with one bad dir still succeeds");
assert(rD3.data?.world_map?.length === 3, "D3: all 3 locations preserved, none dropped");
assert(rD3.data?.world_map?.[0]?.dir === "n", "D3: valid sibling 'n' preserved");
assert(rD3.data?.world_map?.[2]?.dir === "sw", "D3: valid sibling 'southwest' normalized to 'sw'");

console.log(`\n=== Bug Fix Results: ${pass} passed, ${fail} failed ===\n`);

// === Numeric-string coercion ===
// DM often sends numeric fields as digit-strings (e.g. "13", "-5"). The
// shared `numStr()` zod helper coerces clean integer strings before the
// wrapped schema validates, without laundering non-numeric strings, null,
// or out-of-range values into 0 (unlike z.coerce.number(), which would).
console.log("\n=== Numeric-string coercion ===\n");

// N1: updates.hp_delta numeric string coerces to the correct number
console.log("\nN1: updates.hp_delta numeric string coerces");
const rN1 = validateDMResponse({ narration: "test", updates: { hp_delta: "-5" } });
assert(rN1.success === true, "N1: numeric-string hp_delta parses successfully");
assert(rN1.data?.updates?.hp_delta === -5, "N1: hp_delta coerced to -5");
assert(rN1.data?.updates?.hp_delta !== 0, "N1: hp_delta not laundered to 0");

// N2: updates.gold_delta numeric string coerces to the correct number
console.log("\nN2: updates.gold_delta numeric string coerces");
const rN2 = validateDMResponse({ narration: "test", updates: { gold_delta: "250" } });
assert(rN2.success === true, "N2: numeric-string gold_delta parses successfully");
assert(rN2.data?.updates?.gold_delta === 250, "N2: gold_delta coerced to 250");
assert(rN2.data?.updates?.gold_delta !== 0, "N2: gold_delta not laundered to 0");

// N3: updates.xp_award numeric string coerces to the correct number
console.log("\nN3: updates.xp_award numeric string coerces");
const rN3 = validateDMResponse({ narration: "test", updates: { xp_award: "300" } });
assert(rN3.success === true, "N3: numeric-string xp_award parses successfully");
assert(rN3.data?.updates?.xp_award === 300, "N3: xp_award coerced to 300");
assert(rN3.data?.updates?.xp_award !== 0, "N3: xp_award not laundered to 0");

// N4: updates.temp_hp numeric string coerces to the correct number
console.log("\nN4: updates.temp_hp numeric string coerces");
const rN4 = validateDMResponse({ narration: "test", updates: { temp_hp: "12" } });
assert(rN4.success === true, "N4: numeric-string temp_hp parses successfully");
assert(rN4.data?.updates?.temp_hp === 12, "N4: temp_hp coerced to 12");
assert(rN4.data?.updates?.temp_hp !== 0, "N4: temp_hp not laundered to 0");

// N5: updates.exhaustion_delta numeric string coerces to the correct number
console.log("\nN5: updates.exhaustion_delta numeric string coerces");
const rN5 = validateDMResponse({ narration: "test", updates: { exhaustion_delta: "-2" } });
assert(rN5.success === true, "N5: numeric-string exhaustion_delta parses successfully");
assert(rN5.data?.updates?.exhaustion_delta === -2, "N5: exhaustion_delta coerced to -2");
assert(rN5.data?.updates?.exhaustion_delta !== 0, "N5: exhaustion_delta not laundered to 0");

// N6: requires.dc numeric string coerces to the correct number
console.log("\nN6: requires.dc numeric string coerces");
const rN6 = validateDMResponse({ narration: "test", requires: { type: "check", skill: "athletics", dc: "27" } });
assert(rN6.success === true, "N6: numeric-string requires.dc parses successfully");
assert((rN6.data?.requires as { dc?: number })?.dc === 27, "N6: requires.dc coerced to 27");
assert((rN6.data?.requires as { dc?: number })?.dc !== 0, "N6: requires.dc not laundered to 0");

// N7: non-numeric string hp_delta is dropped (strict parse fails, updates.hp_delta
// is the only field present so `updates` salvages to null), never laundered to 0
console.log("\nN7: non-numeric string hp_delta dropped, not laundered to 0");
const rN7 = validateDMResponse({ narration: "test", updates: { hp_delta: "abc" } });
assert(rN7.success === false, "N7: non-numeric hp_delta fails strict validation");
assert(rN7.data?.updates == null, "N7: updates salvaged to null (only invalid field present)");
assert(rN7.warnings.some((w) => w.includes("hp_delta")), "N7: warning names the dropped hp_delta field");

// N8: null hp_delta is dropped the same way — zod optional() still rejects null
console.log("\nN8: null hp_delta dropped, not laundered to 0");
const rN8 = validateDMResponse({ narration: "test", updates: { hp_delta: null } });
assert(rN8.success === false, "N8: null hp_delta fails strict validation");
assert(rN8.data?.updates == null, "N8: updates salvaged to null (only invalid field present)");
assert(rN8.warnings.some((w) => w.includes("hp_delta")), "N8: warning names the dropped hp_delta field");

// N9: non-numeric string gold_delta dropped, not laundered to 0
console.log("\nN9: non-numeric string gold_delta dropped, not laundered to 0");
const rN9 = validateDMResponse({ narration: "test", updates: { gold_delta: "abc" } });
assert(rN9.success === false, "N9: non-numeric gold_delta fails strict validation");
assert(rN9.data?.updates == null, "N9: updates salvaged to null (only invalid field present)");

// N10: non-numeric string xp_award dropped, not laundered to 0
console.log("\nN10: non-numeric string xp_award dropped, not laundered to 0");
const rN10 = validateDMResponse({ narration: "test", updates: { xp_award: "abc" } });
assert(rN10.success === false, "N10: non-numeric xp_award fails strict validation");
assert(rN10.data?.updates == null, "N10: updates salvaged to null (only invalid field present)");

// N11: non-numeric string temp_hp dropped, not laundered to 0
console.log("\nN11: non-numeric string temp_hp dropped, not laundered to 0");
const rN11 = validateDMResponse({ narration: "test", updates: { temp_hp: "abc" } });
assert(rN11.success === false, "N11: non-numeric temp_hp fails strict validation");
assert(rN11.data?.updates == null, "N11: updates salvaged to null (only invalid field present)");

// N12: non-numeric string exhaustion_delta dropped, not laundered to 0
console.log("\nN12: non-numeric string exhaustion_delta dropped, not laundered to 0");
const rN12 = validateDMResponse({ narration: "test", updates: { exhaustion_delta: "abc" } });
assert(rN12.success === false, "N12: non-numeric exhaustion_delta fails strict validation");
assert(rN12.data?.updates == null, "N12: updates salvaged to null (only invalid field present)");

// N13: out-of-range numeric-string hp_delta ("9999" > HP_DELTA_CAP) is rejected
// exactly like an out-of-range number would be — zod .max() rejects, never clamps
console.log("\nN13: out-of-range numeric-string hp_delta rejected, not clamped");
const rN13 = validateDMResponse({ narration: "test", updates: { hp_delta: "9999" } });
assert(rN13.success === false, "N13: numeric-string hp_delta over cap fails strict validation");
assert(rN13.data?.updates == null, "N13: out-of-range hp_delta dropped, not clamped");
assert(rN13.warnings.some((w) => w.includes("hp_delta")), "N13: warning names the dropped hp_delta field");

// N14: out-of-range numeric-string requires.dc ("999" > max 40) is rejected
// exactly like an out-of-range number would be (see Test 7 above)
console.log("\nN14: out-of-range numeric-string requires.dc rejected, not clamped");
const rN14 = validateDMResponse({ narration: "test", requires: { type: "check", skill: "athletics", dc: "999" } });
assert(!rN14.success, "N14: numeric-string requires.dc over cap fails strict validation");

console.log(`\n=== Numeric-String Coercion Results: ${pass} passed, ${fail} failed ===\n`);

process.exit(fail > 0 ? 1 : 0);
