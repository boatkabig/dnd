/**
 * SRD client + normalizers for dnd5eapi.co data.
 *
 * All functions hit /api/srd (the server-side proxy). Results are cached in
 * memory for the session. Normalizers convert raw SRD JSON into the shapes the
 * engine wants to consume.
 */

/* ----------------- types ----------------- */
export interface SRDListItem {
  index: string;
  name: string;
  url: string;
}

export interface SRDListResponse {
  count: number;
  results: SRDListItem[];
}

export interface NormalizedSpell {
  index: string;
  name: string;
  level: number;
  school: string;
  casting_time: string;
  range: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  components: string[];
  material?: string;
  desc: string;
  higher_level?: string;
  classes: string[];
  subclasses: string[];
  // Combat mechanics (derived):
  kind: "attack" | "save" | "auto" | "heal" | "buff" | "utility";
  damage?: string;          // dice formula at the chosen slot/char level
  damageType?: string;
  damageScaling?: "slot" | "character" | "none"; // slot = damage_at_slot_level, character = cantrip scaling
  saveAbility?: string;     // "dex" | "con" | "wis" | "str" | "int" | "cha"
  saveSuccess?: "half" | "none";
  heal?: string;
  aoeType?: string;         // "sphere" | "cone" | "cylinder" | "line" | "cube"
  aoeSize?: number;
  attackType?: "ranged" | "melee";
  conditionsAdd?: string[]; // conditions applied on hit/fail
  bonusAction?: boolean;
  isCantrip: boolean;
}

export interface NormalizedMonster {
  index: string;
  th: string;            // display name (engine compat)
  name: string;
  ac: number;
  hp: number;
  atk: number;           // primary attack bonus
  dmg: string;           // primary damage formula
  init: number;
  xp: number;
  cr: string;
  sv: { dex: number; con: number; wis: number; str: number; int: number; cha: number };
  srd: boolean;
  // Multi-attack & special abilities (parsed into engine-friendly format)
  attacks: { name: string; atk: number; dmg: string; dmgType?: string }[];
  specialAbilities?: { name: string; desc: string }[];
  legendaryActions?: { name: string; desc: string }[];
  actions?: { name: string; desc: string }[];
  size?: string;
  type?: string;
  alignment?: string;
  speed?: string;
  senses?: string;
  languages?: string;
  // === NEW: Damage/condition immunities, proficiencies, etc. ===
  damageResistances?: string[];
  damageImmunities?: string[];
  damageVulnerabilities?: string[];
  conditionImmunities?: string[];
  image?: string;
  hitDice?: string;
  subtype?: string;
  reactions?: { name: string; desc: string }[];
  proficiencyBonus?: number;
  skillProficiencies?: { name: string; value: number }[];
}

export interface NormalizedEquipment {
  index: string;
  name: string;
  equipmentCategory: string;
  cost: { quantity: number; unit: string };
  weight: number;
  desc?: string;
  // Weapon-specific
  weaponCategory?: string;
  damage?: { damage_dice: string; damage_type: string };
  range?: { normal: number; long?: number };
  properties?: string[];
  // Armor-specific
  armorCategory?: string;
  armorClass?: { base: number; dexBonus: boolean; maxBonus?: number };
  strMinimum?: number;
  stealthDisadvantage?: boolean;
  // === NEW: Versatile / special / pack contents ===
  twoHandedDamage?: { damage_dice: string; damage_type: string };
  special?: string[];
  contents?: Array<{ item: string; quantity: number }>;
}

export interface NormalizedCondition {
  index: string;
  name: string;
  desc: string[];
}

export interface NormalizedClass {
  index: string;
  name: string;
  hitDie: number;
  proficiencies: string[];
  savingThrows: string[];
  startingEquipment: string;
  classLevels: string;
  spellcasting?: string;
  subclasses: string[];
}

export interface NormalizedRace {
  index: string;
  name: string;
  speed: number;
  abilityBonuses: { name: string; bonus: number }[];
  size: string;
  startingProficiencies: string[];
  languages: string[];
  traits: string[];
}

/* ----------------- caching ----------------- */
const cache = new Map<string, any>();
const listCache = new Map<string, SRDListResponse>();

async function fetchSRD(path: string): Promise<any> {
  if (cache.has(path)) return cache.get(path);
  const r = await fetch(`/api/srd?${path}`);
  if (!r.ok) return null;
  const data = await r.json();
  if (data && !data.error) cache.set(path, data);
  return data;
}

/* ----------------- lists ----------------- */
export async function srdListSpells(spellClass?: string, spellLevel?: number): Promise<SRDListResponse> {
  const params = new URLSearchParams({ list: "spells" });
  if (spellClass) params.set("spellClass", spellClass);
  if (spellLevel !== undefined) params.set("spellLevel", String(spellLevel));
  const key = params.toString();
  if (listCache.has(key)) return listCache.get(key)!;
  const data = await fetchSRD(key);
  if (data) listCache.set(key, data);
  return data || { count: 0, results: [] };
}

export async function srdListMonsters(): Promise<SRDListResponse> {
  if (listCache.has("list=monsters")) return listCache.get("list=monsters")!;
  const data = await fetchSRD("list=monsters");
  if (data) listCache.set("list=monsters", data);
  return data || { count: 0, results: [] };
}

export async function srdListEquipment(): Promise<SRDListResponse> {
  if (listCache.has("list=equipment")) return listCache.get("list=equipment")!;
  const data = await fetchSRD("list=equipment");
  if (data) listCache.set("list=equipment", data);
  return data || { count: 0, results: [] };
}

