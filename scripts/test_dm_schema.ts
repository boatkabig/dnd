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

// Test 3: Invalid condition IDs rejected
console.log("\nTest 3: Invalid condition IDs rejected");
const invalidCond = {
  narration: "test",
  updates: { conditions_add: ["blinded", "fake_condition", "stunned"] },
};
const r3 = validateDMResponse(invalidCond);
assert(!r3.success, "invalid condition fails strict validation");

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

process.exit(fail > 0 ? 1 : 0);
