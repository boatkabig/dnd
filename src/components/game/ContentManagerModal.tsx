"use client";

/**
 * Content Manager modal (Domain 35) — extracted from DnDSolo.tsx (de-monolith).
 *
 * Import / export / browse homebrew content. The parent owns the content-registry
 * slice of state (registry + the import/export text + filter + status message);
 * this component renders the UI and drives the pure content-engine functions
 * directly. Logic + JSX moved verbatim from the former inline block.
 */
import React from "react";
import { importContentJSON, exportByType, type ContentRegistry, type ContentType } from "@/lib/content";

export interface ContentManagerModalProps {
  open: boolean;
  onClose: () => void;
  registry: ContentRegistry;
  setRegistry: (r: ContentRegistry) => void;
  importText: string;
  setImportText: (v: string) => void;
  importMsg: string;
  setImportMsg: (v: string) => void;
  filterType: ContentType | "all";
  setFilterType: (v: ContentType | "all") => void;
  exportText: string;
  setExportText: (v: string) => void;
}

export default function ContentManagerModal({
  open, onClose, registry, setRegistry, importText, setImportText,
  importMsg, setImportMsg, filterType, setFilterType, exportText, setExportText,
}: ContentManagerModalProps) {
  if (!open) return null;
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
          <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>📦 Content Manager (Domain 35)</span>
          <button className="btn" style={{ padding: "4px 12px" }} onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>
          {/* Stats */}
          <div style={{ marginBottom: 14, padding: 10, background: "#1B1530", borderRadius: 8 }}>
            <div className="sec-label">📊 Registry Stats</div>
            <div style={{ fontSize: 12, color: "#C9BFE0", marginTop: 4 }}>
              Total entries: <b style={{ color: "#E0A83E" }}>{Object.keys(registry.entries).length}</b>
              {" · "}Homebrew content: <b style={{ color: "#7FA85C" }}>{Object.values(registry.entries).filter(e => e.source === "homebrew" || e.source === "custom").length}</b>
            </div>
          </div>

          {/* Import section */}
          <div style={{ marginBottom: 14 }}>
            <div className="sec-label">📥 Import Homebrew (JSON)</div>
            <div style={{ fontSize: 11, color: "#9C92B8", marginBottom: 6 }}>
              Paste JSON content below — supports spells, monsters, items, NPCs, locations, etc.
              Each entry needs: id, type, name, and type-specific required fields.
            </div>
            <textarea
              className="input-main"
              style={{ width: "100%", minHeight: 120, fontFamily: "monospace", fontSize: 11, resize: "vertical" }}
              placeholder={`{\n  "id": "fireball_custom",\n  "type": "spell",\n  "name": "Fireball Plus",\n  "level": 3,\n  "school": "evocation",\n  "data": { "damage": "10d6", "save": "dex" }\n}`}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button
                className="btn btn-gold"
                onClick={() => {
                  try {
                    const { registry: next, result } = importContentJSON(registry, importText, "homebrew");
                    setRegistry(next);
                    setImportMsg(`✅ Imported ${result.imported} entries${result.errors.length > 0 ? `, ${result.skipped} skipped` : ""}`);
                  } catch (e: any) {
                    setImportMsg(`❌ Import failed: ${e.message}`);
                  }
                }}
              >
                📥 Import
              </button>
              <button
                className="btn"
                onClick={() => {
                  // Load sample homebrew spell as example
                  const sample = {
                    id: "thunderclap_enhanced",
                    type: "spell",
                    name: "Thunderclap Enhanced",
                    level: 0,
                    school: "evocation",
                    data: { damage: "1d6+con_mod", damage_type: "thunder", save: "con", aoe: { type: "sphere", size: 5 } },
                    description: "Homebrew cantrip — thunder damage in 5ft radius",
                  };
                  setImportText(JSON.stringify(sample, null, 2));
                  setImportMsg("Loaded sample homebrew — click Import to register");
                }}
              >
                📋 Load Sample
              </button>
              <button className="btn" onClick={() => { setImportText(""); setImportMsg(""); }}>Clear</button>
            </div>
            {importMsg && (
              <div style={{ fontSize: 12, color: importMsg.startsWith("✅") ? "#7FA85C" : "#C74B44", marginTop: 6 }}>
                {importMsg}
              </div>
            )}
          </div>

          {/* Export section */}
          <div style={{ marginBottom: 14 }}>
            <div className="sec-label">📤 Export Content</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
              <select
                className="input-main"
                style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as ContentType | "all")}
              >
                <option value="all">All types</option>
                <option value="spell">Spells</option>
                <option value="monster">Monsters</option>
                <option value="item">Items</option>
                <option value="magic_item">Magic Items</option>
                <option value="npc">NPCs</option>
                <option value="location">Locations</option>
                <option value="quest">Quests</option>
              </select>
              <button
                className="btn"
                onClick={() => {
                  if (filterType === "all") {
                    const all = Object.values(registry.entries);
                    setExportText(JSON.stringify(all, null, 2));
                  } else {
                    setExportText(exportByType(registry, filterType));
                  }
                }}
              >
                📤 Export
              </button>
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard?.writeText(exportText);
                  setImportMsg("📋 Copied to clipboard");
                }}
                disabled={!exportText}
              >
                📋 Copy
              </button>
            </div>
            {exportText && (
              <textarea
                className="input-main"
                style={{ width: "100%", minHeight: 120, fontFamily: "monospace", fontSize: 11, resize: "vertical" }}
                value={exportText}
                readOnly
              />
            )}
          </div>

          {/* Browse registry */}
          <div>
            <div className="sec-label">🗂️ Registry Browser</div>
            <div style={{ fontSize: 11, color: "#9C92B8", marginBottom: 4 }}>
              Showing {filterType === "all" ? "all types" : filterType}:
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #3A3054", borderRadius: 6, padding: 6 }}>
              {Object.values(registry.entries)
                .filter(e => filterType === "all" || e.type === filterType)
                .map((entry) => (
                  <div key={`${entry.type}:${entry.id}`} style={{ padding: "4px 6px", borderBottom: "1px solid #2A2340", fontSize: 11 }}>
                    <span style={{ color: "#E0A83E" }}>{entry.name}</span>
                    <span style={{ color: "#6B6284", marginLeft: 6 }}>[{entry.type}]</span>
                    <span style={{ color: "#7FA85C", marginLeft: 6, fontSize: 10 }}>({entry.source})</span>
                    <span style={{ color: "#8A7F9E", marginLeft: 6, fontSize: 10 }}>v{entry.version}</span>
                  </div>
                ))}
              {Object.values(registry.entries).length === 0 && (
                <div style={{ fontSize: 12, color: "#8A7F9E", textAlign: "center", padding: 20 }}>
                  No content yet — import homebrew above to populate the registry.
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 10, color: "#6B6284", textAlign: "center" }}>
            Domain 35 — Content Management · 8 sub-systems: Registry, Importer, Homebrew, Validator, Version Tracker, Diff, Exporter, Content Pack
          </div>
        </div>
      </div>
    </div>
  );
}
