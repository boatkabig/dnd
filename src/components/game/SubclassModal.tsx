"use client";

/**
 * Subclass-choice modal — extracted from DnDSolo.tsx (de-monolith).
 * Presentational: parent computes `open` (out of combat, no pending ASI, and the
 * class has reached its subclass level) and owns the choose handler. JSX verbatim.
 */
import React from "react";
import { CLASSES } from "@/lib/gameData";
import { getAvailableSubclasses } from "@/lib/engine/progression";

export interface SubclassModalProps {
  open: boolean;
  cls: string;
  level: number;
  onChoose: (subId: string) => void;
}

export default function SubclassModal({ open, cls, level, onChoose }: SubclassModalProps) {
  if (!open) return null;
  return (
    <div className="sheet-overlay">
      <div className="sheet-modal" style={{ maxWidth: 480 }}>
        <div style={{ padding: "14px 16px" }}>
          <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>🎓 เลือก Subclass</span>
          <div style={{ fontSize: 13, color: "#9C92B8", margin: "6px 0 12px" }}>สาย{CLASSES[cls].th} — เลือก 1 (กำหนดความสามารถพิเศษ)</div>
          {getAvailableSubclasses(cls, level).map((sub) => (
            <div key={sub.id} style={{ padding: "8px 4px", borderBottom: "1px dashed #2E2748" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <b style={{ color: "#E0A83E", fontSize: 14 }}>{sub.th}</b>
                <button className="btn btn-gold" style={{ padding: "3px 14px" }} onClick={() => onChoose(sub.id)}>เลือก</button>
              </div>
              <div style={{ fontSize: 12, color: "#9C92B8", marginTop: 3 }}>{sub.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
