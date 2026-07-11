import { describe, it, expect } from "vitest";
import { isConcentrationSpellName, toSpellDisplayName, CONCENTRATION_SPELL_NAMES } from "../src/lib/engine/effects";

/**
 * Regression test for the concentration name-desync bug: DnDSolo used a naive
 * title-case regex (`/\b\w/g`) to build the buff display name from an SRD
 * spell name. That regex treats the letter right after an apostrophe as a new
 * "word" (so "Hunter's Mark" → "Hunter'S Mark") and capitalizes every word
 * including short connectors (so "Shield of Faith" → "Shield Of Faith").
 * Both mismatch CONCENTRATION_SPELL_NAMES, so the buff was never recognized
 * as a concentration spell — never dropped when a new one was cast, never
 * cleared at 0 HP, and never triggered a CON save on damage.
 *
 * toSpellDisplayName is the fix: canonical title-casing that matches
 * CONCENTRATION_SPELL_NAMES exactly, for any raw casing of the input.
 */
describe("toSpellDisplayName + isConcentrationSpellName", () => {
  it("recognizes a concentration spell with an apostrophe (Hunter's Mark)", () => {
    expect(toSpellDisplayName("hunter's mark")).toBe("Hunter's Mark");
    expect(toSpellDisplayName("Hunter's Mark")).toBe("Hunter's Mark");
    expect(isConcentrationSpellName(toSpellDisplayName("hunter's mark"))).toBe(true);
  });

  it("recognizes a concentration spell with a lowercase connector word (Shield of Faith)", () => {
    expect(toSpellDisplayName("shield of faith")).toBe("Shield of Faith");
    expect(isConcentrationSpellName(toSpellDisplayName("shield of faith"))).toBe(true);
  });

  it("matches every canonical concentration name exactly (idempotent casing)", () => {
    for (const name of CONCENTRATION_SPELL_NAMES) {
      expect(toSpellDisplayName(name.toLowerCase())).toBe(name);
      expect(isConcentrationSpellName(toSpellDisplayName(name.toLowerCase()))).toBe(true);
    }
  });

  it("does not flag a non-concentration buff name", () => {
    expect(isConcentrationSpellName(toSpellDisplayName("mage armor"))).toBe(false);
  });
});
