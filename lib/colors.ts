import sharp from "sharp";
import { kmeans } from "ml-kmeans";
import type { BoundingBox, Region } from "@/lib/regions";

export type RegionWithColors = Region & {
  // Hex colors found within the region, sorted by cluster size descending
  // (colors[0] covers the most sampled area). Callers decide how to map
  // these onto semantic fields like "text color" vs "background" — a text
  // region's dominant cluster is usually its surrounding background (most
  // of a text bbox is empty space around the glyphs), not the glyph color.
  colors: string[];
};

export type ColorExtractionErrorCode = "color_extraction_failed";

export type ColorExtractionResult =
  | { ok: true; regions: RegionWithColors[] }
  | { ok: false; errorCode: ColorExtractionErrorCode; errorMessage: string };

const GRID_SIZE = 5;
const SAMPLE_RADIUS = 1;
const INSET_RATIO = 0.15;
const MAX_CLUSTERS = 2;

/**
 * For each region, samples a grid of points in its interior (inset from the
 * edges to avoid anti-aliasing), averaging a small neighborhood at each
 * point to further smooth noise, then runs k-means over those samples to
 * find the region's dominant color(s). Pure pixel math — no AI calls.
 */
export async function extractColors(
  imageBuffer: Buffer,
  regions: Region[],
): Promise<ColorExtractionResult> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const withColors = regions.map((region) => {
      // A larger region (e.g. a card) commonly contains a smaller nested
      // text region (its title/body) — sampling the card's own fill color
      // should skip pixels that really belong to that nested text, or the
      // card's dominant cluster gets pulled toward the text color.
      const excluded = regions
        .filter((other) => other !== region && other.type === "text")
        .filter((other) => isContained(other.box, region.box))
        .map((other) => other.box);

      return {
        ...region,
        colors: dominantColors(data, info.width, info.height, info.channels, region.box, excluded),
      };
    });

    return { ok: true, regions: withColors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errorCode: "color_extraction_failed",
      errorMessage: `Failed to extract colors: ${message}`,
    };
  }
}

function dominantColors(
  pixels: Buffer,
  imageWidth: number,
  imageHeight: number,
  channels: number,
  box: BoundingBox,
  excludedBoxes: BoundingBox[],
): string[] {
  const points = samplePoints(box);
  const filtered = excludedBoxes.length > 0 ? points.filter((p) => !isInsideAny(p, excludedBoxes)) : points;
  // Fall back to the unfiltered grid if exclusions swallowed every sample
  // point (e.g. a block that's almost entirely covered by nested text).
  const usable = filtered.length > 0 ? filtered : points;

  const samples = usable.map(({ x, y }) =>
    averageNeighborhood(pixels, imageWidth, imageHeight, channels, x, y),
  );

  const uniqueSamples = dedupeSamples(samples);
  if (uniqueSamples.length === 0) return [];

  const k = Math.min(MAX_CLUSTERS, uniqueSamples.length);
  if (k === 1) return [rgbToHex(uniqueSamples[0])];

  const result = kmeans(uniqueSamples, k, {});
  return result
    .computeInformation(uniqueSamples)
    .filter((cluster) => cluster.size > 0)
    .sort((a, b) => b.size - a.size)
    .map((cluster) => rgbToHex(cluster.centroid));
}

function samplePoints(box: BoundingBox): { x: number; y: number }[] {
  const insetX = Math.min(Math.floor(box.width / 2), Math.round(box.width * INSET_RATIO));
  const insetY = Math.min(Math.floor(box.height / 2), Math.round(box.height * INSET_RATIO));
  const left = box.x + insetX;
  const right = box.x + box.width - insetX;
  const top = box.y + insetY;
  const bottom = box.y + box.height - insetY;

  const points: { x: number; y: number }[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const x = Math.round(left + ((col + 0.5) / GRID_SIZE) * (right - left));
      const y = Math.round(top + ((row + 0.5) / GRID_SIZE) * (bottom - top));
      points.push({ x, y });
    }
  }
  return points;
}

function averageNeighborhood(
  pixels: Buffer,
  imageWidth: number,
  imageHeight: number,
  channels: number,
  centerX: number,
  centerY: number,
): number[] {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let dy = -SAMPLE_RADIUS; dy <= SAMPLE_RADIUS; dy++) {
    for (let dx = -SAMPLE_RADIUS; dx <= SAMPLE_RADIUS; dx++) {
      const x = clamp(centerX + dx, 0, imageWidth - 1);
      const y = clamp(centerY + dy, 0, imageHeight - 1);
      const base = (y * imageWidth + x) * channels;
      r += pixels[base];
      g += pixels[base + 1];
      b += pixels[base + 2];
      count++;
    }
  }

  return [r / count, g / count, b / count];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isContained(inner: BoundingBox, outer: BoundingBox): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function isInsideAny(point: { x: number; y: number }, boxes: BoundingBox[]): boolean {
  return boxes.some(
    (box) =>
      point.x >= box.x &&
      point.x < box.x + box.width &&
      point.y >= box.y &&
      point.y < box.y + box.height,
  );
}

// Collapses near-identical samples (rounded to whole RGB values) so a
// solid-fill region doesn't feed k-means dozens of duplicate points.
function dedupeSamples(samples: number[][]): number[][] {
  const seen = new Map<string, number[]>();
  for (const sample of samples) {
    const rounded = sample.map((c) => Math.round(c));
    seen.set(rounded.join(","), rounded);
  }
  return Array.from(seen.values());
}

function rgbToHex([r, g, b]: number[]): string {
  const toHex = (c: number) =>
    clamp(Math.round(c), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