export async function srdListMagicItems(): Promise<SRDListResponse> {
  if (listCache.has("list=magic-items")) return listCache.get("list=magic-items")!;
  const data = await fetchSRD("list=magic-items");
  if (data) listCache.set("list=magic-items", data);
  return data || { count: 0, results: [] };
}

export async function srdListConditions(): Promise<SRDListResponse> {
  if (listCache.has("list=conditions")) return listCache.get("list=conditions")!;
  const data = await fetchSRD("list=conditions");
  if (data) listCache.set("list=conditions", data);
  return data || { count: 0, results: [] };
}

export async function srdListClasses(): Promise<SRDListResponse> {
  if (listCache.has("list=classes")) return listCache.get("list=classes")!;
  const data = await fetchSRD("list=classes");
  if (data) listCache.set("list=classes", data);
  return data || { count: 0, results: [] };
}

export async function srdListRaces(): Promise<SRDListResponse> {
  if (listCache.has("list=races")) return listCache.get("list=races")!;
  const data = await fetchSRD("list=races");
  if (data) listCache.set("list=races", data);
  return data || { count: 0, results: [] };
}

/* ----------------- detail fetchers + normalizers ----------------- */
const ABILITY_MAP: Record<string, string> = {
  strength: "str", dexterity: "dex", constitution: "con",
  intelligence: "int", wisdom: "wis", charisma: "cha",
};

export function normalizeSpell(m: any, slotLevel?: number, charLevel = 1): NormalizedSpell {
  const damage = m.damage || {};
  const heal = m.heal_at_slot_level || {};
  const hasDamage = !!damage.damage_type && (damage.damage_at_slot_level || damage.damage_at_character_level);
  const hasHeal = !!heal && Object.keys(heal).length > 0;
  const hasSave = !!m.save;
  const hasAttack = !!m.attack_type;
  const isAuto = hasDamage && !hasSave && !hasAttack; // e.g. Magic Missile (auto-hit, no save)
  const concentration = !!m.concentration;
  const bonusAction = (m.casting_time || "").toLowerCase().includes("bonus action");

  // Determine damage formula
  let dmgFormula: string | undefined;
  let damageScaling: "slot" | "character" | "none" = "none";
  if (damage.damage_at_slot_level && slotLevel) {
    // Pick the highest level ≤ slotLevel
    const levels = Object.keys(damage.damage_at_slot_level).map(Number).sort((a, b) => a - b);
    const best = levels.filter((l) => l <= slotLevel).pop() || levels[0];
    dmgFormula = damage.damage_at_slot_level[best];
    damageScaling = "slot";
  } else if (damage.damage_at_character_level) {
    const levels = Object.keys(damage.damage_at_character_level).map(Number).sort((a, b) => a - b);
    const best = levels.filter((l) => l <= charLevel).pop() || levels[0];
    dmgFormula = damage.damage_at_character_level[best];
    damageScaling = "character";
  }

  // Determine heal formula
  let healFormula: string | undefined;
  if (hasHeal && slotLevel) {
    const levels = Object.keys(heal).map(Number).sort((a, b) => a - b);
    const best = levels.filter((l) => l <= slotLevel).pop() || levels[0];
    healFormula = heal[best];
  }

  // D&D 2024 buff: healing spells were buffed (~doubled) vs 5e.
  // Source: dnd2024.wikidot.com spell text mirrors the 2024 PHB.
  //   - Healing Word: 1d4 → 2d4 (upcast +1d4 → +2d4)
  //   - Mass Healing Word: 1d4 → 2d4 per creature (upcast unchanged)
  //   - Cure Wounds: 1d8 → 2d8 (upcast +1d8 → +2d8)
  // We override the heal formula for these spells when SRD returns the old 5e values.
  const spellIndexLower = (m.index || "").toLowerCase();
  const HEALING_2024_OVERRIDES: Record<string, { base: string; perSlot: string; cantripBase?: string }> = {
    "healing-word":     { base: "2d4", perSlot: "2d4" },     // 5e 1d4 → 2024 2d4
    "mass-healing-word":{ base: "2d4", perSlot: "1d4" },     // 5e 1d4 → 2024 2d4 (upcast same)
    "cure-wounds":      { base: "2d8", perSlot: "2d8" },     // 5e 1d8 → 2024 2d8
    "mass-cure-wounds": { base: "2d8", perSlot: "1d8" },     // 5e 1d8 → 2024 2d8 (upcast same)
  };
  if (HEALING_2024_OVERRIDES[spellIndexLower]) {
    const override = HEALING_2024_OVERRIDES[spellIndexLower];
    if (slotLevel === m.level || !slotLevel) {
      // Base cast
      healFormula = override.base;
    } else if (slotLevel > m.level) {
      // Upcast: base + (slotLevel - spellLevel) * perSlot
      const upcastLevels = slotLevel - m.level;
      healFormula = `${override.base}+${upcastLevels * 1}*${override.perSlot}`.replace("+1*", "+");
      // Simpler: just concat dice — e.g., 2d4 + 2*(2d4) for healing word at slot 3
      const baseCount = parseInt(override.base);
      const baseSize = override.base.match(/d(\d+)/)?.[1] || "4";
      const perSlotCount = parseInt(override.perSlot);
      const perSlotSize = override.perSlot.match(/d(\d+)/)?.[1] || baseSize;
      const totalDice = baseCount + upcastLevels * perSlotCount;
      healFormula = `${totalDice}d${baseSize}`;
      // Use the smaller die size if different (rare)
      void perSlotSize;
    }
  }

  // Determine spell kind
  let kind: NormalizedSpell["kind"] = "utility";
  if (hasHeal) kind = "heal";
  else if (hasAttack && hasDamage) kind = "attack";
  else if (hasSave && hasDamage) kind = "save";
  else if (isAuto) kind = "auto";
  else if (concentration || (m.duration || "").toLowerCase().includes("minute") || (m.duration || "").toLowerCase().includes("hour")) kind = "buff";

  // Conditions applied (parsed from description — basic heuristic for common buff/debuff spells)
  const conditionsAdd: string[] = [];
  const descLower = (m.desc || []).join(" ").toLowerCase();
  const conditionKeywords: Record<string, string[]> = {
    poisoned: ["poisoned"],
    frightened: ["frightened"],
    restrained: ["restrained"],
    blinded: ["blinded"],
    charmed: ["charmed"],
    prone: ["knocked prone", "fall prone"],
  };
  for (const [cond, keywords] of Object.entries(conditionKeywords)) {
    if (keywords.some((kw) => descLower.includes(kw))) conditionsAdd.push(cond);
  }

  return {
    index: m.index,
    name: m.name,
    level: m.level,
    school: m.school?.name || "Unknown",
    casting_time: m.casting_time || "1 action",
    range: m.range || "Self",
    duration: m.duration || "Instantaneous",
    concentration,
    ritual: !!m.ritual,
    components: m.components || [],
    material: m.material,
    desc: Array.isArray(m.desc) ? m.desc.join(" ") : (m.desc || ""),
    higher_level: Array.isArray(m.higher_level) ? m.higher_level.join(" ") : m.higher_level,
    classes: (m.classes || []).map((c: any) => c.name),
    subclasses: (m.subclasses || []).map((s: any) => s.name),
    kind,
    damage: dmgFormula,
    damageType: damage.damage_type?.name,
    damageScaling,
    saveAbility: hasSave ? ABILITY_MAP[(m.save.dc_type?.name || "").toLowerCase()] : undefined,
    saveSuccess: hasSave ? (m.save.dc_success === "half" ? "half" : "none") : undefined,
    heal: healFormula,
    aoeType: m.area_of_effect?.type,
    aoeSize: m.area_of_effect?.size,
    attackType: m.attack_type,
    conditionsAdd: conditionsAdd.length > 0 ? conditionsAdd : undefined,
    bonusAction,
    isCantrip: m.level === 0,
  };
}

