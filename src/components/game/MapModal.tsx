"use client";

/**
 * World-map modal — extracted from DnDSolo.tsx (de-monolith).
 * Renders the fog-of-war world graph as an SVG (nodes + discovered edges, gold
 * ring = current). Read-only; self-guards on open. JSX moved verbatim.
 */
import React from "react";
import { MAP_ICON } from "@/lib/gameData";

export interface MapModalProps {
  open: boolean;
  onClose: () => void;
  map: { nodes: Record<string, any>; edges: [string, string][]; current: string | null } | null;
}

export default function MapModal({ open, onClose, map }: MapModalProps) {
  if (!open) return null;
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
          <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>🗺️ แผนที่</span>
          <button className="btn" style={{ padding: "4px 12px" }} onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body" style={{ overflow: "auto" }}>
          {!map || Object.keys(map.nodes).length === 0 ? (
            <div style={{ fontSize: 13, color: "#8A7F9E", textAlign: "center", padding: 30 }}>ยังไม่มีสถานที่บนแผนที่ — ออกสำรวจเพื่อค้นพบโลก</div>
          ) : (() => {
            const nodes = Object.entries(map.nodes);
            const CELL = 92, PAD = 60;
            const xs = nodes.map(([, n]: any) => n.x), ys = nodes.map(([, n]: any) => n.y);
            const minX = Math.min(...xs), minY = Math.min(...ys);
            const W = (Math.max(...xs) - minX + 1) * CELL + PAD * 2;
            const H = (Math.max(...ys) - minY + 1) * CELL + PAD * 2;
            const px = (n: any) => (n.x - minX) * CELL + PAD;
            const py = (n: any) => (n.y - minY) * CELL + PAD;
            return (
              <svg width={Math.max(W, 300)} height={Math.max(H, 200)} style={{ display: "block", margin: "0 auto" }}>
                {map.edges.map(([a, b]: any, i: number) => {
                  const na = map.nodes[a], nb = map.nodes[b];
                  if (!na || !nb) return null;
                  return <line key={i} x1={px(na)} y1={py(na)} x2={px(nb)} y2={py(nb)} stroke="#4A3F6E" strokeWidth="2.5" strokeDasharray="5 4" />;
                })}
                {nodes.map(([id, n]: any) => {
                  const cur = id === map.current;
                  return (
                    <g key={id}>
                      {cur && <circle cx={px(n)} cy={py(n)} r="26" fill="none" stroke="#E0A83E" strokeWidth="2.5" opacity="0.9" />}
                      <circle cx={px(n)} cy={py(n)} r="20" fill={cur ? "#3A2F5C" : "#221C38"} stroke={cur ? "#E0A83E" : "#3A3054"} strokeWidth="1.5" />
                      <text x={px(n)} y={py(n) + 6} textAnchor="middle" fontSize="17">{MAP_ICON[n.type] || "📍"}</text>
                      <text x={px(n)} y={py(n) + 38} textAnchor="middle" fontSize="11" fill={cur ? "#E0A83E" : "#C9BFE0"} fontFamily="Sarabun" fontWeight={cur ? "700" : "500"}>{n.name}</text>
                    </g>
                  );
                })}
              </svg>
            );
          })()}
          <div style={{ fontSize: 11, color: "#8A7F9E", textAlign: "center", marginTop: 8 }}>
            🏘️ เมือง · 🏠 อาคาร · ▦ ห้อง · 🕳️ ดันเจี้ยน · 🌲 ป่า/ถนน — วงทองคือตำแหน่งปัจจุบัน
          </div>
        </div>
      </div>
    </div>
  );
}
