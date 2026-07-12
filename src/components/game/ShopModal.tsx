"use client";

/**
 * Shop modal — extracted from DnDSolo.tsx (de-monolith).
 *
 * Presentational D&D 5e economy UI (buy weapons/armor/magic/consumables, bargain,
 * sell at 50%). The parent owns the character + the three state-mutating handlers
 * (onBuy / onBargain / onSell); this component only renders and computes display
 * prices. JSX moved verbatim — no behavior change.
 */
import React from "react";
import { WEAPONS, ARMOR, MAGIC_ITEMS, CONSUMABLES, weaponByName } from "@/lib/gameData";
import { sellPrice as sellPriceOf } from "@/lib/engine/economy";

export type ShopTab = "weapons" | "armor" | "magic" | "consumables" | "sell";

export interface ShopModalProps {
  open: boolean;
  c: any;
  tab: ShopTab;
  setTab: (t: ShopTab) => void;
  search: string;
  setSearch: (v: string) => void;
  bargainedPrices: Record<string, number>;
  onBuy: (label: string, price: number, invItem: string, bargainKey?: string) => void;
  onBargain: (key: string, basePrice: number, label: string) => void;
  onSell: (item: string, index: number, sellPrice: number) => void;
  onClose: () => void;
}

export default function ShopModal({
  open, c, tab, setTab, search, setSearch, bargainedPrices, onBuy, onBargain, onSell, onClose,
}: ShopModalProps) {
  if (!open || !c) return null;
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 650 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
          <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>🏪 ร้านค้า</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 14, color: "#B9A96A" }}>💰 {c.gold} gp</span>
            <button className="btn" style={{ padding: "4px 12px" }} onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="sheet-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {(["weapons", "armor", "magic", "consumables", "sell"] as const).map(t => (
              <button key={t} className={"btn" + (tab === t ? " btn-gold" : "")} style={{ flex: 1, fontSize: 11, padding: "5px" }}
                onClick={() => setTab(t)}>
                {t === "weapons" ? "⚔️ อาวุธ" : t === "armor" ? "🛡️ เกราะ" : t === "magic" ? "✨ ของวิเศษ" : t === "consumables" ? "🧪 ยา" : "📤 ขายของ"}
              </button>
            ))}
          </div>
          {/* Search box */}
          <input className="input-main" placeholder="🔍 ค้นหา..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 10, fontSize: 13, padding: "8px 12px" }} />

          {/* Buy Weapons */}
          {tab === "weapons" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {Object.entries(WEAPONS).filter(([, w]: any) => (w.type === "simple" || w.type === "martial")).filter(([key, w]: any) => !search || w.th.toLowerCase().includes(search.toLowerCase()) || key.includes(search.toLowerCase())).map(([key, w]: any) => {
                // Calculate price with reputation discount (D&D 5e: Persuasion can reduce price)
                const basePrice = w.price;
                const charRep = c.gold > 500 ? 10 : 0; // simple reputation proxy
                // A negotiated bargain price (if this item was just haggled over) overrides
                // the passive reputation discount — it's the more specific, explicit price.
                const finalPrice = bargainedPrices[key] ?? Math.max(1, Math.floor(basePrice * (1 - charRep / 100)));
                return (
                <div key={key} style={{ padding: "6px 8px", background: "#1E1830", border: "1px solid #3A3054", borderRadius: 6, fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ color: "#C9BFE0", fontWeight: 600 }}>{w.th}</span>
                    <span style={{ color: "#8A7F9E", marginLeft: 4 }}>{w.dmg} {w.abil === "dex" ? "DEX" : "STR"}{w.versatileDmg ? ` (2H: ${w.versatileDmg})` : ""}</span>
                    {w.mastery && <span style={{ color: "#7FA85C", fontSize: 9, marginLeft: 4 }}>[{w.mastery}]</span>}
                    <div style={{ color: "#B9A96A" }}>
                      {finalPrice !== basePrice ? (
                        <span><s style={{ color: "#6B6284" }}>{basePrice}</s> {finalPrice} gp</span>
                      ) : (
                        <span>{basePrice} gp</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 3 }}>
                    <button className="btn" style={{ padding: "3px 8px", fontSize: 10 }}
                      disabled={c.gold < finalPrice}
                      onClick={() => onBuy(w.th, finalPrice, w.th, key)}>ซื้อ</button>
                    <button className="btn" style={{ padding: "3px 6px", fontSize: 9 }}
                      onClick={() => onBargain(key, basePrice, w.th)}>เจรจา</button>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Buy Armor */}
          {tab === "armor" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {Object.entries(ARMOR).filter(([key, a]: any) => !search || a.th.toLowerCase().includes(search.toLowerCase()) || key.includes(search.toLowerCase())).map(([key, a]: any) => (
                <div key={key} style={{ padding: "6px 8px", background: "#1E1830", border: "1px solid #3A3054", borderRadius: 6, fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ color: "#C9BFE0", fontWeight: 600 }}>{a.th}</span>
                    <span style={{ color: "#8A7F9E", marginLeft: 4 }}>
                      {a.acPlus ? `+${a.acPlus} AC` : `AC ${a.acBase}${a.dexBonus ? "+DEX" : ""}${a.maxDex ? `(max ${a.maxDex})` : ""}`}
                    </span>
                    <span style={{ color: "#6B6284", fontSize: 9, marginLeft: 4 }}>[{a.type}]</span>
                    <div style={{ color: "#B9A96A" }}>{a.price} gp</div>
                  </div>
                  <button className="btn" style={{ padding: "3px 8px", fontSize: 10 }}
                    disabled={c.gold < a.price}
                    onClick={() => onBuy(a.th, a.price, a.th)}>ซื้อ</button>
                </div>
              ))}
            </div>
          )}

          {/* Buy Magic Items */}
          {tab === "magic" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {Object.entries(MAGIC_ITEMS).filter(([, m]: any) => m.price <= c.gold + 500).filter(([name, m]: any) => !search || name.toLowerCase().includes(search.toLowerCase())).map(([name, m]: any) => (
                <div key={name} style={{ padding: "6px 8px", background: "#1E1830", border: "1px solid #3A3054", borderRadius: 6, fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ color: "#E0A83E", fontWeight: 600 }}>{name}</span>
                    <span style={{ color: "#6B6284", fontSize: 9, marginLeft: 4 }}>[{m.slot}]</span>
                    <div style={{ color: "#B9A96A" }}>{m.price} gp</div>
                    <div style={{ color: "#8A7F9E", fontSize: 9 }}>{m.desc?.slice(0, 60)}...</div>
                  </div>
                  <button className="btn" style={{ padding: "3px 8px", fontSize: 10 }}
                    disabled={c.gold < m.price}
                    onClick={() => onBuy(name, m.price, name)}>ซื้อ</button>
                </div>
              ))}
            </div>
          )}

          {/* Buy Consumables */}
          {tab === "consumables" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {Object.entries(CONSUMABLES).filter(([key, con]: any) => !search || (con.th || key).toLowerCase().includes(search.toLowerCase())).map(([key, con]: any) => (
                <div key={key} style={{ padding: "6px 8px", background: "#1E1830", border: "1px solid #3A3054", borderRadius: 6, fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ color: "#C9BFE0", fontWeight: 600 }}>{con.th || key}</span>
                    <div style={{ color: "#8A7F9E", fontSize: 9 }}>{con.heal ? `ฟื้น ${con.heal} HP` : con.cure ? `รักษา ${con.cure}` : "ใช้ใน combat"}</div>
                    <div style={{ color: "#B9A96A" }}>{con.price || 25} gp</div>
                  </div>
                  <button className="btn" style={{ padding: "3px 8px", fontSize: 10 }}
                    disabled={c.gold < (con.price || 25)}
                    onClick={() => onBuy(con.th || key, con.price || 25, key)}>ซื้อ</button>
                </div>
              ))}
            </div>
          )}

          {/* Sell items from inventory (50% of base price) */}
          {tab === "sell" && (
            <div>
              <div style={{ fontSize: 11, color: "#9C92B8", marginBottom: 8 }}>
                ขายของจากเป้ (ราคาขาย = 50% ของราคาซื้อ — D&D 5e standard)
              </div>
              {c.inventory.length === 0 ? (
                <div style={{ fontSize: 12, color: "#8A7F9E", textAlign: "center", padding: 20 }}>ไม่มีของในเป้</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {c.inventory.map((item: string, i: number) => {
                    const wEntry = weaponByName(item) as [string, any] | undefined;
                    const w = wEntry?.[1];
                    const armorEntries = Object.entries(ARMOR) as [string, any][];
                    const armorMatch = armorEntries.find(([, a]) => a.th === item);
                    const magicMatch = (MAGIC_ITEMS as any)[item];
                    const conMatch = (CONSUMABLES as any)[item];
                    const basePrice = w?.price || armorMatch?.[1]?.price || magicMatch?.price || conMatch?.price || 5;
                    const sp = sellPriceOf(basePrice);
                    return (
                      <div key={i} style={{ padding: "6px 8px", background: "#1E1830", border: "1px solid #3A3054", borderRadius: 6, fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ color: "#C9BFE0" }}>{item}</span>
                          <div style={{ color: "#7FA85C" }}>ขาย {sp} gp</div>
                        </div>
                        <button className="btn" style={{ padding: "3px 8px", fontSize: 10 }}
                          onClick={() => onSell(item, i, sp)}>ขาย</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 10, color: "#6B6284", textAlign: "center" }}>
            D&D 5e Economy — ราคาตาม PHB 2024 · ขายของได้ 50% · เปิดร้านได้ตอนไม่อยู่ใน combat
          </div>
        </div>
      </div>
    </div>
  );
}
