/**
 * Smoke test for half-caster slot table (D&D 2024 PHB Paladin/Ranger)
 * Run: npx tsx scripts/test_half_caster_slots.ts
 */
import { HALF_CASTER_SLOTS, SLOT_TABLE } from "../src/lib/gameData";
import { getSlotTable, maxSpellLevel } from "../src/lib/spells";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}`); fail++; }
}

console.log("\n=== Half-Caster Slot Table (D&D 2024 PHB) ===\n");

// Test 1: HALF_CASTER_SLOTS[L] = SLOT_TABLE[ceil(L/2)]
console.log("Test 1: HALF_CASTER_SLOTS[L] matches SLOT_TABLE[ceil(L/2)]");
for (let L = 1; L <= 20; L++) {
  const expected = SLOT_TABLE[Math.ceil(L / 2)];
  const actual = HALF_CASTER_SLOTS[L];
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `Lv${L}: HALF_CASTER_SLOTS=${JSON.stringify(actual)} matches SLOT_TABLE[ceil(${L}/2)=${Math.ceil(L / 2)}]=${JSON.stringify(expected)}`
  );
}

// Test 2: Lv1 Paladin gets slots (2024 change from 2014)
console.log("\nTest 2: D&D 2024 — Paladin/Ranger start at Lv1 (not Lv2 like 2014)");
assert(JSON.stringify(getSlotTable("paladin", 1)) === "[2]", "Lv1 Paladin gets [2] (2024)");
assert(JSON.stringify(getSlotTable("ranger", 1)) === "[2]", "Lv1 Ranger gets [2] (2024)");
assert(JSON.stringify(getSlotTable("paladin", 0)) === "[]", "Lv0 Paladin gets []");

// Test 3: Key milestones
console.log("\nTest 3: Key milestone levels");
assert(JSON.stringify(HALF_CASTER_SLOTS[9]) === "[4,3,2]", `Lv9 = [4,3,2] (got ${JSON.stringify(HALF_CASTER_SLOTS[9])})`);
assert(JSON.stringify(HALF_CASTER_SLOTS[13]) === "[4,3,3,1]", `Lv13 = [4,3,3,1] — Lv4 spells unlocked (got ${JSON.stringify(HALF_CASTER_SLOTS[13])})`);
assert(JSON.stringify(HALF_CASTER_SLOTS[17]) === "[4,3,3,3,1]", `Lv17 = [4,3,3,3,1] — Lv5 spells unlocked (got ${JSON.stringify(HALF_CASTER_SLOTS[17])})`);
assert(JSON.stringify(HALF_CASTER_SLOTS[20]) === "[4,3,3,3,2]", `Lv20 = [4,3,3,3,2] (got ${JSON.stringify(HALF_CASTER_SLOTS[20])})`);

// Test 4: maxSpellLevel
console.log("\nTest 4: maxSpellLevel for half-casters");
assert(maxSpellLevel("paladin", 1) === 1, "Lv1 Paladin maxSpellLevel = 1");
assert(maxSpellLevel("paladin", 4) === 1, "Lv4 Paladin maxSpellLevel = 1");
assert(maxSpellLevel("paladin", 5) === 2, "Lv5 Paladin maxSpellLevel = 2");
assert(maxSpellLevel("paladin", 9) === 3, "Lv9 Paladin maxSpellLevel = 3");
assert(maxSpellLevel("paladin", 13) === 4, "Lv13 Paladin maxSpellLevel = 4");
assert(maxSpellLevel("paladin", 17) === 5, "Lv17 Paladin maxSpellLevel = 5");
assert(maxSpellLevel("paladin", 20) === 5, "Lv20 Paladin maxSpellLevel = 5");

// Test 5: Bug history — old table capped at Lv3 spells at Lv15-20
console.log("\nTest 5: Bug regression — old table had [4,3,2] from Lv15-20 (WRONG)");
assert(HALF_CASTER_SLOTS[20].length === 5, `Lv20 should have 5 spell levels (got ${HALF_CASTER_SLOTS[20].length})`);
assert(HALF_CASTER_SLOTS[15].length === 4, `Lv15 should have 4 spell levels (got ${HALF_CASTER_SLOTS[15].length})`);

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail > 0 ? 1 : 0);