export async function fetchSpell(index: string, slotLevel?: number, charLevel = 1): Promise<NormalizedSpell | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  // D1: Check persistent cache + seed spells first (offline-friendly)
  try {
    const { getSpellFromCache, setCachedSpell } = await import("./spellCache");
    const cached = getSpellFromCache(idx);
    if (cached) {
      // Return in legacy format
      return {
        index: cached.index,
        name: cached.name,
        level: cached.level,
        school: cached.school,
        castingTime: cached.castingTime,
        range: cached.range,
        components: [
          ...(cached.components.verbal ? ["V"] : []),
          ...(cached.components.somatic ? ["S"] : []),
          ...(cached.components.material ? ["M"] : []),
        ],
        material: cached.components.materialDesc,
        ritual: cached.ritual,
        duration: cached.duration,
        concentration: cached.concentration,
        desc: cached.desc,
        higherLevel: cached.higherLevel,
        classes: cached.classes,
        kind: cached.attackRoll ? "attack" : (cached as any).saveAbility ? "save" : cached.damage ? "aoe_damage" : "utility",
        damage: cached.damage,
        damageType: cached.damageType,
        saveAbility: (cached as any).saveAbility,
        saveSuccess: (cached as any).saveSuccess,
        aoeType: cached.aoeType,
        aoeSize: cached.aoeSize,
        bonusAction: cached.bonusAction,
        isCantrip: cached.isCantrip,
        heal: cached.damage,
        ...(cached.index.includes("healing-word") || cached.index.includes("cure-wounds") ? {
          heal: cached.index.includes("healing-word") ? "2d4" : "2d8",
          kind: "heal" as const,
        } : {}),
      } as unknown as NormalizedSpell;
    }
  } catch {
    // spellCache import failed (e.g., SSR) — continue to API
  }
  // Try Open5e v2 first (2024 SRD support, richer schema)
  try {
    const { getSpell: open5eGetSpell } = await import("./open5e");
    const open5eSpell = await open5eGetSpell(idx, "2024");
    if (open5eSpell) {
      // D1: Cache the fetched spell for offline use
      try {
        const { setCachedSpell } = await import("./spellCache");
        setCachedSpell(idx, open5eSpell);
      } catch { /* cache failed — continue */ }
      // Convert Open5e NormalizedSpell → legacy NormalizedSpell shape
      return {
        index: open5eSpell.index,
        name: open5eSpell.name,
        level: open5eSpell.level,
        school: open5eSpell.school,
        castingTime: open5eSpell.castingTime,
        range: open5eSpell.range,
        components: [
          ...(open5eSpell.components.verbal ? ["V"] : []),
          ...(open5eSpell.components.somatic ? ["S"] : []),
          ...(open5eSpell.components.material ? ["M"] : []),
        ],
        material: open5eSpell.components.materialDesc,
        ritual: open5eSpell.ritual,
        duration: open5eSpell.duration,
        concentration: open5eSpell.concentration,
        desc: open5eSpell.desc,
        higherLevel: open5eSpell.higherLevel,
        classes: open5eSpell.classes,
        kind: open5eSpell.attackRoll ? "attack" : open5eSpell.saveAbility ? "save" : open5eSpell.damage ? "aoe_damage" : open5eSpell.saveAbility ? "save" : "utility",
        damage: open5eSpell.damage,
        damageType: open5eSpell.damageType,
        saveAbility: open5eSpell.saveAbility,
        // D&D 2024: Save success effect varies by spell — many save spells NEGATE the effect entirely
        // (Hold Person, Charm Person, Sleep, Banishment, etc.) while damage spells usually deal half.
        // Open5e doesn't expose dc_success reliably, so we infer from spell behavior:
        // - If spell has damage → "half" (standard D&D damage-save behavior)
        // - If spell has NO damage but has conditionsAdd (Hold/Charm/etc.) → "none" (negate on success)
        // - Otherwise → "none" (no effect on save)
        saveSuccess: open5eSpell.saveAbility
          ? (open5eSpell.damage ? "half" : "none")
          : undefined,
        aoeType: open5eSpell.aoeType,
        aoeSize: open5eSpell.aoeSize,
        bonusAction: open5eSpell.bonusAction,
        isCantrip: open5eSpell.isCantrip,
        heal: open5eSpell.damage, // for heal spells, damage field holds heal formula
        // Apply D&D 2024 healing spell buff (Healing Word 2d4, Cure Wounds 2d8)
        ...(open5eSpell.index.includes("healing-word") || open5eSpell.index.includes("cure-wounds") ? {
          heal: open5eSpell.index.includes("healing-word") ? "2d4" : "2d8",
          kind: "heal" as const,
        } : {}),
      } as unknown as NormalizedSpell;
    }
  } catch {
    // Fall through to dnd5eapi.co
  }
  // Fallback: dnd5eapi.co (2014 SRD)
  const raw = await fetchSRD(`spell=${encodeURIComponent(idx)}`);
  if (!raw) return null;
  return normalizeSpell(raw, slotLevel, charLevel);
}

