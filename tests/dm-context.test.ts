import { describe, it, expect } from "vitest";
import { sanitizeDmHistory } from "../src/lib/dmContext";

/**
 * Guards DM context hygiene: only the MOST RECENT turn's status snapshot should be
 * sent; older frozen "[CURRENT SCENE …][สถานะ HP/gold …]" blobs must be reduced to
 * their durable "Player: <text>" line so the DM isn't fed a stack of stale,
 * contradictory current-state snapshots.
 */
function snapshot(hp: number, playerText: string) {
  return {
    role: "user" as const,
    content:
      `[CURRENT SCENE: Market — อยู่ที่นี่]\n` +
      `[STORY CONTEXT: quest A]\n` +
      `[สถานะ: HP ${hp}/9, gold 15]\n` +
      `Player: ${playerText}`,
  };
}
const assistant = (n: string) => ({ role: "assistant" as const, content: JSON.stringify({ narration: n }) });

describe("sanitizeDmHistory — keep only the latest status snapshot", () => {
  it("strips older snapshots to their Player line, keeps the latest intact", () => {
    const hist = [
      snapshot(9, "ไปตลาด"),
      assistant("คุณเดินไปตลาด"),
      snapshot(5, "ขโมยของ"),        // latest snapshot → must stay full
    ];
    const out = sanitizeDmHistory(hist);

    // Older snapshot reduced to durable tail (no scene/status blob).
    expect(out[0].content).toBe("Player: ไปตลาด");
    expect(out[0].content).not.toContain("CURRENT SCENE");
    expect(out[0].content).not.toContain("สถานะ");
    // Assistant untouched.
    expect(out[1]).toEqual(hist[1]);
    // Latest snapshot keeps its full current-state blob (HP 5).
    expect(out[2].content).toContain("[สถานะ: HP 5/9");
    expect(out[2].content).toContain("Player: ขโมยของ");
  });

  it("is non-destructive — original array and messages are not mutated", () => {
    const hist = [snapshot(9, "a"), assistant("x"), snapshot(8, "b")];
    const before = JSON.parse(JSON.stringify(hist));
    sanitizeDmHistory(hist);
    expect(hist).toEqual(before);
  });

  it("leaves a single snapshot untouched (nothing older to strip)", () => {
    const hist = [snapshot(9, "เริ่ม"), assistant("intro")];
    expect(sanitizeDmHistory(hist)).toEqual(hist);
  });

  it("passes through non-snapshot messages (combat free-actions, results) unchanged", () => {
    const combat = { role: "user" as const, content: "[ระหว่าง COMBAT รอบ 1]\nผู้เล่นทำ free action: ตะโกน" };
    const result = { role: "user" as const, content: "[ผลทอย] stealth check: 19 vs DC 16 → สำเร็จ" };
    const hist = [snapshot(9, "a"), assistant("x"), combat, result, snapshot(4, "b")];
    const out = sanitizeDmHistory(hist);
    expect(out[0].content).toBe("Player: a"); // old snapshot stripped
    expect(out[2]).toEqual(combat);           // combat blob untouched
    expect(out[3]).toEqual(result);           // result untouched
    expect(out[4]).toEqual(hist[4]);          // latest snapshot untouched
  });

  it("handles empty / tiny histories safely", () => {
    expect(sanitizeDmHistory([])).toEqual([]);
    const one = [snapshot(9, "solo")];
    expect(sanitizeDmHistory(one)).toEqual(one);
  });
});
