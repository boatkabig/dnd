import { describe, it, expect } from "vitest";
import { buildDmResponseTool, DM_TOOL_NAME, validateDMResponse } from "../src/lib/dmSchema";

/**
 * Phase 3 — tool-calling migration Stage 0 (additive tool descriptor).
 * Guards that the DM tool descriptor is well-formed and that the SAME zod
 * validator (validateDMResponse) validates a tool-call-args-shaped payload —
 * proving the migration can reuse one validator across both transports.
 */
describe("buildDmResponseTool — DM function-tool descriptor", () => {
  it("produces an OpenAI-compatible function tool with narration required", () => {
    const tool = buildDmResponseTool();
    expect(tool.type).toBe("function");
    expect(tool.function.name).toBe(DM_TOOL_NAME);
    expect(tool.function.parameters.required).toContain("narration");
    expect(tool.function.parameters.properties.narration.type).toBe("string");
  });

  it("validateDMResponse accepts a payload shaped like tool-call arguments", () => {
    // What the LLM would put in tool_calls[0].function.arguments (parsed).
    const toolArgs = {
      narration: "โกบลินสองตัวโผล่จากพุ่มไม้!",
      scene: "จุดเริ่มต้น",
      start_combat: { monsters: ["goblin", "goblin"] },
    };
    const res = validateDMResponse(toolArgs);
    expect(res.success).toBe(true);
    expect(res.data?.narration).toContain("โกบลิน");
  });

  it("still drops invalid fields from tool-call args (one validator, two transports)", () => {
    const res = validateDMResponse({ narration: "hi", updates: { hp_delta: -999999 } });
    // hp_delta is over the cap → salvaged away, narration preserved.
    expect(res.data?.narration).toBe("hi");
    expect(res.data?.updates?.hp_delta).toBeUndefined();
  });
});
