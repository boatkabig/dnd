"use client";

/**
 * Companion (sidekick) recruit modal — extracted from DnDSolo.tsx (de-monolith).
 * Shows the current sidekick (with a dismiss option) or the recruit choices.
 * Parent owns open + the recruit handler. JSX moved verbatim.
 */
import React from "react";
import { SIDEKICK_BASES, type SidekickClass } from "@/lib/engine/sidekick";

export interface CompanionModalProps {
  open: boolean;
  sidekick: { baseKey: string; klass: string; level: number } | null | undefined;
  onClose: () => void;
  onRecruit: (config: { baseKey: string; klass: SidekickClass } | null) => void;
}

export default function CompanionModal({ open, sidekick, onClose, onRecruit }: CompanionModalProps) {
  if (!open) return null;
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
          <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>🐕 สหายร่วมทาง</span>
          <button className="btn" style={{ padding: "4px 12px" }} onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sidekick ? (
            <>
              <div style={{ fontSize: 13, color: "#C9BFE0" }}>
                สหายปัจจุบัน: <b>{SIDEKICK_BASES[sidekick.baseKey]?.name}</b> — {sidekick.klass} (Lv.{sidekick.level})
              </div>
              <button className="btn btn-red" onClick={() => onRecruit(null)}>ปลดสหาย</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "#8A7F9E" }}>เลือกสหาย 1 คนที่จะช่วยโจมตีในสนามรบอัตโนมัติ</div>
              {([
                { key: "guard", klass: "warrior" as SidekickClass, label: "⚔️ องครักษ์ (Warrior) — โจมตีประชิด อึด" },
                { key: "scout", klass: "expert" as SidekickClass, label: "🏹 หน่วยสอดแนม (Expert) — ยิงระยะไกล" },
                { key: "acolyte", klass: "spellcaster" as SidekickClass, label: "✨ นักบวช (Spellcaster) — เวทสนับสนุน" },
              ]).map((o) => (
                <button key={o.key} className="btn" style={{ textAlign: "left", padding: "10px 12px" }}
                  onClick={() => onRecruit({ baseKey: o.key, klass: o.klass })}>{o.label}</button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
