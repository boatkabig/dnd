"use client";

/**
 * Session Zero charter modal — extracted from DnDSolo.tsx (de-monolith refactor).
 *
 * Presentational: all state lives in the parent and arrives via props (config +
 * the two safety-input buffers and their setters + editSz + onClose). The
 * sessionZero engine transforms are imported directly. Moved verbatim — the JSX
 * and every handler match the former renderSessionZeroModal() one-for-one.
 */
import React from "react";
import {
  setTone, setPillars, addLine, addVeil, removeLine, removeVeil, setXCard,
  setStartingSituation, pillarPercentages, TONE_ORDER,
  type SessionZeroConfig, type CampaignTone,
} from "@/lib/engine/sessionZero";

export interface SessionZeroModalProps {
  open: boolean;
  config: SessionZeroConfig;
  onClose: () => void;
  editSz: (fn: (cfg: SessionZeroConfig) => SessionZeroConfig) => void;
  lineInput: string;
  setLineInput: (v: string) => void;
  veilInput: string;
  setVeilInput: (v: string) => void;
}

export default function SessionZeroModal({
  open, config: cfg, onClose, editSz, lineInput, setLineInput, veilInput, setVeilInput,
}: SessionZeroModalProps) {
  if (!open) return null;
  const pct = pillarPercentages(cfg);
  const TONE_UI: Record<CampaignTone, string> = {
    "dark-fantasy": "แฟนตาซีมืดหม่น", heroic: "วีรบุรุษ", mystery: "ปริศนา", horror: "สยองขวัญ",
  };
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
          <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>🎭 Session Zero</span>
          <button className="btn" style={{ padding: "4px 12px" }} onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: "#8A7F9E" }}>กำหนดโทน ความปลอดภัย และสไตล์ของแคมเปญก่อนเริ่มเล่น (ไม่บังคับ — ข้ามได้) ป้อนข้อมูลนี้จะถูกส่งให้ DM เคารพทุกข้อ</div>

          {/* Tone / genre */}
          <div>
            <div style={{ fontSize: 13, color: "#C9BFE0", marginBottom: 6 }}>โทน / แนวเรื่อง</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {TONE_ORDER.map((t) => (
                <button key={t} className={"btn" + (cfg.tone === t ? " btn-gold" : "")}
                  style={{ flex: "1 0 40%", fontSize: 12, padding: "6px" }}
                  onClick={() => editSz((c0) => setTone(c0, t))}>{TONE_UI[t]}</button>
              ))}
            </div>
          </div>

          {/* Pillar weights */}
          <div>
            <div style={{ fontSize: 13, color: "#C9BFE0", marginBottom: 6 }}>น้ำหนักสามเสาหลัก ({pct.combat}/{pct.exploration}/{pct.social})</div>
            {([["combat", "⚔️ ต่อสู้"], ["exploration", "🧭 สำรวจ"], ["social", "💬 สังคม"]] as const).map(([key, label]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "#8A7F9E", width: 80 }}>{label}</span>
                <input type="range" min={0} max={100} step={5} value={cfg.pillars[key]}
                  onChange={(e) => editSz((c0) => setPillars(c0, { [key]: Number(e.target.value) }))}
                  style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: "#C9BFE0", width: 32, textAlign: "right" }}>{cfg.pillars[key]}</span>
              </div>
            ))}
          </div>

          {/* Safety tools */}
          <div>
            <div style={{ fontSize: 13, color: "#C9BFE0", marginBottom: 6 }}>Safety Tools</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input className="input-main" placeholder="เส้นต้องห้าม (line) — ห้ามปรากฏ" value={lineInput}
                onChange={(e) => setLineInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && lineInput.trim()) { editSz((c0) => addLine(c0, lineInput)); setLineInput(""); } }}
                style={{ fontSize: 12, padding: "6px 10px" }} />
              <button className="btn" style={{ fontSize: 12 }} disabled={!lineInput.trim()}
                onClick={() => { editSz((c0) => addLine(c0, lineInput)); setLineInput(""); }}>+ line</button>
            </div>
            {cfg.safety.lines.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                {cfg.safety.lines.map((l) => (
                  <button key={l} className="btn btn-red" style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => editSz((c0) => removeLine(c0, l))}>{l} ✕</button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input className="input-main" placeholder="ม่านบัง (veil) — ตัดฉาก ไม่บรรยายตรง ๆ" value={veilInput}
                onChange={(e) => setVeilInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && veilInput.trim()) { editSz((c0) => addVeil(c0, veilInput)); setVeilInput(""); } }}
                style={{ fontSize: 12, padding: "6px 10px" }} />
              <button className="btn" style={{ fontSize: 12 }} disabled={!veilInput.trim()}
                onClick={() => { editSz((c0) => addVeil(c0, veilInput)); setVeilInput(""); }}>+ veil</button>
            </div>
            {cfg.safety.veils.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                {cfg.safety.veils.map((v) => (
                  <button key={v} className="btn" style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => editSz((c0) => removeVeil(c0, v))}>{v} ✕</button>
                ))}
              </div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#C9BFE0" }}>
              <input type="checkbox" checked={cfg.safety.xCard} onChange={(e) => editSz((c0) => setXCard(c0, e.target.checked))} />
              เปิดใช้ X-card (หยุด/ข้ามฉากได้ทันที)
            </label>
          </div>

          {/* Starting situation */}
          <div>
            <div style={{ fontSize: 13, color: "#C9BFE0", marginBottom: 6 }}>สถานการณ์เริ่มต้น (ไม่บังคับ)</div>
            <input className="input-main" placeholder="สถานที่เริ่มต้น" value={cfg.situation.location}
              onChange={(e) => editSz((c0) => setStartingSituation(c0, { location: e.target.value }))}
              style={{ fontSize: 12, padding: "6px 10px", marginBottom: 6 }} />
            <input className="input-main" placeholder="Hook เปิดเรื่อง" value={cfg.situation.hook}
              onChange={(e) => editSz((c0) => setStartingSituation(c0, { hook: e.target.value }))}
              style={{ fontSize: 12, padding: "6px 10px", marginBottom: 6 }} />
            <div style={{ display: "flex", gap: 6 }}>
              <input className="input-main" placeholder="NPC ผูกพัน (ชื่อ)" value={cfg.situation.bondNpc.name}
                onChange={(e) => editSz((c0) => setStartingSituation(c0, { bondNpc: { name: e.target.value } }))}
                style={{ fontSize: 12, padding: "6px 10px" }} />
              <input className="input-main" placeholder="ความสัมพันธ์" value={cfg.situation.bondNpc.relationship}
                onChange={(e) => editSz((c0) => setStartingSituation(c0, { bondNpc: { relationship: e.target.value } }))}
                style={{ fontSize: 12, padding: "6px 10px" }} />
            </div>
          </div>

          <button className="btn btn-gold" style={{ padding: "10px", fontSize: 14 }} onClick={onClose}>
            บันทึกกฎบัตร
          </button>
        </div>
      </div>
    </div>
  );
}
