/**
 * Task #16 — Session Zero.
 *
 * A structured, persisted "campaign charter" the solo player fills in BEFORE the
 * campaign begins: the tone/genre, safety tools (lines & veils, X-card), how the
 * three pillars (combat / exploration / social) are weighted, and the starting
 * situation (location + hook + one bond NPC).
 *
 * PURE builder + query API. No Math.random / Date.now — every function is a pure
 * transform over a plain, serializable config so the whole thing is deterministic
 * and unit-testable. The config rides along inside the existing LegacySave
 * (localStorage) exactly like campaignMemory, and `summarizeSessionZero()` feeds
 * a compact Thai directive block into the DM system prompt — mirroring how
 * `campaignMemory.summarizeMemory` is fed in via buildSystemPrompt.
 */

/* ======================================================================
 * MODEL
 * ====================================================================== */

/** Overall genre/tone the DM should lean into. */
export type CampaignTone = "dark-fantasy" | "heroic" | "mystery" | "horror";

export const TONE_ORDER: CampaignTone[] = [
  "dark-fantasy",
  "heroic",
  "mystery",
  "horror",
];

/** Safety tools: content the player never wants (lines) or wants faded to
 *  black (veils), plus an X-card flag the DM must honor mid-scene. */
export interface SafetyTools {
  /** Hard "no" content — must never appear on-screen. */
  lines: string[];
  /** "Fade to black" content — may exist, never depicted. */
  veils: string[];
  /** X-card active: player may pull the ripcord to cut any scene. */
  xCard: boolean;
}

/** How much each of the three D&D pillars is weighted, 0–100 each. */
export interface PillarWeights {
  combat: number;
  exploration: number;
  social: number;
}

/** One bond NPC the PC starts connected to. */
export interface BondNpc {
  name: string;
  /** the PC's relationship to them, e.g. "พี่ชายที่หายสาบสูญ" */
  relationship: string;
}

/** Where/why the campaign opens. */
export interface StartingSituation {
  /** starting location name, e.g. "หมู่บ้านแบล็กมัวร์" */
  location: string;
  /** the opening hook / inciting incident */
  hook: string;
  /** one NPC the PC is bonded to at the start */
  bondNpc: BondNpc;
}

export interface SessionZeroConfig {
  tone: CampaignTone;
  safety: SafetyTools;
  pillars: PillarWeights;
  situation: StartingSituation;
  version: 1;
}

const TONE_LABELS: Record<CampaignTone, string> = {
  "dark-fantasy": "แฟนตาซีมืดหม่น (dark fantasy) — โลกอันตราย ศีลธรรมสีเทา ความหวังริบหรี่",
  heroic: "วีรบุรุษ (heroic) — การผจญภัยสดใส ความกล้าหาญ ชัยชนะเหนือความชั่ว",
  mystery: "ปริศนา (mystery) — เบาะแส การสืบสวน ความจริงที่ซ่อนเร้น หักมุม",
  horror: "สยองขวัญ (horror) — ความกลัว บรรยากาศกดดัน ภัยที่เกินจะต้านทาน",
};

/** Short Thai tone label for compact UI/summary use. */
export const TONE_SHORT_LABELS: Record<CampaignTone, string> = {
  "dark-fantasy": "แฟนตาซีมืดหม่น",
  heroic: "วีรบุรุษ",
  mystery: "ปริศนา",
  horror: "สยองขวัญ",
};

/* ======================================================================
 * DEFAULTS + NORMALIZE
 * ====================================================================== */

/** A sensible default charter so a player who skips Session Zero still gets a
 *  coherent config (used to keep the pre-campaign step non-blocking). */
export function createDefaultSessionZero(): SessionZeroConfig {
  return {
    tone: "dark-fantasy",
    safety: { lines: [], veils: [], xCard: true },
    pillars: { combat: 50, exploration: 50, social: 50 },
    situation: { location: "", hook: "", bondNpc: { name: "", relationship: "" } },
    version: 1,
  };
}

