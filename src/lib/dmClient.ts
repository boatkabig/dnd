"use client";

/**
 * DM API client — extracted from DnDSolo.tsx (de-monolith refactor).
 *
 * Wraps POST /api/dm: strips stale per-turn snapshots from history
 * (sanitizeDmHistory), tolerates truncated/wrapped JSON, and runs the response
 * through the zod schema (validateDMResponse) so the engine never trusts raw LLM
 * output. Returns validated data plus __validationWarnings for the UI. Moved
 * verbatim — no behavior change.
 */
import { sanitizeDmHistory } from "@/lib/dmContext";
import { validateDMResponse } from "@/lib/dmSchema";

export async function callDM(systemPrompt: string, history: any[]): Promise<{ narration: string; scene?: string | null; requires?: any; start_combat?: any; world_map?: any; map_update?: any; dungeon_enter?: any; dungeon_room_move?: any; dungeon_exit?: any; updates?: any; __validationWarnings?: string[] }> {
  // Send only the CURRENT turn's status snapshot; older frozen HP/gold/quest
  // blobs in history are stripped to their durable "Player:" line so the DM
  // isn't fed a stack of stale, contradictory "current state" snapshots.
  const messages = sanitizeDmHistory(history);
  const response = await fetch("/api/dm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system: systemPrompt, messages }),
  });
  if (!response.ok) {
    let msg = `DM HTTP ${response.status}`;
    try { const err = await response.json(); if (err?.error) msg = err.error; } catch (_) {}
    throw new Error(msg);
  }
  const data = await response.json();
  const text: string = data.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("DM ไม่ได้ตอบเป็น JSON");
  const jsonStr = clean.slice(start, end + 1);

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    // Try to repair: if the JSON was cut off (max_tokens), close any open arrays/objects
    let repaired = jsonStr;
    repaired = repaired.replace(/,\s*$/, "");
    const opens = (repaired.match(/[\[{]/g) || []).length;
    const closes = (repaired.match(/[\]}]/g) || []).length;
    while (opens > closes) {
      repaired += "}";
      const o2 = (repaired.match(/[\[{]/g) || []).length;
      const c2 = (repaired.match(/[\]}]/g) || []).length;
      if (c2 >= o2) break;
    }
    try {
      parsed = JSON.parse(repaired);
    } catch {
      // Last resort: extract just the narration field
      const narrMatch = repaired.match(/"narration"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const sceneMatch = repaired.match(/"scene"\s*:\s*("(?:[^"\\]|\\.)*"|null)/);
      parsed = {
        narration: narrMatch ? narrMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') : "DM ตอบ JSON ไม่สมบูรณ์ ลองพิมพ์ action ใหม่",
        scene: sceneMatch ? (sceneMatch[1] === "null" ? null : sceneMatch[1].slice(1, -1)) : null,
        requires: null,
        start_combat: null,
        world_map: null,
        map_update: null,
        updates: null,
      };
    }
  }

  // === Phase 1: Schema validation (zod) — engine ไม่ trust LLM ===
  const validation = validateDMResponse(parsed);
  if (validation.warnings.length > 0 || validation.errors.length > 0) {
    // Log to console for debugging
    if (validation.errors.length > 0) {
      console.warn("[DM schema validation errors]", validation.errors);
    }
    if (validation.warnings.length > 0) {
      console.warn("[DM schema validation warnings]", validation.warnings);
    }
  }
  // Always return validated data (with __validationWarnings for UI display)
  const result = validation.data!;
  return {
    ...result,
    __validationWarnings: validation.warnings,
  };
}

