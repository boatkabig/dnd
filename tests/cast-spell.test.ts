import { describe, it, expect, vi, beforeEach } from "vitest";

// castSRDSpell fetches the spell from Open5e; mock that so the RNG-free control
// paths (load failure, illegal cast) are deterministic. Damage/heal math uses
// dice and is covered by the Playwright spell e2e instead.
vi.mock("../src/lib/srd", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/srd")>();
  return { ...actual, fetchSpell: vi.fn() };
});

import { castSRDSpell } from "../src/lib/castSpell";
import { fetchSpell } from "../src/lib/srd";
import type { CombatDeps } from "../src/lib/combatResolve";

const deps: CombatDeps = { entrySystem: (t) => ({ id: 1, type: "system", text: t }), nextId: () => 1 };
const cc = () => ({ level: 3, cls: "wizard", slots: [0, 0], knownSpells: [] as string[], conditions: [], abilities: { int: 16 }, buffs: [], hp: 20, maxHp: 20 });
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
});
