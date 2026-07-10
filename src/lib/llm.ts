import OpenAI from "openai";

/**
 * Reads the OpenAI-compatible client config from env.
 * Throws if any of the required vars is missing so callers can
 * surface a clear error instead of crashing on a bad client.
 */
export function getLLMConfig(): { baseURL: string; apiKey: string; model: string } {
  const baseURL = process.env.OPENAI_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;

  const missing: string[] = [];
  if (!baseURL) missing.push("OPENAI_BASE_URL");
  if (!apiKey) missing.push("OPENAI_API_KEY");
  if (!model) missing.push("OPENAI_MODEL");

  if (missing.length > 0) {
    throw new Error(
      `Missing required env var(s): ${missing.join(", ")}. Set them in .env.local (see .env.local.example).`,
    );
  }

  return { baseURL: baseURL!, apiKey: apiKey!, model: model! };
}

/** Creates an OpenAI SDK client pointed at the configured OpenAI-compatible endpoint. */
export function createLLMClient(): { client: OpenAI; model: string } {
  const { baseURL, apiKey, model } = getLLMConfig();
  const client = new OpenAI({ baseURL, apiKey });
  return { client, model };
}
