import { describe, it, expect, vi, beforeEach } from "vitest";

// castSRDSpell fetches the spell from Open5e; mock that so the RNG-free control
// paths (load failure, illegal cast) are deterministic. Damage/heal math uses
// dice and is covered by the Playwright spell e2e instead.
vi.mock("../src/lib/srd", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/srd")>();
  return { ...actual, fetchSpell: vi.fn() };
});

// Debuff test below runs the REAL srd.ts fetchSpell (deriveSpellKind +
// conditionsForSpell/DEBUFF_CONDITIONS), so only the network-facing Open5e
// fetch is mocked here — that's the raw, un-derived spell shape.
vi.mock("../src/lib/open5e", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/open5e")>();
  return { ...actual, getSpell: vi.fn() };
});

import { castSRDSpell } from "../src/lib/castSpell";
import { tickBuffs } from "../src/lib/buffs";
import { computeAC } from "../src/lib/spells";
import { fetchSpell } from "../src/lib/srd";
import { getSpell as open5eGetSpell } from "../src/lib/open5e";
import { runEnemyPhase, type CombatDeps } from "../src/lib/combatResolve";
import { buildBridgeState } from "../src/lib/engine/combatBridge";

const deps: CombatDeps = { entrySystem: (t) => ({ id: 1, type: "system", text: t }), nextId: () => 1 };
const cc = () => ({ name: "Mage", level: 3, cls: "wizard", slots: [0, 0], knownSpells: [] as string[], conditions: [], abilities: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10 }, worn: [], buffs: [], hp: 20, maxHp: 20 });
const cb = () => ({ enemies: [] as any[], enemyPositions: {}, playerPos: { x: 0, y: 0 } });

describe("castSRDSpell", () => {
  beforeEach(() => {
    (fetchSpell as any).mockReset();
    (open5eGetSpell as any).mockReset();
  });

  it("fails gracefully when the spell cannot be loaded (ends the turn, no crash)", async () => {
    (fetchSpell as any).mockResolvedValue(null);
    const c = cc(), b = cb();
    const out = await castSRDSpell("no-such-spell", 1, c, b, [], deps);
    expect(out.endsTurn).toBe(true);
    expect(out.cc).toBe(c); // unchanged reference on load failure
  });

  it("blocks an illegal cast (no slot / not prepared) without spending the turn or a slot", async () => {
    (fetchSpell as any).mockResolvedValue({ level: 1, name: "Magic Missile", school: "evocation", kind: "auto", damage: "3d4+3" });
    const c = cc(); // slots [0,0] → no level-1 slots, and knownSpells empty
    const entries: any[] = [];
    const out = await castSRDSpell("magic-missile", 1, c, cb(), entries, deps);
    expect(out.endsTurn).toBe(false);      // illegal cast does not consume the turn
    expect(out.cc.slots).toEqual([0, 0]);  // no slot spent
    expect(entries.length).toBeGreaterThanOrEqual(1); // a Thai "can't cast" message
  });

  it("uses Shield's timed character buff for +5 AC, then loses it on expiry", async () => {
    (fetchSpell as any).mockResolvedValue({ index: "shield", name: "Shield", level: 1, school: "abjuration", kind: "buff", desc: "", concentration: false });
    const c = { ...cc(), slots: [1, 0], knownSpells: ["shield"] };
    const out = await castSRDSpell("shield", 1, c, cb(), [], deps);

    expect(computeAC(c)).toBe(12);
    expect(out.cc.ac).toBe(17);
    expect(computeAC(out.cc)).toBe(17);
    const enemyEntries: any[] = [];
    runEnemyPhase({
      ...cb(),
      bridge: buildBridgeState([
        { id: "player", name: "Mage", ac: 12, hp: 20, isPlayer: true, initiative: 20 },
        { id: "enemy", name: "Enemy", ac: 12, hp: 10, isPlayer: false, initiative: 10 },
      ]),
      enemies: [{ uid: "enemy", th: "Enemy", hp: 10, hpNow: 10, ac: 12, attacks: [{ name: "Club", atk: 0, dmg: "1d1" }], conditions: [] }],
      enemyPositions: { enemy: { x: 1, y: 0 } },
      playerPos: { x: 0, y: 0 },
    }, out.cc, enemyEntries, true, deps);
    expect(enemyEntries.find((entry) => entry.type === "roll")?.vsAc).toBe(17);

    const expired = tickBuffs(out.cc);
    expect(expired.ac).toBe(12);
  });

  it("healing spell that revives from 0 HP clears deathSaves and removes Unconscious (Wave 2 heal adapter)", async () => {
    (fetchSpell as any).mockResolvedValue({ index: "cure-wounds", name: "Cure Wounds", level: 1, school: "abjuration", kind: "heal", heal: "1d8", desc: "", concentration: false });
    const c = { ...cc(), slots: [1, 0], knownSpells: ["cure-wounds"], hp: 0, deathSaves: { s: 2, f: 1 }, conditions: ["unconscious"] };
    const out = await castSRDSpell("cure-wounds", 1, c, cb(), [], deps);
    expect(out.cc.hp).toBeGreaterThan(0);
    expect(out.cc.deathSaves).toEqual({ s: 0, f: 0 });
    expect(out.cc.conditions).not.toContain("unconscious");
  });

  it.each([
    ["faerie-fire", "Faerie Fire", "dex", "glowing"],
    ["bane", "Bane", "cha", "bane"],
    ["slow", "Slow", "wis", "slow"],
  ])("classifies %s as a save spell and applies its debuff condition via srd.ts's real classification", async (index, name, saveAbility, condition) => {
    // Unlike the other tests in this file, run the REAL srd.ts fetchSpell (not a
    // stub of its output) so this exercises deriveSpellKind + conditionsForSpell/
    // DEBUFF_CONDITIONS end-to-end. Only the network-facing Open5e fetch is
    // mocked, with a raw spell shape that has no `kind`/`conditionsAdd` set —
    // a regression in either derivation would fail this test.
    const actualSrd = await vi.importActual<typeof import("../src/lib/srd")>("../src/lib/srd");
    (fetchSpell as any).mockImplementation(actualSrd.fetchSpell);
    (open5eGetSpell as any).mockResolvedValue({
      index, name, level: 1, school: "Enchantment", schoolKey: "enchantment",
      castingTime: "1 action", range: "90 feet",
      components: { verbal: true, somatic: true, material: false },
      duration: "1 minute", concentration: true, ritual: false,
      desc: "", higherLevel: "", classes: [],
      saveAbility, bonusAction: false, isCantrip: false, edition: "2024",
    });
    const c = { ...cc(), slots: [1, 0], knownSpells: [index] };
    const combat = {
      ...cb(),
      enemies: [{ uid: "enemy", th: "Target", hp: 10, hpNow: 10, ac: 12, sv: { dex: -100, cha: -100, wis: -100 }, conditions: [] }],
    };

    const out = await castSRDSpell(index, 1, c, combat, [], deps, "enemy");
    expect(out.cb.enemies[0].conditions).toContain(condition);
  });
});