export async function fetchMonster(indexRaw: string): Promise<NormalizedMonster | null> {
  const index = String(indexRaw).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`monster=${encodeURIComponent(index)}`);
  if (!m) return null;

  // Parse actions into attack list
  const attacks: { name: string; atk: number; dmg: string; dmgType?: string }[] = [];
  for (const act of m.actions || []) {
    if (act.attack_bonus !== undefined && Array.isArray(act.damage) && act.damage.some((d: any) => d.damage_dice)) {
      const dd = act.damage.find((d: any) => d.damage_dice);
      attacks.push({
        name: act.name,
        atk: act.attack_bonus,
        dmg: String(dd.damage_dice).replace(/\s/g, ""),
        dmgType: dd.damage_type?.name,
      });
    }
  }
  // Legendary actions
  const legendaryActions = (m.legendary_actions || []).map((a: any) => ({ name: a.name, desc: a.desc }));
  const specialAbilities = (m.special_abilities || []).map((a: any) => ({ name: a.name, desc: a.desc }));
  const actions = (m.actions || []).map((a: any) => ({ name: a.name, desc: a.desc }));

  // Save mods: start from ability mod, override with proficiency
  const abilities: any = {
    str: m.strength, dex: m.dexterity, con: m.constitution,
    int: m.intelligence, wis: m.wisdom, cha: m.charisma,
  };
  const sv: any = {};
  for (const k of Object.keys(abilities)) sv[k] = Math.floor(((abilities[k] || 10) - 10) / 2);
  for (const p of m.proficiencies || []) {
    const n = (p.proficiency && p.proficiency.index) || "";
    for (const abil of Object.keys(abilities)) {
      if (n === `saving-throw-${abil}`) sv[abil] = p.value;
    }
  }

  // CR → XP
  const crToXp: Record<string, number> = {
    "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
    "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400, "13": 10000,
    "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
    "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000,
    "28": 120000, "29": 135000, "30": 155000,
  };
  const cr = m.challenge_rating || "0";
  const xp = crToXp[String(cr)] || 50;

  const ac = Array.isArray(m.armor_class) ? ((m.armor_class[0] && m.armor_class[0].value) || 12) : (m.armor_class || 12);
  const primary = attacks[0] || { name: "Attack", atk: 3, dmg: "1d6+1" };

  // === NEW: extract skill proficiencies from the proficiencies array ===
  // Raw shape: [{value: 6, proficiency: {index: "skill-stealth", name: "Skill: Stealth", url: "..."}}]
  // We only keep entries whose proficiency.index starts with "skill-".
  const skillProficiencies: { name: string; value: number }[] = [];
  for (const p of m.proficiencies || []) {
    const profIdx = (p.proficiency && p.proficiency.index) || "";
    if (profIdx.startsWith("skill-")) {
      // Strip "Skill: " prefix from the display name for cleaner UI text.
      const rawName = (p.proficiency && p.proficiency.name) || profIdx.replace(/^skill-/, "");
      const cleanName = rawName.replace(/^Skill:\s*/i, "");
      skillProficiencies.push({ name: cleanName, value: p.value });
    }
  }

  // === NEW: extract condition_immunities as plain index strings ===
  // Raw shape: [{index: "charmed", name: "Charmed", url: "..."}] OR ["charmed"]
  const conditionImmunities: string[] = (m.condition_immunities || []).map((c: any) =>
    typeof c === "string" ? c : (c?.index || c?.name || "")
  ).filter(Boolean);

  // === NEW: normalize reactions (desc may be string or array of strings) ===
  const reactions: { name: string; desc: string }[] = (m.reactions || []).map((r: any) => ({
    name: r.name || "",
    desc: Array.isArray(r.desc) ? r.desc.join(" ") : (r.desc || ""),
  }));

  return {
    index: m.index,
    th: m.name,
    name: m.name,
    ac,
    hp: m.hit_points || 10,
    atk: primary.atk,
    dmg: primary.dmg,
    init: Math.floor(((m.dexterity || 10) - 10) / 2),
    xp,
    cr: String(cr),
    sv,
    srd: true,
    attacks,
    specialAbilities,
    legendaryActions,
    actions,
    size: m.size,
    type: m.type,
    alignment: m.alignment,
    speed: typeof m.speed === "object" ? JSON.stringify(m.speed) : String(m.speed || ""),
    senses: Array.isArray(m.senses) ? m.senses.join(", ") : (m.senses || ""),
    languages: Array.isArray(m.languages) ? m.languages.join(", ") : (m.languages || ""),
    // === NEW fields ===
    damageResistances: Array.isArray(m.damage_resistances) ? [...m.damage_resistances] : undefined,
    damageImmunities: Array.isArray(m.damage_immunities) ? [...m.damage_immunities] : undefined,
    damageVulnerabilities: Array.isArray(m.damage_vulnerabilities) ? [...m.damage_vulnerabilities] : undefined,
    conditionImmunities: conditionImmunities.length > 0 ? conditionImmunities : undefined,
    image: typeof m.image === "string" ? m.image : undefined,
    hitDice: typeof m.hit_dice === "string" ? m.hit_dice : undefined,
    subtype: typeof m.subtype === "string" ? m.subtype : undefined,
    reactions: reactions.length > 0 ? reactions : undefined,
    proficiencyBonus: typeof m.proficiency_bonus === "number" ? m.proficiency_bonus : undefined,
    skillProficiencies: skillProficiencies.length > 0 ? skillProficiencies : undefined,
  };
}

