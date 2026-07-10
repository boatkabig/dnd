/**
 * Domain 35: Content Management
 *
 * จัดการข้อมูล — Import / Homebrew / Version / Validation
 *
 * Sub-systems:
 *  35.1 Content Registry — central catalog of all content types
 *  35.2 Content Importer — load content from JSON (file or URL)
 *  35.3 Homebrew Manager — user-created content override
 *  35.4 Content Validator — schema validation before registration
 *  35.5 Version Tracker — content version + migration
 *  35.6 Content Diff — show changes between versions
 *  35.7 Content Exporter — serialize content for sharing
 *  35.8 Content Pack System — bundled content sets
 *
 * Whereas other domains *use* content (Monsters, Spells, Items),
 * Domain 35 *manages* content — loading, validating, versioning, and
 * enabling homebrew without breaking engine invariants.
 */

/* ======================================================================
 * 35.1 CONTENT REGISTRY
 * ====================================================================== */

export type ContentType =
  | "spell" | "monster" | "item" | "magic_item" | "weapon" | "armor"
  | "feature" | "feat" | "class" | "race" | "subclass" | "subrace"
  | "background" | "condition" | "trap" | "quest" | "npc" | "location"
  | "faction" | "lore" | "encounter_table" | "rule" | "dialogue_tree";

export interface ContentEntry {
  id: string;
  type: ContentType;
  name: string;
  source: "srd" | "homebrew" | "custom" | "third_party";
  version: number;
  data: any; // raw content data, validated by schema
  checksum: string; // for integrity check
  importedAt: number;
  tags?: string[];
  author?: string;
  description?: string;
}

export interface ContentRegistry {
  entries: Record<string, ContentEntry>; // key = `${type}:${id}`
  byType: Record<ContentType, Set<string>>; // type → set of entry keys
}

export function createContentRegistry(): ContentRegistry {
  return {
    entries: {},
    byType: {
      spell: new Set(), monster: new Set(), item: new Set(), magic_item: new Set(),
      weapon: new Set(), armor: new Set(), feature: new Set(), feat: new Set(),
      class: new Set(), race: new Set(), subclass: new Set(), subrace: new Set(),
      background: new Set(), condition: new Set(), trap: new Set(), quest: new Set(),
      npc: new Set(), location: new Set(), faction: new Set(), lore: new Set(),
      encounter_table: new Set(), rule: new Set(), dialogue_tree: new Set(),
    },
  };
}

export function registerContent(reg: ContentRegistry, entry: ContentEntry): ContentRegistry {
  const key = `${entry.type}:${entry.id}`;
  const existing = reg.entries[key];
  // Only override if new version is higher
  if (existing && existing.version >= entry.version) return reg;
  const existingKeys = reg.byType[entry.type] ? Array.from(reg.byType[entry.type] as Set<string>) : [];
  return {
    entries: { ...reg.entries, [key]: entry },
    byType: {
      ...reg.byType,
      [entry.type]: new Set([...existingKeys, key]),
    },
  };
}

export function getContent(reg: ContentRegistry, type: ContentType, id: string): ContentEntry | undefined {
  return reg.entries[`${type}:${id}`];
}

export function listContentByType(reg: ContentRegistry, type: ContentType): ContentEntry[] {
  return Array.from(reg.byType[type] || [])
    .map((key) => reg.entries[key])
    .filter(Boolean);
}

export function searchContent(reg: ContentRegistry, query: string, types?: ContentType[]): ContentEntry[] {
  const q = query.toLowerCase();
  const allTypes: ContentType[] = types || Object.keys(reg.byType) as ContentType[];
  const results: ContentEntry[] = [];
  for (const t of allTypes) {
    const set = reg.byType[t];
    if (!set) continue;
    for (const key of Array.from(set)) {
      const entry = reg.entries[key];
      if (!entry) continue;
      if (entry.name.toLowerCase().includes(q) || entry.id.toLowerCase().includes(q)) {
        results.push(entry);
      }
    }
  }
  return results;
}

