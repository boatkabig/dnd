import { describe, it, expect, vi, beforeEach } from "vitest";

// castSRDSpell fetches the spell from Open5e; mock that so the RNG-free control
// paths (load failure, illegal cast) are deterministic. Damage/heal math uses
// dice and is covered by the Playwright spell e2e instead.
vi.mock("../src/lib/srd", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/srd")>();
  return { ...actual, fetchSpell: vi.fn() };
});

import { castSRDSpell } from "../src/lib/castSpell";
import { tickBuffs } from "../src/lib/buffs";
import { computeAC } from "../src/lib/spells";
import { fetchSpell } from "../src/lib/srd";
import { runEnemyPhase, type CombatDeps } from "../src/lib/combatResolve";
import { buildBridgeState } from "../src/lib/engine/combatBridge";

const deps: CombatDeps = { entrySystem: (t) => ({ id: 1, type: "system", text: t }), nextId: () => 1 };
const cc = () => ({ name: "Mage", level: 3, cls: "wizard", slots: [0, 0], knownSpells: [] as string[], conditions: [], abilities: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10 }, worn: [], buffs: [], hp: 20, maxHp: 20 });
const cb = () => ({ enemies: [] as any[], enemyPositions: {}, playerPos: { x: 0, y: 0 } });

describe("castSRDSpell", () => {
  beforeEach(() => (fetchSpell as any).mockReset());

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

  it.each([
    ["faerie-fire", "Faerie Fire", "dex", "glowing"],
    ["bane", "Bane", "cha", "bane"],
    ["slow", "Slow", "wis", "slow"],
  ])("applies %s's enemy debuff on a failed save", async (index, name, saveAbility, condition) => {
    (fetchSpell as any).mockResolvedValue({ index, name, level: 1, school: "enchantment", kind: "save", desc: "", saveAbility, saveSuccess: "none", conditionsAdd: [condition] });
    const c = { ...cc(), slots: [1, 0], knownSpells: [index] };
    const combat = {
      ...cb(),
      enemies: [{ uid: "enemy", th: "Target", hp: 10, hpNow: 10, ac: 12, sv: { dex: -100, cha: -100, wis: -100 }, conditions: [] }],
    };

    const out = await castSRDSpell(index, 1, c, combat, [], deps, "enemy");
    expect(out.cb.enemies[0].conditions).toContain(condition);
  });
});
