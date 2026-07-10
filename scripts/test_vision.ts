/**
 * Vision / line-of-sight / senses engine test suite — verifies src/lib/engine/vision.ts:
 *
 *   1. lineOfSight() / coverBetween() — Bresenham centerline tracing through a list of
 *      Obstacle cells; "total" cover both blocks line of sight and reports canBeTargeted=false.
 *   2. obscurementAt() — ambient light (dim/darkness) and physical obscurants (fog/foliage)
 *      combine into none/lightly/heavily, independently of any observer's senses.
 *   3. canPerceive() — per-sense feasibility matrix (normal sight, darkvision, blindsight,
 *      tremorsense, truesight) against light, magical darkness, invisibility, ground contact,
 *      and line of sight / total cover.
 *   4. attackVisibilityModifier() — 2024 unseen-attacker / unseen-target composition, incl.
 *      the advantage+disadvantage cancellation case.
 *
 * Standalone script (own pass/fail counters, process.exit(1) on failure) — run via
 * the vitest legacy harness (tests/legacy-scripts.test.ts).
 */
import assert from "assert";
import {
  lineOfSight,
  coverBetween,
  obscurementAt,
  canPerceive,
  attackVisibilityModifier,
  type Obstacle,
  type Observer,
  type PerceptionSubject,
} from "../src/lib/engine/vision";