/* ======================================================================
 * 35.2 CONTENT IMPORTER
 * ====================================================================== */

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: Array<{ id: string; reason: string }>;
  warnings: string[];
}

export function importContentJSON(reg: ContentRegistry, json: string, source: ContentEntry["source"] = "custom"): { registry: ContentRegistry; result: ImportResult } {
  const result: ImportResult = { success: true, imported: 0, skipped: 0, errors: [], warnings: [] };
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return {
      registry: reg,
      result: { success: false, imported: 0, skipped: 0, errors: [{ id: "root", reason: `Invalid JSON: ${(e as Error).message}` }], warnings: [] },
    };
  }
  // Support both single entry and array
  const entries: any[] = Array.isArray(parsed) ? parsed : [parsed];
  let newReg = reg;
  for (const entry of entries) {
    const validation = validateContentEntry(entry);
    if (!validation.valid) {
      result.errors.push({ id: entry.id || "unknown", reason: validation.reason || "Invalid" });
      result.skipped++;
      continue;
    }
    const contentEntry: ContentEntry = {
      id: entry.id,
      type: entry.type as ContentType,
      name: entry.name,
      source,
      version: entry.version || 1,
      data: entry.data || entry,
      checksum: computeChecksum(entry),
      importedAt: Date.now(),
      tags: entry.tags,
      author: entry.author,
      description: entry.description,
    };
    newReg = registerContent(newReg, contentEntry);
    result.imported++;
  }
  if (result.errors.length > 0) result.success = result.imported > 0;
  return { registry: newReg, result };
}

export async function importContentFromURL(reg: ContentRegistry, url: string, source: ContentEntry["source"] = "custom"): Promise<{ registry: ContentRegistry; result: ImportResult }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        registry: reg,
        result: { success: false, imported: 0, skipped: 0, errors: [{ id: "url", reason: `HTTP ${response.status}` }], warnings: [] },
      };
    }
    const text = await response.text();
    return importContentJSON(reg, text, source);
  } catch (e) {
    return {
      registry: reg,
      result: { success: false, imported: 0, skipped: 0, errors: [{ id: "url", reason: (e as Error).message }], warnings: [] },
    };
  }
}

/* ======================================================================
 * 35.3 HOMEBREW MANAGER
 * ====================================================================== */

export interface HomebrewOverride {
  originalId: string;
  originalType: ContentType;
  homebrewEntry: ContentEntry;
  reason: string;
}

export class HomebrewManager {
  private overrides: Map<string, HomebrewOverride> = new Map();

  addOverride(override: HomebrewOverride): void {
    this.overrides.set(`${override.originalType}:${override.originalId}`, override);
  }

  removeOverride(type: ContentType, id: string): void {
    this.overrides.delete(`${type}:${id}`);
  }

  hasOverride(type: ContentType, id: string): boolean {
    return this.overrides.has(`${type}:${id}`);
  }

  getOverride(type: ContentType, id: string): HomebrewOverride | undefined {
    return this.overrides.get(`${type}:${id}`);
  }

  listAll(): HomebrewOverride[] {
    return Array.from(this.overrides.values());
  }

  // avoid TS2802 — explicit conversion
  private overridesArray(): HomebrewOverride[] {
    const out: HomebrewOverride[] = [];
    this.overrides.forEach((v) => out.push(v));
    return out;
  }

  /** Apply all overrides to a registry, returning a new registry */
  applyTo(reg: ContentRegistry): ContentRegistry {
    let result = reg;
    for (const override of this.overridesArray()) {
      result = registerContent(result, override.homebrewEntry);
    }
    return result;
  }
}

/* ======================================================================
 * 35.4 CONTENT VALIDATOR
 * ====================================================================== */

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  warnings?: string[];
}

