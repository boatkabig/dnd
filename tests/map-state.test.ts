import { describe, it, expect } from "vitest";
import { emptyMap, applyMapUpdate, applyWorldMap } from "../src/lib/mapState";

/**
 * Fog-of-war world-map engine. All three transforms are pure and must return a
 * NEW map (never mutate the input) and surface log lines via the pushEntry callback.
 */
describe("emptyMap", () => {
  it("returns a blank graph", () => {
    expect(emptyMap()).toEqual({ nodes: {}, edges: [], current: null });
  });
});

describe("applyMapUpdate", () => {
  it("returns mp unchanged when there is no update", () => {
    const mp = { nodes: { a: { name: "A", type: "town", x: 0, y: 0 } }, edges: [], current: "a" };
    expect(applyMapUpdate(null, mp)).toBe(mp);
  });

  it("adds a new location positioned by direction from current, and logs it", () => {
    const mp = { nodes: { town: { name: "Town", type: "town", x: 0, y: 0 } }, edges: [] as [string, string][], current: "town" };
    const logs: string[] = [];
    const out = applyMapUpdate({ add_location: { id: "inn", name: "Inn", type: "building", dir: "e" } }, mp, (t) => logs.push(t));
    // 'e' = [1,0] → placed at x+1
    expect(out.nodes.inn).toMatchObject({ name: "Inn", type: "building", x: 1, y: 0 });
    expect(out.edges).toContainEqual(["town", "inn"]);
    expect(logs.some((l) => l.includes("Inn"))).toBe(true);
    // input not mutated
    expect((mp.nodes as Record<string, unknown>).inn).toBeUndefined();
  });

  it("falls back type to 'place' for an unknown icon type", () => {
    const mp = { nodes: { town: { name: "Town", type: "town", x: 0, y: 0 } }, edges: [] as [string, string][], current: "town" };
    const out = applyMapUpdate({ add_location: { id: "weird", name: "W", type: "not_a_real_type", dir: "n" } }, mp);
    expect(out.nodes.weird.type).toBe("place");
  });

  it("connect adds an edge between two existing nodes without duplicating", () => {
    const mp = { nodes: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, edges: [] as [string, string][], current: "a" };
    const out1 = applyMapUpdate({ connect: ["a", "b"] }, mp);
    expect(out1.edges).toContainEqual(["a", "b"]);
    const out2 = applyMapUpdate({ connect: ["b", "a"] }, out1);
    expect(out2.edges.length).toBe(1); // reverse pair recognized as existing
  });

  it("move_to updates current only for a known node", () => {
    const mp = { nodes: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, edges: [] as [string, string][], current: "a" };
    expect(applyMapUpdate({ move_to: "b" }, mp).current).toBe("b");
    expect(applyMapUpdate({ move_to: "ghost" }, mp).current).toBe("a");
  });
});

describe("applyWorldMap", () => {
  it("lays out a world, sets current to the town (visited), fogs the rest, and logs a count", () => {
    const logs: string[] = [];
    const world = [
      { id: "phandalin", name: "Phandalin", type: "town", from: null, dir: "n" },
      { id: "inn", name: "Inn", type: "building", from: "phandalin", dir: "e" },
      { id: "cave", name: "Cave", type: "dungeon", from: "phandalin", dir: "w" },
    ];
    const out = applyWorldMap(world, null, (t) => logs.push(t));
    expect(Object.keys(out.nodes)).toEqual(["phandalin", "inn", "cave"]);
    expect(out.current).toBe("phandalin");
    expect(out.nodes.phandalin.visited).toBe(true);   // starting town discovered
    expect(out.nodes.inn.visited).toBe(false);          // fog of war
    expect(out.nodes.cave.visited).toBe(false);
    expect(logs.some((l) => l.includes("World map generated"))).toBe(true);
  });

  it("returns mp untouched for an empty/invalid world array", () => {
    const mp = { nodes: {}, edges: [], current: null };
    expect(applyWorldMap([], mp)).toBe(mp);
    // @ts-expect-error — exercising the defensive guard
    expect(applyWorldMap(null, mp)).toBe(mp);
  });
});