function clampWeight(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function cleanStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    if (typeof s !== "string") continue;
    const v = s.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function str(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/** Coerce an unknown/partial persisted value into a valid SessionZeroConfig. */
export function normalizeSessionZero(raw: unknown): SessionZeroConfig {
  if (!raw || typeof raw !== "object") return createDefaultSessionZero();
  const r = raw as Partial<SessionZeroConfig>;
  const tone: CampaignTone =
    typeof r.tone === "string" && TONE_ORDER.includes(r.tone as CampaignTone)
      ? (r.tone as CampaignTone)
      : "dark-fantasy";
  const safetyRaw = (r.safety ?? {}) as Partial<SafetyTools>;
  const pillarsRaw = (r.pillars ?? {}) as Partial<PillarWeights>;
  const situationRaw = (r.situation ?? {}) as Partial<StartingSituation>;
  const bondRaw = (situationRaw.bondNpc ?? {}) as Partial<BondNpc>;
  return {
    tone,
    safety: {
      lines: cleanStrings(safetyRaw.lines),
      veils: cleanStrings(safetyRaw.veils),
      xCard: safetyRaw.xCard !== false, // default on
    },
    pillars: {
      combat: clampWeight(pillarsRaw.combat),
      exploration: clampWeight(pillarsRaw.exploration),
      social: clampWeight(pillarsRaw.social),
    },
    situation: {
      location: str(situationRaw.location),
      hook: str(situationRaw.hook),
      bondNpc: { name: str(bondRaw.name), relationship: str(bondRaw.relationship) },
    },
    version: 1,
  };
}

/* ======================================================================
 * BUILDER — immutable transforms (each returns a new config)
 * ====================================================================== */

export function setTone(cfg: SessionZeroConfig, tone: CampaignTone): SessionZeroConfig {
  return { ...cfg, tone };
}

export function setPillars(cfg: SessionZeroConfig, pillars: Partial<PillarWeights>): SessionZeroConfig {
  return {
    ...cfg,
    pillars: {
      combat: pillars.combat !== undefined ? clampWeight(pillars.combat) : cfg.pillars.combat,
      exploration:
        pillars.exploration !== undefined ? clampWeight(pillars.exploration) : cfg.pillars.exploration,
      social: pillars.social !== undefined ? clampWeight(pillars.social) : cfg.pillars.social,
    },
  };
}

/** Add a line (hard limit). Trimmed, de-duplicated, no-op on blank. */
export function addLine(cfg: SessionZeroConfig, line: string): SessionZeroConfig {
  const v = line.trim();
  if (!v || cfg.safety.lines.includes(v)) return cfg;
  return { ...cfg, safety: { ...cfg.safety, lines: [...cfg.safety.lines, v] } };
}

/** Add a veil (fade-to-black). Trimmed, de-duplicated, no-op on blank. */
export function addVeil(cfg: SessionZeroConfig, veil: string): SessionZeroConfig {
  const v = veil.trim();
  if (!v || cfg.safety.veils.includes(v)) return cfg;
  return { ...cfg, safety: { ...cfg.safety, veils: [...cfg.safety.veils, v] } };
}

export function removeLine(cfg: SessionZeroConfig, line: string): SessionZeroConfig {
  return { ...cfg, safety: { ...cfg.safety, lines: cfg.safety.lines.filter((l) => l !== line) } };
}

export function removeVeil(cfg: SessionZeroConfig, veil: string): SessionZeroConfig {
  return { ...cfg, safety: { ...cfg.safety, veils: cfg.safety.veils.filter((v) => v !== veil) } };
}

export function setXCard(cfg: SessionZeroConfig, on: boolean): SessionZeroConfig {
  return { ...cfg, safety: { ...cfg.safety, xCard: on } };
}

export function setStartingSituation(
  cfg: SessionZeroConfig,
  situation: Partial<Omit<StartingSituation, "bondNpc">> & { bondNpc?: Partial<BondNpc> },
): SessionZeroConfig {
  return {
    ...cfg,
    situation: {
      location: situation.location !== undefined ? situation.location.trim() : cfg.situation.location,
      hook: situation.hook !== undefined ? situation.hook.trim() : cfg.situation.hook,
      bondNpc: {
        name:
          situation.bondNpc?.name !== undefined
            ? situation.bondNpc.name.trim()
            : cfg.situation.bondNpc.name,
        relationship:
          situation.bondNpc?.relationship !== undefined
            ? situation.bondNpc.relationship.trim()
            : cfg.situation.bondNpc.relationship,
      },
    },
  };
}

/* ======================================================================
 * QUERY
 * ====================================================================== */

/** True when the player has filled in a concrete starting situation
 *  (location + hook) — used to decide whether to seed a starting fact/node. */
export function hasStartingSituation(cfg: SessionZeroConfig): boolean {
  return cfg.situation.location.length > 0 && cfg.situation.hook.length > 0;
}

/** True when this config still equals the untouched default (nothing to inject). */
export function isDefaultSessionZero(cfg: SessionZeroConfig): boolean {
  const d = createDefaultSessionZero();
  return (
    cfg.tone === d.tone &&
    cfg.safety.lines.length === 0 &&
    cfg.safety.veils.length === 0 &&
    cfg.safety.xCard === d.safety.xCard &&
    cfg.pillars.combat === d.pillars.combat &&
    cfg.pillars.exploration === d.pillars.exploration &&
    cfg.pillars.social === d.pillars.social &&
    !hasStartingSituation(cfg) &&
    cfg.situation.bondNpc.name.length === 0
  );
}

/** Normalized pillar percentages that sum to 100 (for display). Falls back to
 *  an even split when every weight is zero. */
export function pillarPercentages(cfg: SessionZeroConfig): PillarWeights {
  const { combat, exploration, social } = cfg.pillars;
  const total = combat + exploration + social;
  if (total <= 0) return { combat: 33, exploration: 33, social: 34 };
  return {
    combat: Math.round((combat / total) * 100),
    exploration: Math.round((exploration / total) * 100),
    social: Math.round((social / total) * 100),
  };
}

/* ======================================================================
 * SUMMARY — compact Thai directive block for the DM system prompt
 * ====================================================================== */

function pillarEmphasis(pct: number): string {
  if (pct >= 45) return "เน้นมาก";
  if (pct >= 30) return "ปานกลาง";
  if (pct >= 15) return "เล็กน้อย";
  return "แทบไม่มี";
}

/**
 * Produce a compact Thai directive block the DM must honor. Returns "" for an
 * untouched default config so buildSystemPrompt can drop it entirely — exactly
 * like summarizeMemory returns "" for an empty store.
 */
export function summarizeSessionZero(cfg: SessionZeroConfig): string {
  if (isDefaultSessionZero(cfg)) return "";
  const lines: string[] = [];

  lines.push(`โทน/แนวแคมเปญ: ${TONE_LABELS[cfg.tone]}`);

  const pct = pillarPercentages(cfg);
  lines.push(
    `น้ำหนักสามเสาหลัก (ปรับสัดส่วนฉาก/เนื้อหาให้สอดคล้อง): ` +
      `การต่อสู้ ${pct.combat}% (${pillarEmphasis(pct.combat)}), ` +
      `การสำรวจ ${pct.exploration}% (${pillarEmphasis(pct.exploration)}), ` +
      `การเข้าสังคม ${pct.social}% (${pillarEmphasis(pct.social)})`,
  );

  if (cfg.safety.lines.length > 0) {
    lines.push(`เส้นต้องห้าม (LINES — ห้ามปรากฏเด็ดขาด): ${cfg.safety.lines.join(", ")}`);
  }
  if (cfg.safety.veils.length > 0) {
    lines.push(`ม่านบัง (VEILS — มีได้แต่ห้ามบรรยายตรง ๆ ให้ตัดฉาก): ${cfg.safety.veils.join(", ")}`);
  }
  if (cfg.safety.xCard) {
    lines.push(`X-card เปิดใช้งาน: ถ้าผู้เล่นขอหยุด/ข้ามฉาก ให้ยุติเนื้อหานั้นทันทีโดยไม่ตั้งคำถาม`);
  }

  if (hasStartingSituation(cfg)) {
    lines.push(`สถานที่เริ่มต้น: ${cfg.situation.location}`);
    lines.push(`Hook เปิดเรื่อง: ${cfg.situation.hook}`);
  }
  if (cfg.situation.bondNpc.name) {
    const rel = cfg.situation.bondNpc.relationship ? ` (${cfg.situation.bondNpc.relationship})` : "";
    lines.push(`NPC ผูกพัน: ${cfg.situation.bondNpc.name}${rel} — ผูกโยงเข้ากับ hook เปิดเรื่อง`);
  }

  return `🎭 SESSION ZERO (กฎบัตรแคมเปญ — ผู้เล่นกำหนดไว้ ต้องเคารพทุกข้อ):\n${lines.join("\n")}`;
}
