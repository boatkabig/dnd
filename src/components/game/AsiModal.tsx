"use client";

/**
 * Ability Score Improvement modal — extracted from DnDSolo.tsx (de-monolith).
 * Presentational: the parent owns the pick buffer + confirm handler. Self-guards
 * on `open` (parent passes c.pendingAsi > 0). JSX moved verbatim.
 */
import React from "react";
import { ABILS, ABIL_TH } from "@/lib/gameData";

export interface AsiModalProps {
  open: boolean;
  abilities: Record<string, number>;
  picks: string[];
  setPicks: (p: string[]) => void;
  onConfirm: () => void;
}

export default function AsiModal({ open, abilities, picks, setPicks, onConfirm }: AsiModalProps) {
  if (!open) return null;
  return (
    <div className="sheet-overlay">
      <div className="sheet-modal" style={{ maxWidth: 440 }}>
        <div style={{ padding: "14px 16px" }}>
          <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>💪 Ability Score Improvement</span>
          <div style={{ fontSize: 13, color: "#9C92B8", margin: "6px 0 12px" }}>Pick +1 twice (same score twice = +2) · max 20</div>
          {ABILS.map((a) => {
            const p = picks.filter((x) => x === a).length;
            const atMax = abilities[a] + p >= 20;
            return (
              <div key={a} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 4px", borderBottom: "1px dashed #2E2748", fontSize: 14 }}>
                <span><b style={{ color: "#E0A83E" }}>{ABIL_TH[a]}</b> {abilities[a]}{p > 0 ? ` → ${abilities[a] + p}` : ""}</span>
                <button className="btn" style={{ padding: "3px 14px" }} disabled={picks.length >= 2 || atMax} onClick={() => setPicks([...picks, a])}>+1</button>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="btn" disabled={picks.length === 0} onClick={() => setPicks([])}>Clear</button>
            <button className="btn btn-gold" style={{ flex: 1 }} disabled={picks.length !== 2} onClick={onConfirm}>Confirm ({picks.length}/2)</button>
          </div>
        </div>
      </div>
    </div>
  );
}
