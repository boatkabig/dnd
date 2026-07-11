"use client";

import React from "react";
import { canReprepareOnLongRest } from "@/lib/magic";

export interface DMChatProps {
  c: any;
  cls: any;
  combat: any;
  thinking: boolean;
  input: string;
  setInput: (v: string) => void;
  submitAction: (text: string) => void;
  submitCombatTalk: (text: string) => void;
  shortRest: () => void;
  longRest: () => void;
  openReprepare: () => void;
  /** Task #16 — solo exploration/travel turn (procedural, no LLM round-trip). */
  exploreAction: () => void;
}

export default function DMChat({
  c, cls, combat, thinking, input, setInput,
  submitAction, submitCombatTalk, shortRest, longRest, openReprepare, exploreAction,
}: DMChatProps) {
  return (
      <div style={{ borderTop: "1px solid #3A3054", background: "rgba(20,16,32,0.95)", padding: "10px 14px", paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }}>
        {!combat && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            {/* Contextual quick actions — change based on scene type */}
            {c?.sceneType === "social" || c?.sceneType === "town" ? (
              <>
                {["คุยกับคนแถวนี้", "ขอดูสินค้าในร้าน", "ถามข่าวสาร", "เดินไปที่อื่น"].map((q) => (
                  <button key={q} className="btn" style={{ fontSize: 12, padding: "6px 10px" }} disabled={thinking} onClick={() => submitAction(q)}>{q}</button>
                ))}
              </>
            ) : c?.sceneType === "dungeon" ? (
              <>
                {["สำรวจห้องนี้", "ฟังเสียงรอบตัว", "ซ่อนตัว", "เปิดประตูถัดไป"].map((q) => (
                  <button key={q} className="btn" style={{ fontSize: 12, padding: "6px 10px" }} disabled={thinking} onClick={() => submitAction(q)}>{q}</button>
                ))}
              </>
            ) : (
              <>
                {["สำรวจรอบ ๆ", "คุยกับคนแถวนี้", "ตรวจดูให้ละเอียด"].map((q) => (
                  <button key={q} className="btn" style={{ fontSize: 12, padding: "6px 10px" }} disabled={thinking} onClick={() => submitAction(q)}>{q}</button>
                ))}
              </>
            )}
            <button className="btn" style={{ fontSize: 12, padding: "6px 10px" }} disabled={thinking} onClick={exploreAction}>🧭 สำรวจ/เดินทาง</button>
            <button className="btn" style={{ fontSize: 12, padding: "6px 10px" }} disabled={thinking || (c.hitDiceLeft || 0) <= 0} onClick={shortRest}>⛺ พักสั้น ({c.hitDiceLeft || 0})</button>
            <button className="btn" style={{ fontSize: 12, padding: "6px 10px" }} disabled={thinking} onClick={longRest}>🌙 พักยาว</button>
            {/* Task #14: re-prepare (prepared casters only — Cleric/Druid/Paladin/Wizard) */}
            {cls?.caster && canReprepareOnLongRest(c.cls) && (
              <button className="btn" style={{ fontSize: 12, padding: "6px 10px" }} disabled={thinking} onClick={openReprepare}>🔄 เตรียมเวทใหม่</button>
            )}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, maxWidth: 640, margin: "0 auto" }}>
          <input
            className="input-main"
            placeholder={combat ? "💬 พูด/ตะโกน/ถาม DM (free action — ไม่เสียเทิร์น)..." : "จะทำอะไรต่อ? (พิมพ์ action อิสระ...)"}
            value={input}
            disabled={thinking}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") (combat ? submitCombatTalk : submitAction)(input); }}
          />
          <button className="btn btn-gold" disabled={thinking || !input.trim()} onClick={() => (combat ? submitCombatTalk : submitAction)(input)}>ส่ง</button>
        </div>
      </div>
  );
}
