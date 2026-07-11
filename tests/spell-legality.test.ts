import { describe, it, expect } from "vitest";
import { canCast2024 } from "../src/lib/engine/magic";

/**
 * Phase 3 — D&D 2024 spell-legality gate (engine/magic.canCast2024).
 * These exercise the exact rules DnDSolo routes casts through (the e2e suite
 * cannot cast spells, so the engine gate is verified here).
 *
 * Slot representation is the app's flat array: slots[i] = level-(i+1) slots left.
 */
describe("canCast2024 — D&D 2024 cast legality", () => {
  // A level-5 full caster: 4/3/2 slots at L1/L2/L3.
  const slots = [4, 3, 2, 0, 0, 0, 0, 0, 0];

  it("blocks a spell that is not known/prepared", () => {
    const r = canCast2024({ spellLevel: 1, slotLevel: 1, slots, isKnownOrPrepared: false });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_known");
  });

  it("allows a cantrip with no slot cost (once known)", () => {
    const r = canCast2024({ spellLevel: 0, slotLevel: 0, slots: [0, 0, 0, 0, 0, 0, 0, 0, 0], isKnownOrPrepared: true });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("ok");
  });

  it("blocks a known cantrip if the caster hasn't learned it", () => {
    const r = canCast2024({ spellLevel: 0, slotLevel: 0, slots, isKnownOrPrepared: false });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_known");
  });

  it("allows a base-level cast when a slot of that level is available", () => {
    const r = canCast2024({ spellLevel: 1, slotLevel: 1, slots, isKnownOrPrepared: true });
    expect(r.ok).toBe(true);
  });

  it("blocks when no slot of the chosen level remains (no slot spent)", () => {
    const r = canCast2024({ spellLevel: 3, slotLevel: 3, slots: [4, 3, 0, 0, 0, 0, 0, 0, 0], isKnownOrPrepared: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_slot");
  });

  it("allows a valid upcast (level-1 spell cast with a level-3 slot)", () => {
    const r = canCast2024({ spellLevel: 1, slotLevel: 3, slots, isKnownOrPrepared: true });
    expect(r.ok).toBe(true);
  });

  it("blocks an upcast when the chosen higher slot is exhausted", () => {
    const r = canCast2024({ spellLevel: 1, slotLevel: 3, slots: [4, 3, 0, 0, 0, 0, 0, 0, 0], isKnownOrPrepared: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_slot");
  });

  it("blocks casting a leveled spell with a slot below its level", () => {
    const r = canCast2024({ spellLevel: 3, slotLevel: 1, slots, isKnownOrPrepared: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("below_spell_level");
  });

  it("blocks an out-of-range slot level (> 9)", () => {
    const r = canCast2024({ spellLevel: 1, slotLevel: 10, slots, isKnownOrPrepared: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("slot_out_of_range");
  });
});
