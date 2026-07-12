"use client";

/**
 * AI DM Helper modal — extracted from DnDSolo.tsx (de-monolith).
 * Read-only introspection of the AI DM layer (intent, narrative pacing, encounter
 * thresholds, EventBus features, engine status). Self-guards on open. JSX verbatim.
 */
import React from "react";
import { getDifficultyThresholds } from "@/lib/encounter";

export interface AiDmHelperModalProps {
  open: boolean;
  onClose: () => void;
  level: number;
  lastIntent: string | null;
  narrativeEngine: any;
}

export default function AiDmHelperModal({ open, onClose, level, lastIntent, narrativeEngine }: AiDmHelperModalProps) {
  if (!open) return null;
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
          <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>🤖 AI DM Helper</span>
          <button className="btn" style={{ padding: "4px 12px" }} onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {/* Dialogue Intent */}
          <div style={{ marginBottom: 14 }}>
            <div className="sec-label">🔍 Intent Analysis (Domain 31)</div>
            <div style={{ fontSize: 13, color: "#C9BFE0" }}>
              Last intent: <b style={{ color: "#E0A83E" }}>{lastIntent || "—"}</b>
            </div>
            <div style={{ fontSize: 11, color: "#8A7F9E", marginTop: 4 }}>
              Engine วิเคราะห์ input ของผู้เล่นเพื่อช่วย AI DM ปรับน้ำเสียง (greeting/negotiate/persuade/intimidate/deceive/trade/etc.)
            </div>
          </div>

          {/* Narrative State */}
          <div style={{ marginBottom: 14 }}>
            <div className="sec-label">📖 Narrative State (Domain 33)</div>
            <div style={{ fontSize: 13, color: "#C9BFE0" }}>
              Arc phase: <b style={{ color: "#E0A83E" }}>{narrativeEngine?.arc.currentPhase || "—"}</b>
            </div>
            <div style={{ fontSize: 13, color: "#C9BFE0" }}>
              Current tension: <b style={{ color: "#E0A83E" }}>{narrativeEngine?.pacing.currentTension || "—"}</b>
            </div>
            <div style={{ fontSize: 13, color: "#C9BFE0" }}>
              Recommended next: <b style={{ color: "#7FA85C" }}>{narrativeEngine?.pacing.recommendedNextTension || "—"}</b>
            </div>
            <div style={{ fontSize: 11, color: "#9C92B8", marginTop: 4 }}>
              Scenes since rest: {narrativeEngine?.pacing.scenesSinceRest || 0} · since combat: {narrativeEngine?.pacing.scenesSinceCombat || 0} · since revelation: {narrativeEngine?.pacing.scenesSinceRevelation || 0}
            </div>
            {narrativeEngine?.pacing.pacingNotes && narrativeEngine.pacing.pacingNotes.length > 0 && (
              <div style={{ fontSize: 11, color: "#B9A96A", marginTop: 4 }}>
                💡 {narrativeEngine.pacing.pacingNotes.join(" · ")}
              </div>
            )}
          </div>

          {/* Encounter Difficulty */}
          <div style={{ marginBottom: 14 }}>
            <div className="sec-label">⚔️ Encounter Difficulty (Domain 34)</div>
            <div style={{ fontSize: 12, color: "#C9BFE0", marginBottom: 4 }}>
              Lv.{level} XP thresholds (solo play):
            </div>
            {(() => {
              const t = getDifficultyThresholds(level);
              return (
                <div style={{ fontSize: 11, color: "#9C92B8", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                  <div>Trivial: <b style={{ color: "#8A7F9E" }}>{t.trivial}</b></div>
                  <div>Low: <b style={{ color: "#7FA85C" }}>{t.low}</b></div>
                  <div>Moderate: <b style={{ color: "#E0A83E" }}>{t.moderate}</b></div>
                  <div>High: <b style={{ color: "#E0734A" }}>{t.high}</b></div>
                  <div>Impossible: <b style={{ color: "#C74B44" }}>{t.impossible}</b></div>
                  <div>Soft daily: <b style={{ color: "#B9A96A" }}>{t.high * 4}</b></div>
                </div>
              );
            })()}
            <div style={{ fontSize: 11, color: "#8A7F9E", marginTop: 6 }}>
              ใช้ตารางนี้เพื่อเลือก CR มอนสเตอร์ — engine จะคำนวณ difficulty อัตโนมัติตอน combat เริ่ม
            </div>
          </div>

          {/* EventBus Activity */}
          <div style={{ marginBottom: 14 }}>
            <div className="sec-label">⚡ EventBus + Features (Domain 28)</div>
            <div style={{ fontSize: 11, color: "#9C92B8" }}>
              Engine ปล่อย events ทุกครั้งที่มีการกระทำ (on_attack, on_hit, on_damage, on_cast_spell, on_turn_start/end)
            </div>
            <div style={{ fontSize: 11, color: "#C9BFE0", marginTop: 4 }}>
              Features ที่ trigger อัตโนมัติผ่าน EventBus:
            </div>
            <ul style={{ fontSize: 11, color: "#9C92B8", paddingLeft: 18, marginTop: 2 }}>
              <li><b>poison_weapon</b> — on_hit → apply poisoned</li>
              <li><b>savage_attacker</b> — on_hit → +1d6 damage</li>
              <li><b>relentless_endurance</b> — on_damage_taken → heal 1 instead of dying</li>
              <li><b>riposte</b> — on_miss → reaction attack</li>
              <li><b>polearm_master</b> — on_enter_area → reaction attack</li>
            </ul>
          </div>

          {/* Save Version */}
          <div>
            <div className="sec-label">💾 Engine Status</div>
            <div style={{ fontSize: 11, color: "#9C92B8" }}>
              Save version: v3 · Domain modules: 36 · Engine adapters: ✅ Active
            </div>
            <div style={{ fontSize: 11, color: "#8A7F9E", marginTop: 4 }}>
              Engine ทำงานร่วมกับ legacy DnDSolo.tsx ผ่าน engineAdapters.ts — ทุก domain สามารถ introspect ผ่าน DOMAINS metadata table
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
