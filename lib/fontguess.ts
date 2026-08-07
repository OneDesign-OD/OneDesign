import { generateObject, APICallError, NoObjectGeneratedError, RetryError } from "ai";
import { z } from "zod";
import sharp from "sharp";
import type { Region } from "@/lib/regions";
import type { FontFamilyGuess } from "@/lib/extract";
import {
  resolveModel,
  classifyApiCallError,
  type Provider,
  type InterpretationErrorCode,
} from "@/lib/interpret";

export type FontGuessResult =
  | { ok: true; guess: FontFamilyGuess }
  | { ok: false; errorCode: InterpretationErrorCode; errorMessage: string };

const MAX_SAMPLES = 3;
const MIN_TEXT_LENGTH = 3;
const MIN_CONFIDENCE = 70;
const CROP_PADDING = 4;

const fontGuessSchema = z.object({
  fontFamily: z
    .string()
    .describe(
      "A short best-guess description of the font family's visual style, e.g. " +
        "'a geometric sans similar to Inter or Poppins', or 'a humanist sans like " +
        "Source Sans Pro'. This is a rough resemblance guess from cropped text " +
        "samples, not a precise identification — don't claim certainty.",
    ),
});

/**
 * The one AI-vision call in the image pipeline: crops a few clear, distinct
 * text samples and asks the model what font family they resemble. Never
 * sends the full image — only these narrow crops. The result is stored as
 * an explicitly labeled guess (see FontFamilyGuess), not a measured value.
 *
 * This is a nice-to-have, not structural data: failures here are returned
 * as a typed result the same way other AI stages report errors, but the
 * caller decides whether to omit the field rather than fail the pipeline.
 */
export async function guessFontFamily(
  imageBuffer: Buffer,
  regions: Region[],
  provider: Provider,
  apiKey: string,
): Promise<FontGuessResult> {
  try {
    const crops = await buildCrops(imageBuffer, regions);
    if (crops.length === 0) {
      return {
        ok: false,
        errorCode: "ai_response_invalid",
        errorMessage: "No text regions were clear enough to sample for a font guess.",
      };
    }

    const model = resolveModel(provider, apiKey);
    const { object } = await generateObject({
      model,
      schema: fontGuessSchema,
      prompt: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "These are cropped close-up samples of text from a UI screenshot, " +
                "each from a different part of the design. Based on their letterforms, " +
                "give a short best-guess description of what font family they visually " +
                "resemble.",
            },
            ...crops.map((crop) => ({
              type: "file" as const,
              data: crop,
              mediaType: "image/png" as const,
            })),
          ],
        },
      ],
    });

    return { ok: true, guess: { value: object.fontFamily, confidence: "estimated" } };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      return {
        ok: false,
        errorCode: "ai_response_invalid",
        errorMessage: "The model's response could not be parsed into the expected structure.",
      };
    }

    if (RetryError.isInstance(err) && APICallError.isInstance(err.lastError)) {
      return { ok: false, ...classifyApiCallError(err.lastError) };
    }

    if (APICallError.isInstance(err)) {
      return { ok: false, ...classifyApiCallError(err) };
    }

    console.error("[fontguess] unclassified error:", err);
    return {
      ok: false,
      errorCode: "ai_provider_error",
      errorMessage: "Something went wrong while guessing the font family.",
    };
  }
}

/**
 * Picks up to MAX_SAMPLES text regions with decent OCR confidence and
 * enough characters to show real letterform variety, favoring larger (more
 * visually legible) text, and crops each — with a little padding — from
 * the full-resolution image.
 */
async function buildCrops(imageBuffer: Buffer, regions: Region[]): Promise<Buffer[]> {
  const image = sharp(imageBuffer);
  const meta = await image.metadata();
  const imageWidth = meta.width ?? 0;
  const imageHeight = meta.height ?? 0;
  if (!imageWidth || !imageHeight) return [];

  const candidates = regions
    .filter(
      (r) =>
        r.type === "text" &&
        r.text &&
        r.text.length >= MIN_TEXT_LENGTH &&
        (r.confidence ?? 0) >= MIN_CONFIDENCE,
    )
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)
    .slice(0, MAX_SAMPLES);

  const crops: Buffer[] = [];
  for (const region of candidates) {
    const left = Math.max(0, region.box.x - CROP_PADDING);
    const top = Math.max(0, region.box.y - CROP_PADDING);
    const right = Math.min(imageWidth, region.box.x + region.box.width + CROP_PADDING);
    const bottom = Math.min(imageHeight, region.box.y + region.box.height + CROP_PADDING);
    const width = right - left;
    const height = bottom - top;
    if (width < 1 || height < 1) continue;

    const crop = await sharp(imageBuffer).extract({ left, top, width, height }).png().toBuffer();
    crops.push(crop);
  }

  return crops;
}