const REQUIRED_FIELDS: Record<ContentType, string[]> = {
  spell: ["id", "name", "level", "school"],
  monster: ["id", "name", "hp", "ac", "cr"],
  item: ["id", "name"],
  magic_item: ["id", "name", "rarity"],
  weapon: ["id", "name", "damage", "weight"],
  armor: ["id", "name", "ac_base", "weight"],
  feature: ["id", "name", "source"],
  feat: ["id", "name"],
  class: ["id", "name", "hit_die"],
  race: ["id", "name"],
  subclass: ["id", "name", "parent_class"],
  subrace: ["id", "name", "parent_race"],
  background: ["id", "name"],
  condition: ["id", "name"],
  trap: ["id", "name", "trigger", "effect"],
  quest: ["id", "title", "objectives"],
  npc: ["id", "name"],
  location: ["id", "name"],
  faction: ["id", "name"],
  lore: ["id", "title", "content"],
  encounter_table: ["biome", "entries"],
  rule: ["id", "name"],
  dialogue_tree: ["id", "npc_id", "nodes"],
};

export function validateContentEntry(entry: any): ValidationResult {
  if (!entry || typeof entry !== "object") {
    return { valid: false, reason: "Entry must be an object" };
  }
  if (!entry.type || !REQUIRED_FIELDS[entry.type as ContentType]) {
    return { valid: false, reason: `Unknown or missing content type: ${entry.type}` };
  }
  const required = REQUIRED_FIELDS[entry.type as ContentType];
  const missing = required.filter((f) => entry[f] === undefined || entry[f] === null);
  if (missing.length > 0) {
    return { valid: false, reason: `Missing required fields: ${missing.join(", ")}` };
  }
  const warnings: string[] = [];
  if (!entry.id || typeof entry.id !== "string") {
    return { valid: false, reason: "id must be a non-empty string" };
  }
  if (!entry.name || typeof entry.name !== "string") {
    return { valid: false, reason: "name must be a non-empty string" };
  }
  // Type-specific validation
  if (entry.type === "spell") {
    if (entry.level < 0 || entry.level > 9) {
      warnings.push(`Spell level ${entry.level} is unusual (expected 0-9)`);
    }
  }
  if (entry.type === "monster") {
    if (entry.hp <= 0) warnings.push("Monster HP should be positive");
    if (entry.ac < 1 || entry.ac > 30) warnings.push(`Monster AC ${entry.ac} is unusual`);
  }
  return { valid: true, warnings };
}

export function validateContentBatch(entries: any[]): { valid: any[]; invalid: Array<{ entry: any; reason: string }> } {
  const valid: any[] = [];
  const invalid: Array<{ entry: any; reason: string }> = [];
  for (const entry of entries) {
    const result = validateContentEntry(entry);
    if (result.valid) valid.push(entry);
    else invalid.push({ entry, reason: result.reason || "Unknown" });
  }
  return { valid, invalid };
}

/* ======================================================================
 * 35.5 VERSION TRACKER
 * ====================================================================== */

export interface ContentVersion {
  type: ContentType;
  id: string;
  version: number;
  changelog?: string;
  migratedAt: number;
}

export interface VersionTracker {
  versions: Record<string, ContentVersion>;
  migrations: Record<string, Array<{ fromVersion: number; toVersion: number; apply: (data: any) => any }>>;
}

export function createVersionTracker(): VersionTracker {
  return { versions: {}, migrations: {} };
}

export function recordVersion(tracker: VersionTracker, version: ContentVersion): VersionTracker {
  return {
    ...tracker,
    versions: { ...tracker.versions, [`${version.type}:${version.id}`]: version },
  };
}

export function registerMigration(
  tracker: VersionTracker,
  type: ContentType,
  fromVersion: number,
  toVersion: number,
  applyFn: (data: any) => any,
): VersionTracker {
  const key = `${type}:${fromVersion}->${toVersion}`;
  return {
    ...tracker,
    migrations: { ...tracker.migrations, [key]: [...(tracker.migrations[key] || []), { fromVersion, toVersion, apply: applyFn }] },
  };
}

