"use client";

/**
 * Re-prepare spells modal — extracted from DnDSolo.tsx (de-monolith).
 * Prepared casters pick which leveled spells to hold (cantrips are always
 * prepared). The parent owns open/selection/commit; this renders the picker.
 * Logic + JSX moved verbatim from the former inline IIFE.
 */
import React from "react";
import { CLASSES, mod } from "@/lib/gameData";
import { getSpellcastingRule } from "@/lib/magic";

export interface ReprepareModalProps {
  open: boolean;
  c: any;
  availableSpells: Array<{ index: string; level: number }>;
  sel: string[];
  setSel: (updater: (sel: string[]) => string[]) => void;
  onCommit: (selection: string[]) => void;
  onClose: () => void;
}

export default function ReprepareModal({ open, c, availableSpells, sel, setSel, onCommit, onClose }: ReprepareModalProps) {
  if (!open || !c) return null;
  const castAbil = CLASSES[c.cls]?.castAbil;
  const abilMod = castAbil ? mod(c.abilities[castAbil]) : 0;
  const maxHeld = getSpellcastingRule(c.cls, c.level, abilMod).maxHeld;
  const book: string[] = c.spellbook || c.knownSpells || [];
  // Only LEVELED spells are managed here (cantrips are always prepared).
  const leveledBook = book.filter((idx) => {
    const info = availableSpells.find((s) => s.index === idx);
    return info ? info.level > 0 : true;
  });
  const pretty = (idx: string) => idx.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const toggle = (idx: string) => setSel((s) =>
    s.includes(idx) ? s.filter((x) => x !== idx) : (s.length < maxHeld ? [...s, idx] : s));
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
          <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>🔄 เตรียมเวทใหม่ ({sel.length}/{maxHeld})</span>
          <button className="btn" style={{ padding: "4px 12px" }} onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, color: "#8A7F9E" }}>เลือกเวทที่จะเตรียม (สูงสุด {maxHeld} เวท) — cantrip เตรียมอัตโนมัติเสมอ</div>
          {leveledBook.length === 0 && <div style={{ fontSize: 12, color: "#8A7F9E" }}>ยังไม่มีเวทในสมุด — เรียนเวทก่อน (📜 → เวทมนตร์)</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 4, maxHeight: 320, overflowY: "auto" }}>
            {leveledBook.map((idx) => {
              const on = sel.includes(idx);
              const full = !on && sel.length >= maxHeld;
              return (
                <button key={idx} className={"btn" + (on ? " btn-gold" : "")} style={{ textAlign: "left", padding: "6px 10px", opacity: full ? 0.5 : 1 }}
                  disabled={full} onClick={() => toggle(idx)}>
                  {on ? "✅" : "⬜"} {pretty(idx)}
                </button>
              );
            })}
          </div>
          <button className="btn btn-gold" style={{ padding: "8px" }} onClick={() => onCommit(sel)}>ยืนยันการเตรียมเวท</button>
        </div>
      </div>
    </div>
  );
}
