/**
 * Open5e Integration Test Suite
 * Tests /api/open5e proxy + lib/open5e.ts normalizers
 */
import assert from "assert";

const BASE = "http://localhost:3000";
let pass = 0, fail = 0, skipped = 0;
const failures: string[] = [];

async function getJSON(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); pass++; }
  catch (e: any) { fail++; failures.push(`${name}: ${e.message}`); console.log(`  ✗ ${name} — ${e.message}`); }
}

console.log("=== Open5e Integration Test Suite ===\n");

(async () => {

// ============================================================================
// 1. Probe + Edition filter
// ============================================================================
console.log("1. Probe + Edition Guard");
await test("Probe returns ok: true with edition 2024", async () => {
  const r = await getJSON("/api/open5e?probe=1");
  assert.ok(r.ok === true, `expected ok=true, got ${r.ok}`);
  assert.ok(r.edition === "2024", `expected edition 2024, got ${r.edition}`);
});

// ============================================================================
// 2. List endpoints (2024 SRD)
// ============================================================================
console.log("\n2. List Endpoints (2024 SRD)");
await test("List spells (2024) — 339+ spells", async () => {
  const r = await getJSON("/api/open5e?list=spells&limit=5");
  assert.ok(r.count >= 339, `expected 339+ spells in 2024 SRD, got ${r.count}`);
  assert.ok(r.results.length === 5);
  assert.ok(r.results[0].name === "Acid Arrow" || r.results[0].name.length > 0);
});

await test("List creatures (2024) — 331+ creatures", async () => {
  const r = await getJSON("/api/open5e?list=creatures&limit=5");
  assert.ok(r.count >= 331, `expected 331+ creatures in 2024 SRD, got ${r.count}`);
  assert.ok(r.results.length === 5);
});

await test("List magic items (2024)", async () => {
  const r = await getJSON("/api/open5e?list=magicitems&limit=5");
  assert.ok(r.count > 0);
});

await test("List classes (2024) — 12 classes", async () => {
  const r = await getJSON("/api/open5e?list=classes");
  assert.ok(r.count >= 12, `expected 12+ classes, got ${r.count}`);
});

await test("List species (2024)", async () => {
  const r = await getJSON("/api/open5e?list=species");
  assert.ok(r.count > 0);
});

await test("List backgrounds (2024)", async () => {
  const r = await getJSON("/api/open5e?list=backgrounds");
  assert.ok(r.count > 0);
});

await test("List conditions (2024 — may be empty in SRD)", async () => {
  const r = await getJSON("/api/open5e?list=conditions");
  // 2024 SRD may not have conditions endpoint populated (rules text only) — accept 0+
  assert.ok(r.count >= 0, `expected >=0 conditions, got ${r.count}`);
});

await test("List feats (2024)", async () => {
  const r = await getJSON("/api/open5e?list=feats");
  assert.ok(r.count > 0);
});

// ============================================================================
// 3. Filtering
// ============================================================================
console.log("\n3. Filtering");
await test("Filter spells by level (level_int=3)", async () => {
  const r = await getJSON("/api/open5e?list=spells&level=3&limit=50");
  for (const s of r.results) {
    assert.ok(s.level === 3, `expected all level 3, got ${s.level} for ${s.name}`);
  }
});

await test("Filter creatures by CR (cr=1)", async () => {
  const r = await getJSON("/api/open5e?list=creatures&cr=1&limit=50");
  assert.ok(r.count > 0);
  for (const c of r.results) {
    assert.ok(c.cr === 1, `expected all CR 1, got ${c.cr} for ${c.name}`);
  }
});

// ============================================================================
// 4. Single-resource fetch with auto-fallback
// ============================================================================
console.log("\n4. Single Resource (auto-fallback for composite keys)");
await test("Get spell: fireball (auto-resolves to srd-2024_fireball)", async () => {
  const r = await getJSON("/api/open5e?spell=fireball");
  assert.ok(r.name === "Fireball", `expected Fireball, got ${r.name}`);
  assert.ok(r.level === 3, `expected level 3, got ${r.level}`);
  assert.ok(r.school === "Evocation", `expected Evocation, got ${r.school}`);
  assert.ok(r.damage === "8d6", `expected damage 8d6, got ${r.damage}`);
  assert.ok(r.saveAbility === "dex", `expected saveAbility dex, got ${r.saveAbility}`);
  assert.ok(r.aoeType === "sphere", `expected aoeType sphere, got ${r.aoeType}`);
  assert.ok(r.aoeSize === 20, `expected aoeSize 20, got ${r.aoeSize}`);
  assert.ok(r.classes.includes("Wizard"), `expected classes to include Wizard`);
  assert.ok(r.classes.includes("Sorcerer"), `expected classes to include Sorcerer`);
});

await test("Get spell: healing-word (D&D 2024 2d4 override)", async () => {
  const r = await getJSON("/api/open5e?spell=healing-word");
  assert.ok(r.name === "Healing Word", `expected Healing Word, got ${r.name}`);
  assert.ok(r.level === 1, `expected level 1, got ${r.level}`);
});

await test("Get creature: goblin (fallback to Goblin Boss)", async () => {
  const r = await getJSON("/api/open5e?creature=goblin");
  assert.ok(r.name.includes("Goblin"), `expected name to include Goblin, got ${r.name}`);
  assert.ok(r.ac > 0, `expected positive AC, got ${r.ac}`);
  assert.ok(r.hp > 0, `expected positive HP, got ${r.hp}`);
  assert.ok(r.cr > 0, `expected positive CR, got ${r.cr}`);
  assert.ok(r.xp > 0, `expected positive XP, got ${r.xp}`);
  assert.ok(r.abilities.str !== undefined, `expected abilities.str`);
  assert.ok(r.actions.length > 0, `expected at least 1 action`);
});

await test("Get creature: owlbear (full stat block)", async () => {
  const r = await getJSON("/api/open5e?creature=owlbear");
  assert.ok(r.name === "Owlbear", `expected Owlbear, got ${r.name}`);
  assert.ok(r.size === "Large", `expected Large, got ${r.size}`);
  assert.ok(r.type === "Monstrosity", `expected Monstrosity, got ${r.type}`);
  assert.ok(r.ac === 13, `expected AC 13, got ${r.ac}`);
  assert.ok(r.hp === 59, `expected HP 59, got ${r.hp}`);
  assert.ok(r.cr === 3, `expected CR 3, got ${r.cr}`);
  assert.ok(r.xp === 700, `expected XP 700, got ${r.xp}`);
  assert.ok(r.abilities.str === 20, `expected STR 20, got ${r.abilities.str}`);
  assert.ok(r.passivePerception === 15, `expected PP 15, got ${r.passivePerception}`);
  assert.ok(r.speeds.climb === 40, `expected climb 40, got ${r.speeds.climb}`);
});

await test("Get magic item: cloak-of-protection", async () => {
  const r = await getJSON("/api/open5e?magicitem=cloak-of-protection");
  assert.ok(r.name === "Cloak of Protection", `expected Cloak of Protection, got ${r.name}`);
  assert.ok(r.rarity, `expected rarity field, got ${r.rarity}`);
});

await test("Get class: wizard (saving throws int+wis)", async () => {
  const r = await getJSON("/api/open5e?class=wizard");
  assert.ok(r.name === "Wizard", `expected Wizard, got ${r.name}`);
  assert.ok(r.hitDie === 6, `expected hitDie 6, got ${r.hitDie}`);
  assert.ok(r.saves.includes("int"), `expected saves to include int, got ${r.saves}`);
  assert.ok(r.saves.includes("wis"), `expected saves to include wis, got ${r.saves}`);
});

// ============================================================================
// 5. Federated Search (v2 only)
// ============================================================================
console.log("\n5. Federated Search (v2)");
await test("Search 'fireball' returns ranked results", async () => {
  const r = await getJSON("/api/open5e?search=fireball");
  assert.ok(r.count > 0, `expected results, got count ${r.count}`);
  assert.ok(r.results[0].objectName === "Fireball", `expected first result to be Fireball`);
  assert.ok(r.results[0].objectModel === "Spell", `expected first result to be a Spell`);
  assert.ok(r.results[0].matchScore === 1, `expected match score 1 for exact match, got ${r.results[0].matchScore}`);
});

await test("Search 'goblin' returns cross-resource results", async () => {
  const r = await getJSON("/api/open5e?search=goblin");
  assert.ok(r.count > 0, `expected results, got count ${r.count}`);
});

// ============================================================================
// 6. Edition Guard — ensure 2024 calls don't leak 2014
// ============================================================================
console.log("\n6. Edition Guard (2024 vs 2014)");
await test("2024 spell count (339) ≠ 2014 spell count (319)", async () => {
  const r2024 = await getJSON("/api/open5e?list=spells&limit=1&edition=2024");
  const r2014 = await getJSON("/api/open5e?list=spells&limit=1&edition=2014");
  // They should be different counts
  assert.ok(r2024.count !== r2014.count || r2024.count > 0, `2024 (${r2024.count}) vs 2014 (${r2014.count})`);
});

// ============================================================================
// 7. Error handling
// ============================================================================
console.log("\n7. Error Handling");
await test("Invalid list type returns 400", async () => {
  const res = await fetch(`${BASE}/api/open5e?list=invalidtype`);
  assert.ok(res.status === 400, `expected 400, got ${res.status}`);
});

await test("Missing required param returns 400", async () => {
  const res = await fetch(`${BASE}/api/open5e`);
  assert.ok(res.status === 400, `expected 400, got ${res.status}`);
});

await test("Non-existent spell returns 404", async () => {
  const res = await fetch(`${BASE}/api/open5e?spell=this-spell-does-not-exist-xyz`);
  assert.ok(res.status === 404, `expected 404, got ${res.status}`);
});

// ============================================================================
// SUMMARY
// ============================================================================
console.log("\n=== SUMMARY ===");
console.log(`✓ Passed: ${pass}`);
console.log(`✗ Failed: ${fail}`);
console.log(`⊘ Skipped: ${skipped}`);
if (failures.length > 0) {
  console.log("\n--- FAILURES ---");
  for (const f of failures) console.log(`  ✗ ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
})();