export async function fetchEquipment(index: string): Promise<NormalizedEquipment | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`equipment=${encodeURIComponent(idx)}`);
  if (!m) return null;
  // === NEW: normalize two_handed_damage, special, contents ===
  // - two_handed_damage: {damage_dice: "1d10", damage_type: {index, name, url}} → flatten damage_type
  // - special: array of strings (special weapon rules, e.g. Lance, Net)
  // - contents: array of {item: {index, name, url}, quantity} → flatten to {item: name, quantity}
  const twoHandedDamage = m.two_handed_damage
    ? {
        damage_dice: m.two_handed_damage.damage_dice,
        damage_type: m.two_handed_damage.damage_type?.name || "",
      }
    : undefined;
  const special: string[] | undefined = Array.isArray(m.special) && m.special.length > 0
    ? m.special.map((s: any) => (typeof s === "string" ? s : String(s || "")))
    : undefined;
  const contents: Array<{ item: string; quantity: number }> | undefined =
    Array.isArray(m.contents) && m.contents.length > 0
      ? m.contents.map((c: any) => ({
          item: c.item?.name || c.item?.index || "",
          quantity: typeof c.quantity === "number" ? c.quantity : 1,
        }))
      : undefined;
  return {
    index: m.index,
    name: m.name,
    equipmentCategory: m.equipment_category?.name || "",
    cost: m.cost || { quantity: 0, unit: "gp" },
    weight: m.weight || 0,
    desc: Array.isArray(m.desc) ? m.desc.join(" ") : m.desc,
    weaponCategory: m.weapon_category,
    damage: m.damage ? { damage_dice: m.damage.damage_dice, damage_type: m.damage.damage_type?.name } : undefined,
    range: m.range,
    properties: (m.properties || []).map((p: any) => p.name),
    armorCategory: m.armor_category,
    armorClass: m.armor_class,
    strMinimum: m.str_minimum,
    stealthDisadvantage: m.stealth_disadvantage,
    // === NEW fields ===
    twoHandedDamage,
    special,
    contents,
  };
}

export async function fetchCondition(index: string): Promise<NormalizedCondition | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`condition=${encodeURIComponent(idx)}`);
  if (!m) return null;
  return {
    index: m.index,
    name: m.name,
    desc: m.desc || [],
  };
}

export async function fetchClass(index: string): Promise<NormalizedClass | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`class=${encodeURIComponent(idx)}`);
  if (!m) return null;
  return {
    index: m.index,
    name: m.name,
    hitDie: m.hit_die,
    proficiencies: (m.proficiencies || []).map((p: any) => p.name),
    savingThrows: (m.saving_throws || []).map((s: any) => s.name.toLowerCase()),
    startingEquipment: Array.isArray(m.starting_equipment) ? m.starting_equipment.map((e: any) => `${e.quantity||1}x ${e.equipment?.name||""}`).join(", ") : "",
    classLevels: m.class_levels,
    spellcasting: m.spellcasting?.spellcasting_ability?.name,
    subclasses: (m.subclasses || []).map((s: any) => s.name),
  };
}

export async function fetchRace(index: string): Promise<NormalizedRace | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`race=${encodeURIComponent(idx)}`);
  if (!m) return null;
  return {
    index: m.index,
    name: m.name,
    speed: m.speed,
    abilityBonuses: (m.ability_bonuses || []).map((ab: any) => ({
      name: ab.ability_score?.name || "",
      bonus: ab.bonus,
    })),
    size: m.size,
    startingProficiencies: (m.starting_proficiencies || []).map((p: any) => p.name),
    languages: (m.languages || []).map((l: any) => l.name),
    traits: (m.traits || []).map((t: any) => t.name),
  };
}

