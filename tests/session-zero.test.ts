/**
 * Task #16 — Session Zero engine tests. Pure builder + summary, so every branch
 * is exercised with exact inputs (no RNG, no clock).
 */
import { describe, it, expect } from "vitest";
import {
  createDefaultSessionZero,
  normalizeSessionZero,
  setTone,
  setPillars,
  addLine,
  addVeil,
  removeLine,
  removeVeil,
  setXCard,
  setStartingSituation,
  hasStartingSituation,
  isDefaultSessionZero,
  pillarPercentages,
  summarizeSessionZero,
  TONE_ORDER,
  type SessionZeroConfig,
} from "../src/lib/engine/sessionZero";

describe("createDefaultSessionZero", () => {
  it("returns a sensible, valid default with X-card on", () => {
    const cfg = createDefaultSessionZero();
    expect(cfg.tone).toBe("dark-fantasy");
    expect(cfg.safety.lines).toEqual([]);
    expect(cfg.safety.veils).toEqual([]);
    expect(cfg.safety.xCard).toBe(true);
    expect(cfg.pillars).toEqual({ combat: 50, exploration: 50, social: 50 });
    expect(isDefaultSessionZero(cfg)).toBe(true);
  });
});

describe("normalizeSessionZero", () => {
  it("coerces null/garbage to the default", () => {
    expect(normalizeSessionZero(null)).toEqual(createDefaultSessionZero());
    expect(normalizeSessionZero(42)).toEqual(createDefaultSessionZero());
    expect(normalizeSessionZero("nope")).toEqual(createDefaultSessionZero());
  });

  it("keeps valid fields and repairs invalid ones", () => {
    const cfg = normalizeSessionZero({
      tone: "horror",
      safety: { lines: [" gore ", "", "gore", 5], veils: ["romance"], xCard: false },
      pillars: { combat: 999, exploration: -10, social: 40.6 },
      situation: {
        location: "  Ravenloft ",
        hook: "the mists close in",
        bondNpc: { name: " Ireena ", relationship: "ward" },
      },
    });
    expect(cfg.tone).toBe("horror");
    // trimmed, de-duped, non-strings dropped, blanks dropped
    expect(cfg.safety.lines).toEqual(["gore"]);
    expect(cfg.safety.veils).toEqual(["romance"]);
    expect(cfg.safety.xCard).toBe(false);
    // clamped + rounded
    expect(cfg.pillars).toEqual({ combat: 100, exploration: 0, social: 41 });
    expect(cfg.situation.location).toBe("Ravenloft");
    expect(cfg.situation.bondNpc).toEqual({ name: "Ireena", relationship: "ward" });
  });

  it("falls back to dark-fantasy for an unknown tone and defaults xCard on", () => {
    const cfg = normalizeSessionZero({ tone: "sitcom", safety: {} });
    expect(cfg.tone).toBe("dark-fantasy");
    expect(cfg.safety.xCard).toBe(true);
  });

  it("normalizes every valid tone through a round-trip", () => {
    for (const tone of TONE_ORDER) {
      expect(normalizeSessionZero({ tone }).tone).toBe(tone);
    }
  });
});

describe("builder transforms are immutable", () => {
  it("setTone / setPillars return new configs without mutating the input", () => {
    const base = createDefaultSessionZero();
    const toned = setTone(base, "mystery");
    expect(toned.tone).toBe("mystery");
    expect(base.tone).toBe("dark-fantasy");

    const weighted = setPillars(base, { combat: 80, social: 20 });
    expect(weighted.pillars).toEqual({ combat: 80, exploration: 50, social: 20 });
    expect(base.pillars.combat).toBe(50);
  });

  it("setPillars clamps out-of-range weights", () => {
    const cfg = setPillars(createDefaultSessionZero(), { combat: 250, exploration: -5 });
    expect(cfg.pillars.combat).toBe(100);
    expect(cfg.pillars.exploration).toBe(0);
  });

  it("addLine / addVeil trim, de-dupe, and ignore blanks", () => {
    let cfg = createDefaultSessionZero();
    cfg = addLine(cfg, "  torture  ");
    cfg = addLine(cfg, "torture"); // dup
    cfg = addLine(cfg, "   "); // blank
    cfg = addVeil(cfg, "intimacy");
    expect(cfg.safety.lines).toEqual(["torture"]);
    expect(cfg.safety.veils).toEqual(["intimacy"]);
  });

  it("removeLine / removeVeil / setXCard behave", () => {
    let cfg = addVeil(addLine(createDefaultSessionZero(), "a"), "b");
    cfg = removeLine(cfg, "a");
    cfg = removeVeil(cfg, "b");
    cfg = setXCard(cfg, false);
    expect(cfg.safety.lines).toEqual([]);
    expect(cfg.safety.veils).toEqual([]);
    expect(cfg.safety.xCard).toBe(false);
  });

  it("setStartingSituation merges partials and trims", () => {
    let cfg = createDefaultSessionZero();
    cfg = setStartingSituation(cfg, { location: "  Barovia " });
    cfg = setStartingSituation(cfg, { hook: "a letter arrives", bondNpc: { name: "Kolyan" } });
    expect(cfg.situation.location).toBe("Barovia");
    expect(cfg.situation.hook).toBe("a letter arrives");
    expect(cfg.situation.bondNpc.name).toBe("Kolyan");
    // untouched sub-field preserved
    expect(cfg.situation.bondNpc.relationship).toBe("");
  });
});

