import { describe, it, expect } from "vitest";
import { tickBuffs, applyBuffToCharacter } from "../src/lib/buffs";

describe("tickBuffs — end-of-round buff decay", () => {
  it("decrements timed buffs, drops the ones that hit zero, and logs each drop", () => {
    const logs: string[] = [];
    const cc = { buffs: [
      { name: "Bless", duration: 2 },
      { name: "Shield", duration: 1 },   // will expire this tick
    ] };
    const out = tickBuffs(cc, (t) => logs.push(t));
    expect(out.buffs.map((b: any) => [b.name, b.duration])).toEqual([["Bless", 1]]);
    expect(logs).toEqual(["⏳ Buff หมดอายุ: Shield"]);
  });

  it("keeps instant (0) and until-long-rest (-1) buffs untouched", () => {
    const out = tickBuffs({ buffs: [
      { name: "Instant", duration: 0 },
      { name: "MageArmor", duration: -1 },
    ] });
    expect(out.buffs.map((b: any) => [b.name, b.duration])).toEqual([["Instant", 0], ["MageArmor", -1]]);
  });

  it("does not mutate the input character or its buff objects", () => {
    const cc = { buffs: [{ name: "Bless", duration: 2 }] };
    const before = JSON.parse(JSON.stringify(cc));
    tickBuffs(cc);
    expect(cc).toEqual(before);
  });

  it("handles a character with no buffs", () => {
    expect(tickBuffs({}).buffs).toEqual([]);
  });
});

describe("applyBuffToCharacter — (re)apply a buff by name", () => {
  it("adds a new buff", () => {
    const out = applyBuffToCharacter({ name: "Bless", duration: 10 }, { buffs: [] });
    expect(out.buffs).toEqual([{ name: "Bless", duration: 10 }]);
  });

  it("replaces an existing same-named buff (refresh, no duplicate)", () => {
    const out = applyBuffToCharacter({ name: "Bless", duration: 10 }, { buffs: [{ name: "Bless", duration: 1 }, { name: "Haste", duration: 5 }] });
    expect(out.buffs.filter((b: any) => b.name === "Bless")).toEqual([{ name: "Bless", duration: 10 }]);
    expect(out.buffs.find((b: any) => b.name === "Haste")).toEqual({ name: "Haste", duration: 5 });
  });

  it("sets the mageArmor flag for Mage Armor", () => {
    const out = applyBuffToCharacter({ name: "Mage Armor", duration: -1 }, { buffs: [] });
    expect(out.mageArmor).toBe(true);
  });

  it("does not mutate the input character", () => {
    const cc = { buffs: [{ name: "Haste", duration: 5 }] };
    const before = JSON.parse(JSON.stringify(cc));
    applyBuffToCharacter({ name: "Bless", duration: 3 }, cc);
    expect(cc).toEqual(before);
  });
});