export function migrateContent(tracker: VersionTracker, entry: ContentEntry, targetVersion: number): ContentEntry {
  if (entry.version >= targetVersion) return entry;
  let currentData = entry.data;
  let currentVersion = entry.version;
  while (currentVersion < targetVersion) {
    const key = `${entry.type}:${currentVersion}->${currentVersion + 1}`;
    const migration = tracker.migrations[key]?.[0];
    if (!migration) break; // no migration path
    currentData = migration.apply(currentData);
    currentVersion++;
  }
  return { ...entry, data: currentData, version: currentVersion };
}

/* ======================================================================
 * 35.6 CONTENT DIFF
 * ====================================================================== */

export interface ContentDiff {
  type: ContentType;
  id: string;
  changes: Array<{ field: string; oldValue: any; newValue: any }>;
  addedFields: string[];
  removedFields: string[];
}

export function diffContent(oldEntry: ContentEntry, newEntry: ContentEntry): ContentDiff {
  const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
  const addedFields: string[] = [];
  const removedFields: string[] = [];
  const oldData = oldEntry.data || {};
  const newData = newEntry.data || {};
  const allFields = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));
  for (const field of allFields) {
    if (!(field in oldData) && field in newData) {
      addedFields.push(field);
    } else if (field in oldData && !(field in newData)) {
      removedFields.push(field);
    } else if (JSON.stringify(oldData[field]) !== JSON.stringify(newData[field])) {
      changes.push({ field, oldValue: oldData[field], newValue: newData[field] });
    }
  }
  return {
    type: oldEntry.type,
    id: oldEntry.id,
    changes,
    addedFields,
    removedFields,
  };
}

/* ======================================================================
 * 35.7 CONTENT EXPORTER
 * ====================================================================== */

export function exportContentEntry(entry: ContentEntry): string {
  return JSON.stringify({
    id: entry.id,
    type: entry.type,
    name: entry.name,
    version: entry.version,
    data: entry.data,
    tags: entry.tags,
    author: entry.author,
    description: entry.description,
  }, null, 2);
}

export function exportContentBatch(entries: ContentEntry[]): string {
  return JSON.stringify(entries.map((e) => ({
    id: e.id,
    type: e.type,
    name: e.name,
    version: e.version,
    data: e.data,
    tags: e.tags,
    author: e.author,
    description: e.description,
  })), null, 2);
}

export function exportByType(reg: ContentRegistry, type: ContentType): string {
  const entries = listContentByType(reg, type);
  return exportContentBatch(entries);
}

/* ======================================================================
 * 35.8 CONTENT PACK SYSTEM
 * ====================================================================== */

export interface ContentPack {
  id: string;
  name: string;
  description: string;
  author: string;
  version: number;
  entries: ContentEntry[];
  dependencies?: Array<{ packId: string; minVersion: number }>;
  conflicts?: string[]; // pack IDs that conflict
  tags?: string[];
}

export function createContentPack(spec: { id: string; name: string; description: string; author: string; version?: number }): ContentPack {
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    author: spec.author,
    version: spec.version || 1,
    entries: [],
  };
}

export function addEntryToPack(pack: ContentPack, entry: ContentEntry): ContentPack {
  return { ...pack, entries: [...pack.entries, entry] };
}

export function exportContentPack(pack: ContentPack): string {
  return JSON.stringify(pack, null, 2);
}

export function importContentPack(reg: ContentRegistry, pack: ContentPack, source: ContentEntry["source"] = "third_party"): { registry: ContentRegistry; result: ImportResult } {
  const json = JSON.stringify(pack.entries.map((e) => ({
    id: e.id,
    type: e.type,
    name: e.name,
    version: e.version,
    data: e.data,
    tags: e.tags,
    author: e.author,
    description: e.description,
  })));
  return importContentJSON(reg, json, source);
}

/* ======================================================================
 * UTILITIES
 * ====================================================================== */

function computeChecksum(data: any): string {
  // Simple hash (for production use a real SHA-256)
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(16);
}

export function verifyChecksum(entry: ContentEntry): boolean {
  return entry.checksum === computeChecksum(entry.data);
}