/* ----------------- new endpoints (backgrounds, feats, subraces, traits, proficiencies, etc.) ----------------- */

/* ----------------- new endpoints: magic-items, skills, subclasses, rule-sections, class-levels, subclass-levels ----------------- */

export interface NormalizedMagicItem {
  index: string;
  name: string;
  equipment_category: string;
  rarity: string;
  desc: string[];
  weight?: number;
  requires_attunement?: boolean;
  variants?: string[];
  image?: string;
}

export interface NormalizedSkill {
  index: string;
  name: string;
  desc: string[];
  ability: string;
}

export interface NormalizedSubclassDetail {
  index: string;
  name: string;
  class_name: string;
  subclass_flavor: string;
  desc: string[];
  spells?: any[];
}

export interface NormalizedRuleSection {
  index: string;
  name: string;
  desc: string[];
}

export interface ClassLevelData {
  level: number;
  featureNames: string[];
  featureUrls: string[];
  classSpecific?: Record<string, any>;
  spellcasting?: { cantrips_known?: number; spell_slots_level_1?: number; [key: string]: any };
}

export interface SubclassLevelData {
  level: number;
  featureNames: string[];
  featureUrls: string[];
  classSpecific?: Record<string, any>;
}

export async function fetchMagicItem(index: string): Promise<NormalizedMagicItem | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`magic-item=${encodeURIComponent(idx)}`);
  if (!m) return null;
  // Variants: array of strings (named variants) — pass through as-is
  const variants: string[] = Array.isArray(m.variants)
    ? m.variants.map((v: any) => (typeof v === "string" ? v : (v?.name || ""))).filter(Boolean)
    : [];
  // requires_attunement: the SRD API doesn't always expose this as a top-level boolean.
  // Fall back to scanning the description for the "requires attunement" phrase so the
  // field is actually useful (most attunement-required items document it in their desc).
  let requiresAttunement = !!m.requires_attunement;
  if (!requiresAttunement && Array.isArray(m.desc)) {
    requiresAttunement = m.desc.some((line: any) =>
      typeof line === "string" && /requires attunement/i.test(line)
    );
  }
  return {
    index: m.index,
    name: m.name,
    equipment_category: m.equipment_category?.name || "",
    rarity: m.rarity?.name || "",
    desc: Array.isArray(m.desc) ? m.desc : (typeof m.desc === "string" ? [m.desc] : []),
    weight: typeof m.weight === "number" ? m.weight : undefined,
    requires_attunement: requiresAttunement,
    variants: variants.length > 0 ? variants : undefined,
    image: typeof m.image === "string" ? m.image : undefined,
  };
}

export async function fetchSkill(index: string): Promise<NormalizedSkill | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`skill=${encodeURIComponent(idx)}`);
  if (!m) return null;
  // ability_score is {index, name, url} — extract the index ("dex", "str", etc.)
  const ability = m.ability_score?.index || m.ability_score?.name || "";
  return {
    index: m.index,
    name: m.name,
    desc: Array.isArray(m.desc) ? m.desc : (typeof m.desc === "string" ? [m.desc] : []),
    ability,
  };
}

export async function fetchSubclass(index: string): Promise<NormalizedSubclassDetail | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`subclass=${encodeURIComponent(idx)}`);
  if (!m) return null;
  return {
    index: m.index,
    name: m.name,
    class_name: m.class?.name || "",
    subclass_flavor: m.subclass_flavor || "",
    desc: Array.isArray(m.desc) ? m.desc : (typeof m.desc === "string" ? [m.desc] : []),
    spells: Array.isArray(m.spells) ? m.spells : undefined,
  };
}

export async function fetchRuleSection(index: string): Promise<NormalizedRuleSection | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`rule-section=${encodeURIComponent(idx)}`);
  if (!m) return null;
  // The SRD API returns `desc` as a single markdown string for rule-sections.
  // Wrap it in an array to keep the interface consistent with other "desc[]" types.
  const desc: string[] = Array.isArray(m.desc)
    ? m.desc
    : (typeof m.desc === "string" ? [m.desc] : []);
  return {
    index: m.index,
    name: m.name,
    desc,
  };
}

export async function fetchClassLevels(classIndex: string): Promise<ClassLevelData[]> {
  const idx = String(classIndex).toLowerCase().replace(/_/g, "-").trim();
  const raw = await fetchSRD(`class-levels=${encodeURIComponent(idx)}`);
  if (!Array.isArray(raw)) return [];
  return raw.map((lvl: any) => {
    const features = Array.isArray(lvl.features) ? lvl.features : [];
    return {
      level: lvl.level,
      featureNames: features.map((f: any) => f.name || ""),
      featureUrls: features.map((f: any) => f.url || ""),
      classSpecific: lvl.class_specific && typeof lvl.class_specific === "object" ? lvl.class_specific : undefined,
      spellcasting: lvl.spellcasting && typeof lvl.spellcasting === "object" ? lvl.spellcasting : undefined,
    };
  });
}

