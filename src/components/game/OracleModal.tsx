"use client";

/**
 * Solo Oracle modal — extracted from DnDSolo.tsx (de-monolith refactor).
 *
 * Presentational: the parent owns the oracle state (question / likelihood / log)
 * and the ask action; this renders the yes/no oracle UI. Self-guards on `open`.
 * JSX moved verbatim — no behavior change.
 */
import React from "react";
import { LIKELIHOOD_ORDER, type Likelihood, type OracleResult, type RandomEvent } from "@/lib/engine/oracle";

export interface OracleLogEntry {
  q: string;
  res: OracleResult;
  event: RandomEvent | null;
}

export interface OracleModalProps {
  open: boolean;
  onClose: () => void;
  question: string;
  setQuestion: (v: string) => void;
  likelihood: Likelihood;
  setLikelihood: (lk: Likelihood) => void;
  log: OracleLogEntry[];
  onAsk: () => void;
}

export default function OracleModal({
  open, onClose, question, setQuestion, likelihood, setLikelihood, log, onAsk,
}: OracleModalProps) {
  if (!open) return null;
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
          <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>🔮 ออราเคิล</span>
          <button className="btn" style={{ padding: "4px 12px" }} onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: "#8A7F9E" }}>ถามคำถามใช่/ไม่ใช่ แล้วให้โชคชะตาตอบ — สำหรับเล่นคนเดียวโดยไม่ต้องรอ DM</div>
          <input className="input-main" placeholder="เช่น มีใครซ่อนอยู่ในห้องนี้ไหม?" value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onAsk(); }}
            style={{ fontSize: 13, padding: "8px 12px" }} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {LIKELIHOOD_ORDER.map((lk) => (
              <button key={lk} className={"btn" + (likelihood === lk ? " btn-gold" : "")}
                style={{ flex: "1 0 30%", fontSize: 11, padding: "6px" }}
                onClick={() => setLikelihood(lk)}>
                {lk === "certain" ? "แน่นอนมาก" : lk === "likely" ? "น่าจะใช่" : lk === "50-50" ? "50-50" : lk === "unlikely" ? "ไม่น่าใช่" : "แทบเป็นไปไม่ได้"}
              </button>
            ))}
          </div>
          <button className="btn btn-gold" style={{ padding: "10px", fontSize: 14 }} onClick={onAsk}>
            🎲 ถามออราเคิล
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "40vh", overflowY: "auto" }}>
            {log.length === 0 ? (
              <div style={{ fontSize: 12, color: "#6B6284", textAlign: "center", padding: 16 }}>ยังไม่มีคำถาม</div>
            ) : log.map((entry, i) => (
              <div key={i} className="item-row" style={{ borderLeft: `3px solid ${entry.res.affirmative ? "#7FA85C" : "#C74B44"}`, padding: "8px 10px" }}>
                <div style={{ fontSize: 12, color: "#C9BFE0" }}>{entry.q}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: entry.res.affirmative ? "#7FA85C" : "#C74B44" }}>
                  {entry.res.label} <span style={{ fontSize: 11, color: "#6B6284", fontWeight: 400 }}>(d100={entry.res.roll})</span>
                </div>
                {entry.event && (
                  <div style={{ fontSize: 12, color: "#E0A83E", marginTop: 4 }}>
                    ⚡ เหตุการณ์สุ่ม: {entry.event.focusLabel} — <span style={{ color: "#C9BFE0" }}>{entry.event.meaning.prompt}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
