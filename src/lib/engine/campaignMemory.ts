/**
 * Phase 5 — Campaign Memory.
 *
 * A structured, persisted fact store that survives across play sessions so the
 * AI DM can be fed continuity ("you met Sildar in Phandalin; you spared the
 * goblin chief; the Redbrands owe you a favor"). This is the solo-play memory
 * layer that keeps a long campaign coherent between LLM calls.
 *
 * PURE reducer + query API. No Math.random / Date.now — the caller injects
 * ids and timestamps (`at`) so the whole thing is deterministic + testable.
 * The store is a plain serializable object that rides along inside the existing
 * LegacySave (localStorage) — see engineAdapters.saveGame.
 */

export type FactKind =
  | "npc" // a person met
  | "place" // a location discovered
  | "decision" // a choice the player made
  | "quest" // quest given / advanced / resolved
  | "item" // a notable item gained/lost
  | "lore" // world knowledge learned
  | "event"; // a notable happening

export interface CampaignFact {
  id: string;
  kind: FactKind;
  /** short name/title, e.g. "Sildar Hallwinter" or "Cragmaw Cave" */
  name: string;
  /** one-line detail the DM can read back */
  detail: string;
  sessionNumber: number;
  /** injected timestamp (world seconds or epoch ms) — never generated here */
  at: number;
  tags: string[];
  /** relationship/standing hint for NPCs: -3 hostile .. +3 devoted */
  standing?: number;
}

export interface CampaignMemory {
  facts: CampaignFact[];
  sessionNumber: number; // current session (increments each new session)
  version: 1;
}

export function createCampaignMemory(): CampaignMemory {
  return { facts: [], sessionNumber: 1, version: 1 };
}

/** Coerce an unknown/partial persisted value into a valid CampaignMemory. */
export function normalizeCampaignMemory(raw: unknown): CampaignMemory {
  if (!raw || typeof raw !== "object") return createCampaignMemory();
  const r = raw as Partial<CampaignMemory>;
  return {
    facts: Array.isArray(r.facts) ? r.facts.filter(isFact) : [],
    sessionNumber: typeof r.sessionNumber === "number" && r.sessionNumber >= 1 ? r.sessionNumber : 1,
    version: 1,
  };
}

function isFact(f: unknown): f is CampaignFact {
  return (
    !!f &&
    typeof f === "object" &&
    typeof (f as CampaignFact).id === "string" &&
    typeof (f as CampaignFact).kind === "string" &&
    typeof (f as CampaignFact).name === "string"
  );
}

/* ======================================================================
 * REDUCER — append / upsert
 * ====================================================================== */

export interface FactInput {
  id: string;
  kind: FactKind;
  name: string;
  detail?: string;
  at: number;
  tags?: string[];
  standing?: number;
}

/**
 * Append a fact. If a fact with the same `id` already exists it is UPDATED
 * in place (detail/tags/standing refreshed, position preserved) rather than
 * duplicated — so re-recording the same NPC just refreshes them.
 */
export function appendFact(mem: CampaignMemory, input: FactInput): CampaignMemory {
  const fact: CampaignFact = {
    id: input.id,
    kind: input.kind,
    name: input.name,
    detail: input.detail ?? "",
    sessionNumber: mem.sessionNumber,
    at: input.at,
    tags: input.tags ?? [],
    standing: input.standing,
  };
  const idx = mem.facts.findIndex((f) => f.id === fact.id);
  if (idx >= 0) {
    const merged: CampaignFact = {
      ...mem.facts[idx],
      detail: fact.detail || mem.facts[idx].detail,
      tags: dedupe([...mem.facts[idx].tags, ...fact.tags]),
      standing: fact.standing ?? mem.facts[idx].standing,
      at: fact.at,
    };
    const facts = mem.facts.slice();
    facts[idx] = merged;
    return { ...mem, facts };
  }
  return { ...mem, facts: [...mem.facts, fact] };
}

/** Convenience recorders (thin wrappers over appendFact). */
export function recordNpc(
  mem: CampaignMemory,
  npc: { id: string; name: string; detail?: string; at: number; standing?: number },
): CampaignMemory {
  return appendFact(mem, { ...npc, kind: "npc" });
}

export function recordPlace(
  mem: CampaignMemory,
  place: { id: string; name: string; detail?: string; at: number },
): CampaignMemory {
  return appendFact(mem, { ...place, kind: "place" });
}

export function recordDecision(
  mem: CampaignMemory,
  decision: { id: string; name: string; detail?: string; at: number },
): CampaignMemory {
  return appendFact(mem, { ...decision, kind: "decision" });
}

/** Adjust an NPC's standing by a delta, clamped to [-3, +3]. No-op if absent. */
export function adjustStanding(mem: CampaignMemory, npcId: string, delta: number): CampaignMemory {
  const idx = mem.facts.findIndex((f) => f.id === npcId && f.kind === "npc");
  if (idx < 0) return mem;
  const cur = mem.facts[idx].standing ?? 0;
  const next = Math.max(-3, Math.min(3, cur + delta));
  const facts = mem.facts.slice();
  facts[idx] = { ...facts[idx], standing: next };
  return { ...mem, facts };
}

/** Begin a new play session (bumps the session counter). */
export function startNewSession(mem: CampaignMemory): CampaignMemory {
  return { ...mem, sessionNumber: mem.sessionNumber + 1 };
}

/* ======================================================================
 * QUERY
 * ====================================================================== */

export function factsByKind(mem: CampaignMemory, kind: FactKind): CampaignFact[] {
  return mem.facts.filter((f) => f.kind === kind);
}

export function findFact(mem: CampaignMemory, id: string): CampaignFact | undefined {
  return mem.facts.find((f) => f.id === id);
}

export function factsThisSession(mem: CampaignMemory): CampaignFact[] {
  return mem.facts.filter((f) => f.sessionNumber === mem.sessionNumber);
}

const KIND_LABELS: Record<FactKind, string> = {
  npc: "ตัวละคร",
  place: "สถานที่",
  decision: "การตัดสินใจ",
  quest: "เควสต์",
  item: "ไอเทม",
  lore: "เรื่องราว",
  event: "เหตุการณ์",
};

const STANDING_LABELS: Record<number, string> = {
  [-3]: "เป็นศัตรู",
  [-2]: "ไม่พอใจ",
  [-1]: "ระแวง",
  0: "เป็นกลาง",
  1: "เป็นมิตร",
  2: "ไว้ใจ",
  3: "ภักดี",
};

/**
 * Produce a compact continuity brief for the AI DM. Groups facts by kind and
 * caps each group so the prompt stays small. Deterministic ordering.
 * @param maxPerKind how many facts to include per category (default 6)
 */
export function summarizeMemory(mem: CampaignMemory, maxPerKind = 6): string {
  if (mem.facts.length === 0) return "";
  const order: FactKind[] = ["quest", "npc", "place", "decision", "event", "item", "lore"];
  const lines: string[] = [];
  for (const kind of order) {
    const items = factsByKind(mem, kind).slice(-maxPerKind);
    if (items.length === 0) continue;
    const rendered = items
      .map((f) => {
        const standing =
          f.kind === "npc" && typeof f.standing === "number"
            ? ` [${STANDING_LABELS[f.standing] ?? ""}]`
            : "";
        return `${f.name}${f.detail ? ` — ${f.detail}` : ""}${standing}`;
      })
      .join("; ");
    lines.push(`${KIND_LABELS[kind]}: ${rendered}`);
  }
  return lines.join("\n");
}

/* ======================================================================
 * HELPERS
 * ====================================================================== */

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
