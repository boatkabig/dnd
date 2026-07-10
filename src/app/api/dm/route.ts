import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface DMRequestBody {
  system: string;
  messages: DMMessage[];
}

/* ============================================================================
 * Phase 1.4: Retry + Backoff + Error Resilience
 * ============================================================================
 *
 * Problems with previous version:
 *  - Single LLM call, no retry → transient 5xx/network errors kill the request
 *  - No timeout → hung requests block the player
 *  - No backoff → hammering the API on failure
 *
 * Strategy:
 *  - Max 2 retries (3 total attempts) with exponential backoff (500ms, 1500ms)
 *  - 30s timeout per attempt (via AbortController)
 *  - Detect JSON-parse-failure → retry once with stricter prompt
 *  - Surface friendly error to client (don't leak API internals)
 */

const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 500;
const PER_REQUEST_TIMEOUT_MS = 30000;

/** Sleep helper for backoff */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Call ZAI with timeout via AbortController — bypasses SDK (SDK doesn't forward signal) */
async function callZAIWithTimeout(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  payload: { messages: DMMessage[]; temperature: number; max_tokens: number },
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // A4 fix: bypass SDK's chat.completions.create (which doesn't forward signal)
    // and fetch the ZAI HTTP endpoint directly with AbortController.signal.
    // Access the SDK's config to get baseUrl + apiKey.
    const config = (zai as any).config || (zai as any);
    const baseUrl = config.baseUrl || config.baseURL;
    const apiKey = config.apiKey;
    const chatId = config.chatId;
    const userId = config.userId;
    if (!baseUrl || !apiKey) {
      // Fallback to SDK if config not accessible
      const completion = await zai.chat.completions.create(payload);
      const text: string =
        completion?.choices?.[0]?.message?.content ??
        completion?.content ??
        (typeof completion === "string" ? completion : "");
      return text || "";
    }
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        ...(chatId ? { "X-Chat-Id": chatId } : {}),
        ...(userId ? { "X-User-Id": userId } : {}),
      },
      body: JSON.stringify({
        ...payload,
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`ZAI API ${response.status}: ${errorBody.slice(0, 200)}`);
    }
    const data = await response.json();
    const text: string =
      data?.choices?.[0]?.message?.content ??
      data?.content ??
      (typeof data === "string" ? data : "");
    return text || "";
  } finally {
    clearTimeout(timeout);
  }
}

/** Detect if a response looks like valid JSON (starts with { and ends with }) */
function looksLikeJSON(text: string): boolean {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  return start !== -1 && end !== -1 && end > start;
}

export async function POST(req: NextRequest) {
  let body: DMRequestBody;
  try {
    body = (await req.json()) as DMRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { system, messages } = body || {};
  if (typeof system !== "string" || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Missing system or messages" }, { status: 400 });
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const zai = await ZAI.create();

      // On retry, append a "please respond as valid JSON only" reminder
      // to the last user message (helps recover from JSON parse failures)
      let messagesToUse = messages;
      if (attempt > 0) {
        const lastMsg = messages[messages.length - 1];
        const retryHint = "\n\n[ENGINE RETRY: ครั้งที่ " + attempt + " — กรุณาตอบเป็น JSON ที่ถูกต้องเท่านั้น ห้ามมีข้อความนอก JSON]";
        messagesToUse = [
          ...messages.slice(0, -1),
          { ...lastMsg, content: lastMsg.content + retryHint },
        ];
      }

      const text = await callZAIWithTimeout(
        zai,
        {
          messages: [{ role: "system", content: system }, ...messagesToUse],
          // Low temperature for deterministic JSON responses
          temperature: 0.3,
          max_tokens: 4000,
        },
        PER_REQUEST_TIMEOUT_MS,
      );

      if (!text) {
        lastError = new Error("DM returned empty response");
        // Empty response = transient, retry
        if (attempt < MAX_RETRIES) {
          await sleep(INITIAL_BACKOFF_MS * Math.pow(3, attempt));
          continue;
        }
        break;
      }

      // Quick JSON sanity check — if it doesn't look like JSON, retry once more
      // (client-side callDM has its own repair logic, but catching here saves a round-trip)
      if (!looksLikeJSON(text) && attempt < MAX_RETRIES) {
        console.warn(`[/api/dm] attempt ${attempt + 1}: response doesn't look like JSON, retrying`);
        lastError = new Error("DM did not return JSON");
        await sleep(INITIAL_BACKOFF_MS * Math.pow(3, attempt));
        continue;
      }

      return NextResponse.json({ text });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = err instanceof Error ? err : new Error(msg);
      console.error(`[/api/dm] attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`, msg);

      // Don't retry on 4xx (client error — bad request, auth, etc.)
      // Retry on 5xx, network errors, timeouts, aborts
      // Phase 1 fix: removed crude "msg.includes('5') && msg.length < 30" heuristic
      // (was too broad — matched any short error containing digit 5)
      const isRetryable =
        msg.includes("fetch failed") ||
        msg.includes("aborted") ||
        msg.includes("timeout") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("network") ||
        msg.includes("ENOTFOUND") ||
        msg.includes("socket hang up") ||
        msg.includes("connect ECONNREFUSED") ||
        // HTTP 5xx status codes (e.g. "500 Internal Server Error", "502 Bad Gateway", "503 Service Unavailable")
        /\b5\d{2}\b/.test(msg);

      if (attempt < MAX_RETRIES && isRetryable) {
        await sleep(INITIAL_BACKOFF_MS * Math.pow(3, attempt));
        continue;
      }
      break;
    }
  }

  // All retries exhausted
  const msg = lastError?.message || "Unknown error";
  console.error("[/api/dm] all retries exhausted:", msg);
  return NextResponse.json(
    {
      error: "DM call failed after " + (MAX_RETRIES + 1) + " attempts: " + msg,
      // Provide a graceful fallback message for the player
      fallback: "DM ไม่ตอบ — ลองพิมพ์ action ใหม่อีกครั้ง",
    },
    { status: 502 },
  );
}
