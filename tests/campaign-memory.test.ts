/**
 * Phase 5 — Campaign memory tests. Pure reducer + query + summary; ids and
 * timestamps are injected so results are deterministic.
 */
import { describe, it, expect } from "vitest";
import {
  createCampaignMemory,
  normalizeCampaignMemory,
  appendFact,
  recordNpc,
  recordPlace,
  recordDecision,
  adjustStanding,
  startNewSession,
  factsByKind,
  findFact,
  factsThisSession,
  summarizeMemory,
} from "../src/lib/engine/campaignMemory";

describe("createCampaignMemory / normalize", () => {
  it("starts empty at session 1", () => {
    const m = createCampaignMemory();
    expect(m.facts).toEqual([]);
    expect(m.sessionNumber).toBe(1);
  });
  it("normalizes garbage into a valid store", () => {
    expect(normalizeCampaignMemory(null).sessionNumber).toBe(1);
    expect(normalizeCampaignMemory({ facts: "nope" }).facts).toEqual([]);
    const good = normalizeCampaignMemory({
      facts: [{ id: "a", kind: "npc", name: "X" }, { junk: true }],
      sessionNumber: 4,
    });
    expect(good.facts).toHaveLength(1);
    expect(good.sessionNumber).toBe(4);
  });
});

describe("appendFact — upsert semantics", () => {
  it("appends new facts", () => {
    let m = createCampaignMemory();
    m = recordNpc(m, { id: "sildar", name: "Sildar", detail: "อัศวินบาดเจ็บ", at: 100 });
    m = recordPlace(m, { id: "phandalin", name: "Phandalin", at: 200 });
    expect(m.facts).toHaveLength(2);
    expect(findFact(m, "sildar")?.kind).toBe("npc");
  });

  it("updates in place on same id (no duplicate), merging tags", () => {
    let m = createCampaignMemory();
    m = appendFact(m, { id: "sildar", kind: "npc", name: "Sildar", at: 1, tags: ["ally"] });
    m = appendFact(m, {
      id: "sildar",
      kind: "npc",
      name: "Sildar",
      detail: "พาไปเมือง",
      at: 2,
      tags: ["quest-giver"],
    });
    expect(m.facts).toHaveLength(1);
    const f = findFact(m, "sildar")!;
    expect(f.detail).toBe("พาไปเมือง");
    expect(f.tags.sort()).toEqual(["ally", "quest-giver"]);
    expect(f.at).toBe(2);
  });

  it("stamps the current session number onto new facts", () => {
    let m = createCampaignMemory();
    m = startNewSession(m); // now session 2
    m = recordDecision(m, { id: "d1", name: "ไว้ชีวิตหัวหน้าก็อบลิน", at: 5 });
    expect(findFact(m, "d1")?.sessionNumber).toBe(2);
    expect(factsThisSession(m)).toHaveLength(1);
  });
});

describe("adjustStanding", () => {
  it("clamps standing to [-3,3] and only affects NPCs", () => {
    let m = createCampaignMemory();
    m = recordNpc(m, { id: "chief", name: "Klarg", at: 1, standing: 0 });
    m = adjustStanding(m, "chief", -5);
    expect(findFact(m, "chief")?.standing).toBe(-3);
    m = adjustStanding(m, "chief", 10);
    expect(findFact(m, "chief")?.standing).toBe(3);
    // no-op on unknown id
    expect(adjustStanding(m, "ghost", 1)).toEqual(m);
  });
});

describe("query + summary", () => {
  it("filters by kind", () => {
    let m = createCampaignMemory();
    m = recordNpc(m, { id: "a", name: "A", at: 1 });
    m = recordNpc(m, { id: "b", name: "B", at: 2 });
    m = recordPlace(m, { id: "c", name: "C", at: 3 });
    expect(factsByKind(m, "npc")).toHaveLength(2);
    expect(factsByKind(m, "place")).toHaveLength(1);
  });

  it("summarizeMemory groups by kind with standing labels for the DM", () => {
    let m = createCampaignMemory();
    m = recordNpc(m, { id: "sildar", name: "Sildar", detail: "อัศวิน", at: 1, standing: 2 });
    m = recordPlace(m, { id: "phandalin", name: "Phandalin", at: 2 });
    const s = summarizeMemory(m);
    expect(s).toContain("ตัวละคร:");
    expect(s).toContain("Sildar");
    expect(s).toContain("ไว้ใจ"); // standing +2 label
    expect(s).toContain("สถานที่:");
    expect(s).toContain("Phandalin");
  });

  it("returns empty string for an empty store and caps per kind", () => {
    expect(summarizeMemory(createCampaignMemory())).toBe("");
    let m = createCampaignMemory();
    for (let i = 0; i < 20; i++) m = recordNpc(m, { id: `n${i}`, name: `N${i}`, at: i });
    const s = summarizeMemory(m, 3);
    // only 3 npc names kept (the last 3)
    expect(s).toContain("N19");
    expect(s).not.toContain("N10");
  });
});