export async function fetchSubclassLevels(subclassIndex: string): Promise<SubclassLevelData[]> {
  const idx = String(subclassIndex).toLowerCase().replace(/_/g, "-").trim();
  const raw = await fetchSRD(`subclass-levels=${encodeURIComponent(idx)}`);
  if (!Array.isArray(raw)) return [];
  return raw.map((lvl: any) => {
    const features = Array.isArray(lvl.features) ? lvl.features : [];
    // Subclass levels use `subclass_specific` (some subclasses also return class_specific).
    // Prefer subclass_specific; fall back to class_specific for completeness.
    const spec = lvl.subclass_specific ?? lvl.class_specific;
    return {
      level: lvl.level,
      featureNames: features.map((f: any) => f.name || ""),
      featureUrls: features.map((f: any) => f.url || ""),
      classSpecific: spec && typeof spec === "object" ? spec : undefined,
    };
  });
}

/* ----------------- new endpoints (backgrounds, feats, subraces, traits, proficiencies, etc.) ----------------- */

export interface NormalizedBackground {
  index: string;
  name: string;
  skills: string[];
  startingEquipment: string;
  feature: { name: string; desc: string };
}

export async function fetchBackground(index: string): Promise<NormalizedBackground | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`background=${encodeURIComponent(idx)}`);
  if (!m) return null;
  return {
    index: m.index,
    name: m.name,
    skills: (m.skill_proficiencies || []).map((s: any) => s.name || s.index || ""),
    startingEquipment: Array.isArray(m.starting_equipment) ? m.starting_equipment.map((e: any) => `${e.quantity||1}x ${e.equipment?.name||""}`).join(", ") : "",
    feature: m.feature ? { name: m.feature.name || "", desc: Array.isArray(m.feature.desc) ? m.feature.desc.join(" ") : (m.feature.desc || "") } : { name: "", desc: "" },
  };
}

export interface NormalizedFeat {
  index: string;
  name: string;
  desc: string[];
  prerequisite?: string;
}

export async function fetchFeat(index: string): Promise<NormalizedFeat | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`feat=${encodeURIComponent(idx)}`);
  if (!m) return null;
  return {
    index: m.index,
    name: m.name,
    desc: m.desc || [],
    prerequisite: m.prerequisite,
  };
}

export interface NormalizedSubrace {
  index: string;
  name: string;
  desc: string;
  abilityBonuses: { name: string; bonus: number }[];
  startingProficiencies: string[];
  traits: string[];
}

export async function fetchSubrace(index: string): Promise<NormalizedSubrace | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`subrace=${encodeURIComponent(idx)}`);
  if (!m) return null;
  return {
    index: m.index,
    name: m.name,
    desc: Array.isArray(m.desc) ? m.desc.join(" ") : (m.desc || ""),
    abilityBonuses: (m.ability_bonuses || []).map((ab: any) => ({
      name: ab.ability_score?.name || "",
      bonus: ab.bonus,
    })),
    startingProficiencies: (m.starting_proficiencies || []).map((p: any) => p.name),
    traits: (m.traits || []).map((t: any) => t.name),
  };
}

export interface NormalizedTrait {
  index: string;
  name: string;
  desc: string[];
  proficiencies: string[];
}

export async function fetchTrait(index: string): Promise<NormalizedTrait | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`trait=${encodeURIComponent(idx)}`);
  if (!m) return null;
  return {
    index: m.index,
    name: m.name,
    desc: m.desc || [],
    proficiencies: (m.proficiencies || []).map((p: any) => p.name),
  };
}

export interface NormalizedProficiency {
  index: string;
  name: string;
  type: string;
  classes: string[];
  races: string[];
}

export async function fetchProficiency(index: string): Promise<NormalizedProficiency | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`proficiency=${encodeURIComponent(idx)}`);
  if (!m) return null;
  return {
    index: m.index,
    name: m.name,
    type: m.type || "",
    classes: (m.classes || []).map((c: any) => c.name),
    races: (m.races || []).map((r: any) => r.name),
  };
}

export interface NormalizedDamageType {
  index: string;
  name: string;
  desc: string[];
}

export async function fetchDamageType(index: string): Promise<NormalizedDamageType | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`damage-type=${encodeURIComponent(idx)}`);
  if (!m) return null;
  return {
    index: m.index,
    name: m.name,
    desc: m.desc || [],
  };
}

export interface NormalizedMagicSchool {
  index: string;
  name: string;
  desc: string;
}

export async function fetchMagicSchool(index: string): Promise<NormalizedMagicSchool | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`magic-school=${encodeURIComponent(idx)}`);
  if (!m) return null;
  return {
    index: m.index,
    name: m.name,
    desc: Array.isArray(m.desc) ? m.desc.join(" ") : (m.desc || ""),
  };
}

export interface NormalizedLanguage {
  index: string;
  name: string;
  desc: string;
  type: string;
  typical_speakers: string[];
  script: string;
}

export async function fetchLanguage(index: string): Promise<NormalizedLanguage | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`language=${encodeURIComponent(idx)}`);
  if (!m) return null;
  return {
    index: m.index,
    name: m.name,
    desc: Array.isArray(m.desc) ? m.desc.join(" ") : (m.desc || ""),
    type: m.type || "Standard",
    typical_speakers: m.typical_speakers || [],
    script: m.script || "",
  };
}

export interface NormalizedAbilityScore {
  index: string;
  name: string;
  fullName: string;
  desc: string[];
  skills: string[];
}

export async function fetchAbilityScore(index: string): Promise<NormalizedAbilityScore | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`ability-score=${encodeURIComponent(idx)}`);
  if (!m) return null;
  return {
    index: m.index,
    name: m.name,
    fullName: m.full_name || m.name,
    desc: m.desc || [],
    skills: (m.skills || []).map((s: any) => s.name),
  };
}

