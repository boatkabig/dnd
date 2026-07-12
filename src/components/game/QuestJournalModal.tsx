"use client";

/**
 * Quest journal modal — extracted from DnDSolo.tsx (de-monolith refactor).
 *
 * Presentational: renders the active/completed/failed quest list from the quests
 * prop. Self-guards on `open`. JSX moved verbatim — no behavior change.
 */
import React from "react";
import { type Quest } from "@/lib/gameData";

export interface QuestJournalModalProps {
  open: boolean;
  onClose: () => void;
  quests: Quest[];
}

export default function QuestJournalModal({ open, onClose, quests }: QuestJournalModalProps) {
  if (!open) return null;
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
          <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>📜 บันทึกเควสต์</span>
          <button className="btn" style={{ padding: "4px 12px" }} onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">
          {quests.length === 0 ? (
            <div style={{ fontSize: 13, color: "#8A7F9E", textAlign: "center", padding: 30 }}>ยังไม่มีเควสต์ — DM จะมอบเควสต์เมื่อคุณพบ NPC ที่เกี่ยวข้อง</div>
          ) : (
            quests.map((q) => (
              <div key={q.id} className="item-row" style={{ marginBottom: 8, borderLeft: q.status === "active" ? "3px solid #E0A83E" : q.status === "completed" ? "3px solid #7FA85C" : "3px solid #C74B44" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: q.status === "active" ? "#E0A83E" : q.status === "completed" ? "#7FA85C" : "#C74B44" }}>
                  {q.status === "active" ? "▶" : q.status === "completed" ? "✅" : "❌"} {q.title}
                </div>
                <div style={{ fontSize: 12, color: "#9C92B8", marginTop: 4 }}>{q.description}</div>
                {q.objectives && q.objectives.length > 0 && (
                  <div style={{ fontSize: 11, color: "#C9BFE0", marginTop: 4 }}>
                    {q.objectives.map((o, i) => (
                      <div key={i}>{o.done ? "✓" : "○"} {o.text}</div>
                    ))}
                  </div>
                )}
                {q.reward && <div style={{ fontSize: 11, color: "#B9A96A", marginTop: 4 }}>🎁 รางวัล: {q.reward}</div>}
                {q.giver && <div style={{ fontSize: 10, color: "#6B6284", marginTop: 2 }}>ผู้มอบ: {q.giver}</div>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
