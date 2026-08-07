import { generateObject, APICallError, NoObjectGeneratedError, RetryError } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { RawData } from "@/lib/extract";
import { detectAmbiguities } from "@/lib/ambiguity";

export type Provider = "openai" | "anthropic" | "google";

export type InterpretationErrorCode =
  "invalid_api_key" | "rate_limited" | "ai_response_invalid" | "ai_provider_error";

const MODEL_IDS: Record<Provider, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-4o",
  google: "gemini-flash-latest",
};

const designTokenSchema = z.object({
  name: z.string().describe("Short, human-readable token name, e.g. 'Primary Blue'"),
  category: z.enum(["color", "typography", "spacing", "layout"]),
  value: z.string().describe("The concrete value, e.g. '#0A2540' or '16px / 600 / 1.5'"),
  rationale: z
    .string()
    .describe(
      "One sentence on where/how this is used, e.g. 'used consistently across CTAs and links'",
    ),
});

export type DesignToken = z.infer<typeof designTokenSchema>;

const aiOutputSchema = z.object({
  tokens: z.array(designTokenSchema).min(1),
});

export type AiOutput = z.infer<typeof aiOutputSchema>;

export type InterpretResult =
  | { ok: true; data: AiOutput }
  | { ok: false; errorCode: InterpretationErrorCode; errorMessage: string };

const MAX_PROMPT_CHARS = 40_000;

export function resolveModel(provider: Provider, apiKey: string) {
  if (provider === "anthropic") {
    return createAnthropic({ apiKey })(MODEL_IDS.anthropic);
  }
  if (provider === "google") {
    return createGoogleGenerativeAI({ apiKey })(MODEL_IDS.google);
  }
  return createOpenAI({ apiKey })(MODEL_IDS.openai);
}

// Framing the source accurately matters, not just for tone: telling the
// model this is "a live-rendered web page" when it's actually a pixel
// measurement or a GitHub frequency scan invites it to reason about things
// that don't apply here (e.g. cascading/computed behavior for a repo scan).
const SOURCE_DESCRIPTIONS: Record<
  RawData["sourceType"],
  { intro: string; sourceLabel: string; sampleLabel: string }
> = {
  url: {
    intro: "You are analyzing computed CSS styles sampled from a real, live-rendered web page.",
    sourceLabel: "Page",
    sampleLabel: "Sampled elements",
  },
  image: {
    intro:
      "You are analyzing colors, typography, and layout measured directly from pixels in a " +
      "UI screenshot — via OCR text detection, k-means color sampling, and geometric layout " +
      "analysis, not AI guessing.",
    sourceLabel: "Screenshot",
    sampleLabel: "Sampled regions",
  },
  github: {
    intro:
      "You are analyzing color, typography, and spacing values parsed directly from a GitHub " +
      "repository's stylesheets (CSS/SCSS/Sass and CSS-in-JS), ranked by how frequently each " +
      "exact value appears across the codebase — the most-used values represent the real " +
      "design system, even without a dedicated tokens file. Each sample's usageCount is that " +
      "real frequency, not an estimate.",
    sourceLabel: "Repository",
    sampleLabel: "Ranked values",
  },
};

function buildPrompt(rawData: RawData, ambiguityFlags: unknown): string {
  let elements = rawData.elements;
  let elementsJson = JSON.stringify(elements);
  // Drop the lowest-priority (card/container) samples first if the payload
  // is too large — extract.ts already orders elements by priority.
  while (elementsJson.length > MAX_PROMPT_CHARS && elements.length > 1) {
    elements = elements.slice(0, -1);
    elementsJson = JSON.stringify(elements);
  }

  const { intro, sourceLabel, sampleLabel } = SOURCE_DESCRIPTIONS[rawData.sourceType];

  return [
    intro,
    "Interpret this ground-truth data into a small set of named design tokens covering colors, typography, spacing, and layout patterns.",
    'For each token, give a short human-readable name, its concrete value, and a one-sentence rationale describing where/how it\'s used (e.g. "Primary Blue — used consistently across CTAs and links").',
    "",
    `${sourceLabel}: ${rawData.url}`,
    `${sampleLabel} (${elements.length} of ${rawData.sampleCount} total):`,
    elementsJson,
    "",
    "A deterministic heuristic pass flagged the following possible ambiguities in the raw data — near-duplicate colors that may be the same intended token (when usageCounts are present, near-equal counts are a stronger signal of that), spacing values that don't fit the dominant scale, and inconsistent typography across elements of the same apparent role. Use these to decide which values should collapse into a single token vs. stay distinct:",
    JSON.stringify(ambiguityFlags),
  ].join("\n");
}

/**
 * Sends the Phase 1 rawData (plus Phase 2 ambiguity flags) to the user's own
 * AI provider and asks for a structured set of design tokens. The apiKey is
 * used only for this call and is never logged, persisted, or echoed back.
 */
export async function interpretDesign(
  rawData: RawData,
  provider: Provider,
  apiKey: string,
): Promise<InterpretResult> {
  const ambiguities = detectAmbiguities(rawData);
  const prompt = buildPrompt(rawData, ambiguities.flags);

  try {
    const model = resolveModel(provider, apiKey);
    const { object } = await generateObject({
      model,
      schema: aiOutputSchema,
      prompt,
    });
    return { ok: true, data: object };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      return {
        ok: false,
        errorCode: "ai_response_invalid",
        errorMessage:
          "The model's response could not be parsed into the expected structure.",
      };
    }

    // The AI SDK retries retryable failures (network errors, 5xx, 429)
    // internally and wraps the exhausted attempts in a RetryError — the
    // classifiable error is on `.lastError`, not `err` itself.
    if (RetryError.isInstance(err) && APICallError.isInstance(err.lastError)) {
      return { ok: false, ...classifyApiCallError(err.lastError) };
    }

    if (APICallError.isInstance(err)) {
      return { ok: false, ...classifyApiCallError(err) };
    }

    console.error("[interpret] unclassified error:", err);
    return {
      ok: false,
      errorCode: "ai_provider_error",
      errorMessage: "Something went wrong while interpreting the extracted styles.",
    };
  }
}

/**
 * Shared AI-call error classification, also used by lib/fontguess.ts for
 * its own (separate, narrower) vision call.
 */
export function classifyApiCallError(
  err: APICallError,
): { errorCode: InterpretationErrorCode; errorMessage: string } {
  if (err.statusCode === 401 || err.statusCode === 403) {
    return {
      errorCode: "invalid_api_key",
      errorMessage: "The provided API key was rejected by the provider.",
    };
  }
  if (err.statusCode === 429) {
    return {
      errorCode: "rate_limited",
      errorMessage: "The provider rate-limited this request.",
    };
  }
  if (err.statusCode === undefined) {
    console.error("[interpret] could not connect to provider:", err.message, err.cause);
    return {
      errorCode: "ai_provider_error",
      errorMessage:
        "Could not connect to the AI provider. Check your network connection and try again.",
    };
  }

  console.error(
    `[interpret] provider returned ${err.statusCode}:`,
    err.responseBody ?? err.message,
  );
  return {
    errorCode: "ai_provider_error",
    errorMessage: `The AI provider returned an error (${err.statusCode}).`,
  };
}
