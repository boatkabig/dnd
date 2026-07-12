import { describe, it, expect, vi, beforeEach } from "vitest";

// resolveDeathSave rolls a d20 internally (rollD20 from characterStats). Mock it so
// each branch is driven deterministically. Only rollD20 is replaced; the rest of
// characterStats (and every other module) stays real.
vi.mock("../src/lib/characterStats", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/characterStats")>();
  return { ...actual, rollD20: vi.fn() };
});

import { resolveDeathSave, type CombatDeps } from "../src/lib/combatResolve";
import { rollD20 } from "../src/lib/characterStats";

const setDie = (die: number) => (rollD20 as any).mockReturnValue({ die, total: die, mod: 0, adv: "none", other: null });

function downed(saves: { s: number; f: number }) {
  return { name: "Sylas", hp: 0, deathSaves: saves, dead: false };
}
function deps(): CombatDeps & { onDeath: ReturnType<typeof vi.fn> } {
  let id = 0;
  return { entrySystem: (t: string) => ({ id: ++id, type: "system", text: t }), nextId: () => ++id, onDeath: vi.fn() };
}

describe("resolveDeathSave", () => {
  beforeEach(() => (rollD20 as any).mockReset());

  it("records a success (die 10-19) without dying", () => {
    setDie(15);
    const d = deps();
    const entries: any[] = [];
    const out = resolveDeathSave(downed({ s: 0, f: 0 }), entries, true, d);
    expect(out.state).toBe("unconscious");
    expect(out.cc.deathSaves.s).toBe(1);
    expect(d.onDeath).not.toHaveBeenCalled();
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it("stabilizes on the 3rd success and stays at 0 HP (D&D 2024: Stable != revived)", () => {
    setDie(15);
    const out = resolveDeathSave(downed({ s: 2, f: 0 }), [], true, deps());
    expect(out.state).toBe("stable");
    expect(out.cc.hp).toBe(0);
  });

  it("dies on the 3rd failure and calls onDeath", () => {
    setDie(5); // 1-9 = failure
    const d = deps();
    const out = resolveDeathSave(downed({ s: 0, f: 2 }), [], false, d);
    expect(out.state).toBe("dead");
    expect(out.cc.dead).toBe(true);
    expect(d.onDeath).toHaveBeenCalledTimes(1);
  });

  it("revives at 1 HP on a nat 20", () => {
    setDie(20);
    const out = resolveDeathSave(downed({ s: 0, f: 0 }), [], true, deps());
    expect(out.state).toBe("revived");
    expect(out.cc.hp).toBe(1);
  });
});