describe("query helpers", () => {
  it("hasStartingSituation needs both location and hook", () => {
    let cfg = createDefaultSessionZero();
    expect(hasStartingSituation(cfg)).toBe(false);
    cfg = setStartingSituation(cfg, { location: "town" });
    expect(hasStartingSituation(cfg)).toBe(false);
    cfg = setStartingSituation(cfg, { hook: "a plague" });
    expect(hasStartingSituation(cfg)).toBe(true);
  });

  it("isDefaultSessionZero flips false after any real edit", () => {
    expect(isDefaultSessionZero(setTone(createDefaultSessionZero(), "heroic"))).toBe(false);
    expect(isDefaultSessionZero(addLine(createDefaultSessionZero(), "x"))).toBe(false);
    expect(isDefaultSessionZero(setXCard(createDefaultSessionZero(), false))).toBe(false);
  });

  it("pillarPercentages normalizes to ~100 and handles all-zero", () => {
    const p = pillarPercentages(setPillars(createDefaultSessionZero(), { combat: 60, exploration: 30, social: 10 }));
    expect(p.combat + p.exploration + p.social).toBe(100);
    expect(p.combat).toBe(60);
    const zero = pillarPercentages(setPillars(createDefaultSessionZero(), { combat: 0, exploration: 0, social: 0 }));
    expect(zero.combat + zero.exploration + zero.social).toBe(100);
  });
});

describe("summarizeSessionZero", () => {
  it("returns empty string for an untouched default (drop-from-prompt like summarizeMemory)", () => {
    expect(summarizeSessionZero(createDefaultSessionZero())).toBe("");
  });

  it("emits a directive block that includes tone, pillars, safety and situation", () => {
    let cfg = createDefaultSessionZero();
    cfg = setTone(cfg, "horror");
    cfg = setPillars(cfg, { combat: 20, exploration: 30, social: 50 });
    cfg = addLine(cfg, "harm to children");
    cfg = addVeil(cfg, "romance");
    cfg = setStartingSituation(cfg, {
      location: "หมู่บ้านแบล็กมัวร์",
      hook: "ศพลอยขึ้นมาในบ่อน้ำ",
      bondNpc: { name: "เอลารา", relationship: "น้องสาว" },
    });
    const s = summarizeSessionZero(cfg);
    expect(s).toContain("SESSION ZERO");
    expect(s).toContain("สยองขวัญ");
    expect(s).toContain("harm to children");
    expect(s).toContain("romance");
    expect(s).toContain("หมู่บ้านแบล็กมัวร์");
    expect(s).toContain("ศพลอยขึ้นมาในบ่อน้ำ");
    expect(s).toContain("เอลารา");
    // pillar percentages surfaced
    expect(s).toContain("50%");
  });

  it("omits sections the player left blank", () => {
    const cfg = setTone(createDefaultSessionZero(), "heroic"); // only tone changed
    const s = summarizeSessionZero(cfg);
    expect(s).toContain("วีรบุรุษ");
    expect(s).not.toContain("LINES");
    expect(s).not.toContain("Hook");
  });

  it("still notes the X-card when it is the only non-default", () => {
    // xCard defaults ON; turning it OFF is a real edit so the block emits.
    const cfg: SessionZeroConfig = setXCard(createDefaultSessionZero(), false);
    const s = summarizeSessionZero(cfg);
    expect(s).not.toBe("");
    expect(s).not.toContain("X-card เปิดใช้งาน");
  });
});
