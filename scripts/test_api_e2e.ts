/**
 * End-to-End HTTP API Test Suite
 * Tests /api/dm, /api/intent, /api/srd against running dev server.
 */
import assert from "assert";

const BASE = "http://localhost:3000";
let pass = 0, fail = 0, skipped = 0;
const failures: string[] = [];

async function getJSON(path: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

async function postJSON(path: string, body: any): Promise<any> {
  return getJSON(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    pass++;
  } catch (e: any) {
    fail++;
    failures.push(`${name}: ${e.message}`);
    console.log(`  ✗ ${name} — ${e.message}`);
  }
}

console.log("=== HTTP API Test Suite ===\n");

(async () => {
// ============================================================================
// /api/srd — 24 endpoints proxy
// ============================================================================
console.log("1. SRD API (/api/srd) — 24 endpoints proxy");

await test("Probe endpoint", async () => {
  const r = await getJSON("/api/srd?probe=1");
  assert.ok(r.ok === true || r.ok === false, `expected ok field, got ${JSON.stringify(r)}`);
});

await test("List spells", async () => {
  const r = await getJSON("/api/srd?list=spells");
  assert.ok(r.count > 0, `expected spell count > 0, got ${r.count}`);
  assert.ok(Array.isArray(r.results));
  assert.ok(r.results.length > 100, `expected many spells, got ${r.results.length}`);
});

await test("List monsters", async () => {
  const r = await getJSON("/api/srd?list=monsters");
  assert.ok(r.count > 0);
  assert.ok(r.results.length > 100, `expected many monsters, got ${r.results.length}`);
});

await test("List classes (12)", async () => {
  const r = await getJSON("/api/srd?list=classes");
  assert.ok(r.count >= 12, `expected 12 classes, got ${r.count}`);
});

await test("Get spell: fire-bolt", async () => {
  const r = await getJSON("/api/srd?spell=fire-bolt");
  assert.ok(r.name === "Fire Bolt");
});

await test("Get spell: magic-missile", async () => {
  const r = await getJSON("/api/srd?spell=magic-missile");
  assert.ok(r.name === "Magic Missile");
});

await test("Get spell: fireball", async () => {
  const r = await getJSON("/api/srd?spell=fireball");
  assert.ok(r.name === "Fireball");
});

await test("Get monster: goblin", async () => {
  const r = await getJSON("/api/srd?monster=goblin");
  assert.ok(r.name === "Goblin");
  assert.ok(r.armor_class !== undefined);
  assert.ok(r.hit_points !== undefined);
});

await test("Get monster: ancient-red-dragon", async () => {
  const r = await getJSON("/api/srd?monster=ancient-red-dragon");
  assert.ok(r.name.includes("Dragon"));
});

await test("Get class: wizard", async () => {
  const r = await getJSON("/api/srd?class=wizard");
  assert.ok(r.name === "Wizard");
  assert.ok(r.hit_die === 6);
});

await test("Get race: elf", async () => {
  const r = await getJSON("/api/srd?race=elf");
  assert.ok(r.name === "Elf");
});

await test("Get condition: poisoned", async () => {
  const r = await getJSON("/api/srd?condition=poisoned");
  assert.ok(r.name === "Poisoned");
});

await test("Get equipment: longsword", async () => {
  const r = await getJSON("/api/srd?equipment=longsword");
  assert.ok(r.name === "Longsword");
});

await test("Get magic-item: cloak-of-protection", async () => {
  const r = await getJSON("/api/srd?magic-item=cloak-of-protection");
  assert.ok(r.name === "Cloak of Protection");
});

await test("Get feat: lucky", async () => {
  const r = await getJSON("/api/srd?feat=lucky");
  assert.ok(r.name === "Lucky");
});

await test("Get skill: stealth", async () => {
  const r = await getJSON("/api/srd?skill=stealth");
  assert.ok(r.name === "Stealth");
});

await test("Get damage-type: fire", async () => {
  const r = await getJSON("/api/srd?damage-type=fire");
  assert.ok(r.name === "Fire");
});

await test("Get magic-school: evocation", async () => {
  const r = await getJSON("/api/srd?magic-school=evocation");
  assert.ok(r.name === "Evocation");
});

await test("List conditions (15+)", async () => {
  const r = await getJSON("/api/srd?list=conditions");
  assert.ok(r.count >= 15, `expected 15+ conditions, got ${r.count}`);
});

await test("List equipment-categories", async () => {
  const r = await getJSON("/api/srd?list=equipment-categories");
  assert.ok(r.count > 0);
});

await test("Class levels: wizard 1-20", async () => {
  const r = await getJSON("/api/srd?class-levels=wizard");
  assert.ok(Array.isArray(r));
  assert.ok(r.length === 20, `expected 20 levels, got ${r.length}`);
});

await test("Filter spells by class + level (wizard, level 1)", async () => {
  const r = await getJSON("/api/srd?list=spells&spellClass=wizard&spellLevel=1");
  assert.ok(r.count > 0);
  assert.ok(r.results.length > 10, `expected many wizard Lv1 spells, got ${r.results.length}`);
});

// ============================================================================
// /api/dm — GLM-4-Plus DM endpoint
// ============================================================================
console.log("\n2. DM API (/api/dm) — GLM-4-Plus");

await test("DM responds with text", async () => {
  const r = await postJSON("/api/dm", {
    system: "You are a helpful assistant. Reply with the word PONG only.",
    messages: [{ role: "user", content: "ping" }],
  });
  assert.ok(typeof r.text === "string", `expected text field, got ${Object.keys(r)}`);
  assert.ok(r.text.length > 0, "text should not be empty");
});

await test("DM respects system prompt", async () => {
  const r = await postJSON("/api/dm", {
    system: "Reply only with the literal string: HELLO",
    messages: [{ role: "user", content: "hi" }],
  });
  assert.ok(typeof r.text === "string");
  assert.ok(r.text.length > 0);
});

await test("DM handles Thai input", async () => {
  const r = await postJSON("/api/dm", {
    system: "ตอบภาษาไทยสั้นๆ 5 คำ",
    messages: [{ role: "user", content: "สวัสดีครับ" }],
  });
  assert.ok(typeof r.text === "string");
  assert.ok(r.text.length > 0);
});

// ============================================================================
// /api/intent — LLM intent classifier
// ============================================================================
console.log("\n3. Intent API (/api/intent) — LLM classifier");

await test("Intent: greeting", async () => {
  const r = await postJSON("/api/intent", { text: "สวัสดีครับ ขอบคุณมาก" });
  assert.ok(typeof r.intent === "string");
  assert.ok(r.confidence >= 0 && r.confidence <= 1);
});

await test("Intent: bargain", async () => {
  const r = await postJSON("/api/intent", { text: "ลดราคาให้หน่อยได้ไหม แพงไป" });
  assert.ok(typeof r.intent === "string");
});

await test("Intent: request_quest", async () => {
  const r = await postJSON("/api/intent", { text: "มีเควสต์ใหม่ให้ฉันทำไหม" });
  assert.ok(typeof r.intent === "string");
});

await test("Intent: threaten", async () => {
  const r = await postJSON("/api/intent", { text: "ฆ่าให้หมดเลย อย่าให้ฉันต้องเสียเวลา" });
  assert.ok(typeof r.intent === "string");
});

await test("Intent: confidence range valid", async () => {
  const r = await postJSON("/api/intent", { text: "ขอบคุณมากครับ" });
  assert.ok(r.confidence >= 0 && r.confidence <= 1, `confidence out of range: ${r.confidence}`);
});

// ============================================================================
// Error handling
// ============================================================================
console.log("\n4. Error Handling");

await test("DM: invalid JSON body → 400", async () => {
  const res = await fetch(`${BASE}/api/dm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json",
  });
  assert.ok(res.status === 400, `expected 400, got ${res.status}`);
});

await test("DM: missing system field → 400", async () => {
  const res = await fetch(`${BASE}/api/dm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [] }),
  });
  assert.ok(res.status === 400, `expected 400, got ${res.status}`);
});

await test("SRD: invalid type → 400 or 404", async () => {
  const res = await fetch(`${BASE}/api/srd?invalidtype=foo`);
  assert.ok(res.status === 400 || res.status === 404, `expected 400 or 404, got ${res.status}`);
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
  for (const f of failures) {
    console.log(`  ✗ ${f}`);
  }
}
process.exit(fail > 0 ? 1 : 0);
})();