export interface NormalizedEquipmentCategory {
  index: string;
  name: string;
  equipment: { index: string; name: string }[];
}

export async function fetchEquipmentCategory(index: string): Promise<NormalizedEquipmentCategory | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`equipment-category=${encodeURIComponent(idx)}`);
  if (!m) return null;
  return {
    index: m.index,
    name: m.name,
    equipment: (m.equipment || []).map((e: any) => ({ index: e.index, name: e.name })),
  };
}

export interface NormalizedWeaponProperty {
  index: string;
  name: string;
  desc: string[];
}

export async function fetchWeaponProperty(index: string): Promise<NormalizedWeaponProperty | null> {
  const idx = String(index).toLowerCase().replace(/_/g, "-").trim();
  const m = await fetchSRD(`weapon-property=${encodeURIComponent(idx)}`);
  if (!m) return null;
  return {
    index: m.index,
    name: m.name,
    desc: m.desc || [],
  };
}

/* ----------------- additional list fetchers ----------------- */

export async function srdListBackgrounds(): Promise<SRDListResponse> {
  if (listCache.has("list=backgrounds")) return listCache.get("list=backgrounds")!;
  const data = await fetchSRD("list=backgrounds");
  if (data) listCache.set("list=backgrounds", data);
  return data || { count: 0, results: [] };
}

export async function srdListFeats(): Promise<SRDListResponse> {
  if (listCache.has("list=feats")) return listCache.get("list=feats")!;
  const data = await fetchSRD("list=feats");
  if (data) listCache.set("list=feats", data);
  return data || { count: 0, results: [] };
}

export async function srdListSubraces(): Promise<SRDListResponse> {
  if (listCache.has("list=subraces")) return listCache.get("list=subraces")!;
  const data = await fetchSRD("list=subraces");
  if (data) listCache.set("list=subraces", data);
  return data || { count: 0, results: [] };
}

export async function srdListTraits(): Promise<SRDListResponse> {
  if (listCache.has("list=traits")) return listCache.get("list=traits")!;
  const data = await fetchSRD("list=traits");
  if (data) listCache.set("list=traits", data);
  return data || { count: 0, results: [] };
}

export async function srdListProficiencies(): Promise<SRDListResponse> {
  if (listCache.has("list=proficiencies")) return listCache.get("list=proficiencies")!;
  const data = await fetchSRD("list=proficiencies");
  if (data) listCache.set("list=proficiencies", data);
  return data || { count: 0, results: [] };
}

export async function srdListEquipmentCategories(): Promise<SRDListResponse> {
  if (listCache.has("list=equipment-categories")) return listCache.get("list=equipment-categories")!;
  const data = await fetchSRD("list=equipment-categories");
  if (data) listCache.set("list=equipment-categories", data);
  return data || { count: 0, results: [] };
}

export async function srdListDamageTypes(): Promise<SRDListResponse> {
  if (listCache.has("list=damage-types")) return listCache.get("list=damage-types")!;
  const data = await fetchSRD("list=damage-types");
  if (data) listCache.set("list=damage-types", data);
  return data || { count: 0, results: [] };
}

export async function srdListMagicSchools(): Promise<SRDListResponse> {
  if (listCache.has("list=magic-schools")) return listCache.get("list=magic-schools")!;
  const data = await fetchSRD("list=magic-schools");
  if (data) listCache.set("list=magic-schools", data);
  return data || { count: 0, results: [] };
}

export async function srdListLanguages(): Promise<SRDListResponse> {
  if (listCache.has("list=languages")) return listCache.get("list=languages")!;
  const data = await fetchSRD("list=languages");
  if (data) listCache.set("list=languages", data);
  return data || { count: 0, results: [] };
}

export async function srdListAbilityScores(): Promise<SRDListResponse> {
  if (listCache.has("list=ability-scores")) return listCache.get("list=ability-scores")!;
  const data = await fetchSRD("list=ability-scores");
  if (data) listCache.set("list=ability-scores", data);
  return data || { count: 0, results: [] };
}

export async function srdListWeaponProperties(): Promise<SRDListResponse> {
  if (listCache.has("list=weapon-properties")) return listCache.get("list=weapon-properties")!;
  const data = await fetchSRD("list=weapon-properties");
  if (data) listCache.set("list=weapon-properties", data);
  return data || { count: 0, results: [] };
}

export async function srdListFeatures(): Promise<SRDListResponse> {
  if (listCache.has("list=features")) return listCache.get("list=features")!;
  const data = await fetchSRD("list=features");
  if (data) listCache.set("list=features", data);
  return data || { count: 0, results: [] };
}

/* ----------------- probe ----------------- */
/**
 * Probe the SRD backend. Primary = Open5e v2 (2024 SRD 5.2).
 * If Open5e is down, fall back to dnd5eapi.co (2014 SRD 5.1) so the game
 * is still playable, just without 2024-edition content.
 *
 * Returns true if EITHER backend is reachable.
 */
export async function srdProbe(): Promise<boolean> {
  // Primary: Open5e v2 (2024 SRD)
  try {
    const r = await fetch("/api/open5e?probe=1");
    if (r.ok) {
      const data = await r.json();
      if (data?.ok) return true;
    }
  } catch {
    // ignore — fall through to legacy probe
  }
  // Fallback: dnd5eapi.co (2014 SRD, legacy)
  try {
    const r = await fetch("/api/srd?probe=1");
    if (!r.ok) return false;
    const data = await r.json();
    return !!data.ok;
  } catch {
    return false;
  }
}

