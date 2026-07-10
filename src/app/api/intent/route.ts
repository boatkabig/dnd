import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/intent
 * Body: { text: string }
 * Returns: { intent: string, confidence: number, tone?: string, topic?: string }
 *
 * Uses the LLM to classify player intent for the AI DM Layer (Domain 31).
 * Falls back to "unknown" if the LLM fails.
 *
 * The intent classification is intentionally narrow — only the 17 intents
 * defined in dialogue.ts are valid responses. Anything else is "unknown".
 */
const VALID_INTENTS = [
  "greeting", "ask_question", "investigate", "negotiate", "bargain",
  "persuade", "intimidate", "deceive", "trade", "give_item",
  "request_quest", "report_progress", "accuse", "flatter", "threaten",
  "end_conversation", "leave", "unknown",
];

export async function POST(req: NextRequest) {
  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = (body.text || "").trim();
  if (!text) {
    return NextResponse.json({ intent: "unknown", confidence: 0 });
  }

  // For very short inputs (≤3 chars) or trivial patterns, skip LLM
  if (text.length <= 3) {
    return NextResponse.json({ intent: "unknown", confidence: 0.3 });
  }

  try {
    const zai = await ZAI.create();
    const systemPrompt = `You are an intent classifier for a D&D 5e solo game. Classify the player's input into exactly ONE of these intents:
- greeting (สวัสดี, hello, hi)
- ask_question (ถาม, what, where, why, ไหน, อะไร)
- investigate (สืบ, ค้น, look around, investigate)
- negotiate (เจรจา, ต่อรอง, make deal)
- bargain (ลดราคา, ถูกกว่า, cheaper)
- persuade (โน้มน้าว, ช่วย, please)
- intimidate (ข่มขู่, threaten, ฆ่า)
- deceive (โกหก, lie, หลอก)
- trade (ซื้อ, ขาย, buy, sell)
- give_item (ให้, give, มอบ)
- request_quest (เควส, ภารกิจ, work for)
- report_progress (เสร็จแล้ว, done, finished)
- accuse (กล่าวหา, accuse)
- flatter (เก่ง, great, amazing)
- threaten (ขู่, อันตราย)
- end_conversation (ลาก่อน, goodbye)
- leave (ออกไป, walk away)
- unknown (if none of the above)

Reply with JSON ONLY: {"intent":"<one_of_above>","confidence":0.0-1.0,"tone":"<optional emotion>"}\nDo not include any other text.`;
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Classify: "${text}"` },
      ],
      temperature: 0.1,
      max_tokens: 100,
    });
    const raw: string =
      completion?.choices?.[0]?.message?.content ??
      completion?.content ??
      "";
    // Parse the JSON response (LLM may wrap in code fences)
    const clean = raw.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(clean.slice(start, end + 1));
        const intent = VALID_INTENTS.includes(parsed.intent) ? parsed.intent : "unknown";
        const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
        return NextResponse.json({ intent, confidence, tone: parsed.tone });
      } catch {
        // fall through to fallback
      }
    }
  } catch (err) {
    console.error("[/api/intent] LLM failure:", err instanceof Error ? err.message : String(err));
  }

  // Fallback: simple keyword matching (mirrors dialogue.ts analyzeIntent)
  const lower = text.toLowerCase();
  const checks: Array<[string, RegExp]> = [
    ["end_conversation", /goodbye|ลาก่อน|บ๊ายบาย|จบสนทนา|ไปก่อน/],
    ["leave", /walk away|ออกไป|จากไป|เดินจากไป/],
    ["negotiate", /negotiate|เจรจา|ต่อรอง|make.*deal/],
    ["bargain", /bargain|ต่อราคา|ลดราคา|cheaper|ถูกกว่า/],
    ["persuade", /persuade|โน้มน้าว|ช่วย|please|ขอร้อง/],
    ["intimidate", /threaten|ข่มขู่|threat|ฆ่า|ตบะ|อันตราย/],
    ["deceive", /lie|โกหก|หลอก|deceive|trick|ไม่จริง/],
    ["trade", /buy|sell|ซื้อ|ขาย|trade|แลก/],
    ["give_item", /give|ให้|มอบ|ส่งมอบ/],
    ["request_quest", /quest|เควสต์|ภารกิจ|งาน|ช่วยทำ|work.*for/],
    ["report_progress", /done|เสร็จแล้ว|สำเร็จ|finished|killed.*it|กำจัดแล้ว/],
    ["accuse", /accuse|กล่าวหา|คุณทำ|you did/],
    ["flatter", /great|amazing|วิเศษ|เก่งมาก|wonderful|brilliant|ฉลาด/],
    ["ask_question", /\?|ไหน|อะไร|ทำไม|how|what|why|when|where|who|ใคร|เมื่อไหร่|ที่ไหน|ถาม/],
    ["investigate", /investigate|สืบ|ค้นหา|look.*into|tell.*about|เล่าเรื่อง|สำรวจ/],
    ["greeting", /^hi$|^hello$|^สวัสดี|^hallo|^hey|^ดี|^greetings/i],
  ];
  for (const [intent, pattern] of checks) {
    if (pattern.test(lower)) {
      return NextResponse.json({ intent, confidence: 0.6 });
    }
  }
  return NextResponse.json({ intent: "unknown", confidence: 0.2 });
}