let pass = 0, fail = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e: any) { fail++; failures.push(`${name}: ${e.message}`); console.log(`  ✗ ${name} — ${e.message}`); }
}
function eq(a: any, b: any, msg?: string) { assert.strictEqual(a, b, msg ?? `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c: boolean, msg?: string) { assert.ok(c, msg); }

console.log("=== Vision / Senses Engine Tests ===\n");

// ---------------------------------------------------------------------------
// 1. Line of sight & cover
// ---------------------------------------------------------------------------

test("lineOfSight: clear path, no obstacles", () => {
  const r = lineOfSight({ x: 0, y: 0 }, { x: 5, y: 0 }, []);
  ok(r.hasLineOfSight, "expected clear LOS");
});

test("lineOfSight: total-cover obstacle blocks LOS", () => {
  const obstacles: Obstacle[] = [{ pos: { x: 2, y: 0 }, cover: "total" }];
  const r = lineOfSight({ x: 0, y: 0 }, { x: 5, y: 0 }, obstacles);
  ok(!r.hasLineOfSight, "expected LOS blocked");
  eq(r.blockedBy?.x, 2);
});

test("lineOfSight: half-cover obstacle does NOT block LOS", () => {
  const obstacles: Obstacle[] = [{ pos: { x: 2, y: 0 }, cover: "half" }];
  const r = lineOfSight({ x: 0, y: 0 }, { x: 5, y: 0 }, obstacles);
  ok(r.hasLineOfSight, "expected LOS still clear through half cover");
});

test("coverBetween: no obstacles -> none, AC +0, targetable", () => {
  const r = coverBetween({ x: 0, y: 0 }, { x: 5, y: 0 }, []);
  eq(r.level, "none");
  eq(r.acBonus, 0);
  eq(r.dexSaveBonus, 0);
  ok(r.canBeTargeted);
});

test("coverBetween: half cover -> +2 AC/Dex save", () => {
  const obstacles: Obstacle[] = [{ pos: { x: 2, y: 0 }, cover: "half" }];
  const r = coverBetween({ x: 0, y: 0 }, { x: 5, y: 0 }, obstacles);
  eq(r.level, "half");
  eq(r.acBonus, 2);
  eq(r.dexSaveBonus, 2);
  ok(r.canBeTargeted);
});

test("coverBetween: three-quarters cover -> +5 AC/Dex save", () => {
  const obstacles: Obstacle[] = [{ pos: { x: 2, y: 0 }, cover: "threeQuarters" }];
  const r = coverBetween({ x: 0, y: 0 }, { x: 5, y: 0 }, obstacles);
  eq(r.level, "threeQuarters");
  eq(r.acBonus, 5);
  eq(r.dexSaveBonus, 5);
});

test("coverBetween: total cover -> can't be targeted", () => {
  const obstacles: Obstacle[] = [{ pos: { x: 2, y: 0 }, cover: "total" }];
  const r = coverBetween({ x: 0, y: 0 }, { x: 5, y: 0 }, obstacles);
  eq(r.level, "total");
  ok(!r.canBeTargeted, "total cover must not be targetable");
});

test("coverBetween: best (highest) cover wins among multiple obstacles", () => {
  const obstacles: Obstacle[] = [
    { pos: { x: 2, y: 0 }, cover: "half" },
    { pos: { x: 4, y: 0 }, cover: "threeQuarters" },
  ];
  const r = coverBetween({ x: 0, y: 0 }, { x: 5, y: 0 }, obstacles);
  eq(r.level, "threeQuarters");
});

// ---------------------------------------------------------------------------
// 2. Obscurement
// ---------------------------------------------------------------------------

test("obscurementAt: bright light -> none", () => {
  const r = obscurementAt({ x: 0, y: 0 }, { light: "bright" });
  eq(r.level, "none");
});

test("obscurementAt: dim light -> lightly", () => {
  const r = obscurementAt({ x: 0, y: 0 }, { light: "dim" });
  eq(r.level, "lightly");
  ok(r.reasons.includes("dim_light"));
});

test("obscurementAt: darkness -> heavily", () => {
  const r = obscurementAt({ x: 0, y: 0 }, { light: "darkness" });
  eq(r.level, "heavily");
  ok(r.reasons.includes("darkness"));
});

test("obscurementAt: heavy fog in bright light -> heavily", () => {
  const r = obscurementAt({ x: 0, y: 0 }, { light: "bright", obscurant: "heavy" });
  eq(r.level, "heavily");
});

test("obscurementAt: light foliage in bright light -> lightly", () => {
  const r = obscurementAt({ x: 0, y: 0 }, { light: "bright", obscurant: "light" });
  eq(r.level, "lightly");
});

test("obscurementAt: dim light + light obscurant doesn't compound to heavy", () => {
  const r = obscurementAt({ x: 0, y: 0 }, { light: "dim", obscurant: "light" });
  eq(r.level, "lightly");
});

// ---------------------------------------------------------------------------
// 3. canPerceive — sense feasibility matrix
// ---------------------------------------------------------------------------

test("canPerceive: normal sight in bright light, no obstacles -> visible", () => {
  const observer: Observer = { pos: { x: 0, y: 0 }, senses: {} };
  const target: PerceptionSubject = { pos: { x: 4, y: 0 } };
  const r = canPerceive(observer, target, { environment: { light: "bright" } });
  ok(r.canPerceive);
  eq(r.method, "sight");
});

test("canPerceive: normal sight fails in plain darkness (no darkvision)", () => {
  const observer: Observer = { pos: { x: 0, y: 0 }, senses: {} };
  const target: PerceptionSubject = { pos: { x: 4, y: 0 } };
  const r = canPerceive(observer, target, { environment: { light: "darkness" } });
  ok(!r.canPerceive);
  eq(r.method, "none");
});

test("canPerceive: darkvision sees in plain darkness within range", () => {
  const observer: Observer = { pos: { x: 0, y: 0 }, senses: { darkvisionRange: 60 } };
  const target: PerceptionSubject = { pos: { x: 10, y: 0 } }; // 10 squares = 50 ft
  const r = canPerceive(observer, target, { environment: { light: "darkness" } });
  ok(r.canPerceive);
  eq(r.method, "darkvision");
});

test("canPerceive: darkvision fails beyond its range", () => {
  const observer: Observer = { pos: { x: 0, y: 0 }, senses: { darkvisionRange: 60 } };
  const target: PerceptionSubject = { pos: { x: 20, y: 0 } }; // 20 squares = 100 ft
  const r = canPerceive(observer, target, { environment: { light: "darkness" } });
  ok(!r.canPerceive);
});

test("canPerceive: darkvision is blocked by magical darkness", () => {
  const observer: Observer = { pos: { x: 0, y: 0 }, senses: { darkvisionRange: 60 } };
  const target: PerceptionSubject = { pos: { x: 4, y: 0 } };
  const r = canPerceive(observer, target, { environment: { light: "darkness", magical: true } });
  ok(!r.canPerceive, "magical darkness should defeat plain darkvision");
});

test("canPerceive: truesight sees through magical darkness and invisibility", () => {
  const observer: Observer = { pos: { x: 0, y: 0 }, senses: { truesightRange: 120 } };
  const target: PerceptionSubject = { pos: { x: 4, y: 0 }, invisible: true };
  const r = canPerceive(observer, target, { environment: { light: "darkness", magical: true } });
  ok(r.canPerceive);
  eq(r.method, "truesight");
});

test("canPerceive: truesight is still blocked by heavy fog (physical obscurant)", () => {
  const observer: Observer = { pos: { x: 0, y: 0 }, senses: { truesightRange: 120 } };
  const target: PerceptionSubject = { pos: { x: 4, y: 0 } };
  const r = canPerceive(observer, target, { environment: { light: "bright", obscurant: "heavy" } });
  ok(!r.canPerceive, "truesight does not see through mundane fog/foliage");
});

test("canPerceive: blindsight perceives an invisible creature", () => {
  const observer: Observer = { pos: { x: 0, y: 0 }, senses: { blindsightRange: 10 } };
  const target: PerceptionSubject = { pos: { x: 1, y: 0 }, invisible: true };
  const r = canPerceive(observer, target, { environment: { light: "bright" } });
  ok(r.canPerceive);
  eq(r.method, "blindsight");
});

test("canPerceive: blindsight works even while the observer is blinded", () => {
  const observer: Observer = { pos: { x: 0, y: 0 }, senses: { blindsightRange: 10, blinded: true } };
  const target: PerceptionSubject = { pos: { x: 1, y: 0 } };
  const r = canPerceive(observer, target, { environment: { light: "bright" } });
  ok(r.canPerceive);
  eq(r.method, "blindsight");
});

test("canPerceive: blinded observer with only normal sight perceives nothing", () => {
  const observer: Observer = { pos: { x: 0, y: 0 }, senses: { blinded: true } };
  const target: PerceptionSubject = { pos: { x: 1, y: 0 } };
  const r = canPerceive(observer, target, { environment: { light: "bright" } });
  ok(!r.canPerceive);
});

test("canPerceive: tremorsense ignores total-cover walls", () => {
  const observer: Observer = { pos: { x: 0, y: 0 }, senses: { tremorsenseRange: 30 } };
  const target: PerceptionSubject = { pos: { x: 4, y: 0 }, grounded: true };
  const obstacles: Obstacle[] = [{ pos: { x: 2, y: 0 }, cover: "total" }];
  const r = canPerceive(observer, target, { environment: { light: "bright" }, obstacles });
  ok(r.canPerceive, "tremorsense should sense through a wall");
  eq(r.method, "tremorsense");
  eq(r.lineOfSight.hasLineOfSight, false, "LOS itself is still reported as blocked");
});

test("canPerceive: tremorsense fails against a non-grounded (flying) target", () => {
  // Darkness with no darkvision so normal sight can't trivially see the target;
  // tremorsense is the only sense in play, and it requires ground contact.
  const observer: Observer = { pos: { x: 0, y: 0 }, senses: { tremorsenseRange: 30 } };
  const target: PerceptionSubject = { pos: { x: 4, y: 0 }, grounded: false };
  const r = canPerceive(observer, target, { environment: { light: "darkness" } });
  ok(!r.canPerceive);
});

test("canPerceive: invisible target defeats normal sight even in bright light", () => {
  const observer: Observer = { pos: { x: 0, y: 0 }, senses: {} };
  const target: PerceptionSubject = { pos: { x: 4, y: 0 }, invisible: true };
  const r = canPerceive(observer, target, { environment: { light: "bright" } });
  ok(!r.canPerceive);
});

test("canPerceive: total cover blocks normal sight entirely (not targetable)", () => {
  const observer: Observer = { pos: { x: 0, y: 0 }, senses: {} };
  const target: PerceptionSubject = { pos: { x: 5, y: 0 } };
  const obstacles: Obstacle[] = [{ pos: { x: 2, y: 0 }, cover: "total" }];
  const r = canPerceive(observer, target, { environment: { light: "bright" }, obstacles });
  ok(!r.canPerceive);
  eq(r.cover.level, "total");
  ok(!r.cover.canBeTargeted);
});

// ---------------------------------------------------------------------------
// 4. Unseen attacker / unseen target composition
// ---------------------------------------------------------------------------

test("attackVisibilityModifier: both see each other -> none", () => {
  eq(attackVisibilityModifier(true, true), "none");
});

test("attackVisibilityModifier: attacker can't see target -> disadvantage", () => {
  eq(attackVisibilityModifier(false, true), "disadvantage");
});

test("attackVisibilityModifier: target can't see attacker -> advantage", () => {
  eq(attackVisibilityModifier(true, false), "advantage");
});

test("attackVisibilityModifier: neither sees the other -> cancels to none", () => {
  eq(attackVisibilityModifier(false, false), "none");
});

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.error("Failures:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("All vision engine tests passed!");
