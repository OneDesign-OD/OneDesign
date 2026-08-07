import type { Region } from "@/lib/regions";

export type FontWeightBucket = "thin" | "regular" | "medium" | "bold";

// A text line's OCR bbox height isn't the same as its CSS font-size — it's
// closer to cap-height, extended further down when the line contains a
// descending lowercase letter (g/j/p/q/y). Calibrated against a synthetic
// fixture with known font sizes (scripts/fixtures/sample-design.ts):
// bboxHeight/fontSize is ~0.70 without descenders and ~0.90 with them, i.e.
// multiply by ~1.43 / ~1.12 to recover an estimated font-size. This stayed
// within ~5% on that fixture, but real screenshots use different fonts with
// different metrics — treat this as an estimate, not a measurement.
const DESCENDER_CHARS = /[gjpqy]/;
const NO_DESCENDER_MULTIPLIER = 1.43;
const WITH_DESCENDER_MULTIPLIER = 1.12;

export function estimateFontSize(region: Region): number | undefined {
  if (region.type !== "text" || !region.text) return undefined;
  const multiplier = DESCENDER_CHARS.test(region.text)
    ? WITH_DESCENDER_MULTIPLIER
    : NO_DESCENDER_MULTIPLIER;
  return Math.round(region.box.height * multiplier);
}

// Phase 2 only kept line-level OCR granularity (not word/character-level
// boxes), so true letter-spacing can't be measured directly. This is the
// "documented simpler approximation" the spec allows for that case: compare
// the line's actual pixel width to an expected width derived from a typical
// average character advance width for Latin sans-serif text (~0.45x
// font-size), and spread the leftover width over the gaps between
// characters. Rough by design — varies with the specific letters present
// and with font weight (bold glyphs are wider than this ratio assumes).
const TYPICAL_CHAR_WIDTH_RATIO = 0.45;

export function estimateLetterSpacing(
  text: string,
  boxWidth: number,
  fontSize: number,
): number {
  const charCount = text.length;
  if (charCount < 2) return 0;
  const expectedWidth = charCount * fontSize * TYPICAL_CHAR_WIDTH_RATIO;
  return Math.round((boxWidth - expectedWidth) / (charCount - 1));
}

// Font-weight, estimated from how much of a text region's area is "ink"
// versus empty space — bolder strokes fill more of their glyph area at the
// same font size. The background reference is found locally (the modal
// color across a dense sample grid, via color-quantized histogram) rather
// than reused from Phase 3's k-means output — that centroid can already be
// pulled away from pure background by nearby anti-aliasing, which under-
// counted ink and made weight estimates unusable in testing.
//
// Raw ink-ratio alone isn't comparable across font sizes: smaller text has
// proportionally less interior "counter" space regardless of nominal
// weight, so ratio × fontSize (a rough stroke-thickness proxy) separates
// weight classes far better. Calibrated against the sample fixture's mix of
// 400/700-weight text: 400-weight lines measured 3.96–7.68, 700-weight
// measured 8.4–20.1 — a clean split at 8. The thin/medium boundaries are
// extrapolated (the fixture has no 300/500/600-weight text to validate
// against), so treat those two buckets as a rougher guess than the
// regular/bold split.
const WEIGHT_GRID_SIZE = 10;
const WEIGHT_QUANTUM = 20;
const INK_DISTANCE_THRESHOLD = 45;
const WEIGHT_BUCKETS: { max: number; bucket: FontWeightBucket }[] = [
  { max: 3, bucket: "thin" },
  { max: 8, bucket: "regular" },
  { max: 15, bucket: "medium" },
  { max: Infinity, bucket: "bold" },
];

export function estimateFontWeight(
  pixels: Buffer,
  imageWidth: number,
  imageHeight: number,
  channels: number,
  region: Region,
  fontSize: number | undefined,
): FontWeightBucket | undefined {
  if (region.type !== "text" || fontSize === undefined) return undefined;

  const inkRatio = computeInkRatio(pixels, imageWidth, imageHeight, channels, region.box);
  if (inkRatio === undefined) return undefined;

  const metric = inkRatio * fontSize;
  return WEIGHT_BUCKETS.find((b) => metric <= b.max)?.bucket ?? "bold";
}

function computeInkRatio(
  pixels: Buffer,
  imageWidth: number,
  imageHeight: number,
  channels: number,
  box: Region["box"],
): number | undefined {
  if (box.width < 2 || box.height < 2) return undefined;

  const samples: [number, number, number][] = [];
  for (let row = 0; row < WEIGHT_GRID_SIZE; row++) {
    for (let col = 0; col < WEIGHT_GRID_SIZE; col++) {
      const x = Math.min(
        imageWidth - 1,
        Math.round(box.x + ((col + 0.5) / WEIGHT_GRID_SIZE) * box.width),
      );
      const y = Math.min(
        imageHeight - 1,
        Math.round(box.y + ((row + 0.5) / WEIGHT_GRID_SIZE) * box.height),
      );
      const base = (y * imageWidth + x) * channels;
      samples.push([pixels[base], pixels[base + 1], pixels[base + 2]]);
    }
  }
  if (samples.length === 0) return undefined;

  const background = modalColor(samples);
  const inkCount = samples.filter((s) => rgbDistance(s, background) > INK_DISTANCE_THRESHOLD).length;
  return inkCount / samples.length;
}

// The most common color across the samples, found via a coarse quantized
// histogram (robust to anti-aliasing noise) — for text this is almost
// always the surrounding background, since ink pixels are the minority.
function modalColor(samples: [number, number, number][]): [number, number, number] {
  const buckets = new Map<string, { count: number; sum: [number, number, number] }>();

  for (const sample of samples) {
    const key = sample.map((c) => Math.round(c / WEIGHT_QUANTUM)).join(",");
    const bucket = buckets.get(key) ?? { count: 0, sum: [0, 0, 0] };
    bucket.count++;
    bucket.sum[0] += sample[0];
    bucket.sum[1] += sample[1];
    bucket.sum[2] += sample[2];
    buckets.set(key, bucket);
  }

  let mode = { count: 0, sum: [0, 0, 0] as [number, number, number] };
  for (const bucket of buckets.values()) {
    if (bucket.count > mode.count) mode = bucket;
  }

  return mode.sum.map((c) => c / mode.count) as [number, number, number];
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// "Vertical gap between consecutive text-line boxes in the same block" —
// lines are considered part of the same block when they're roughly
// left-aligned (a paragraph/column of text) and close enough vertically
// that they're plausibly consecutive lines rather than an unrelated
// section further down the page.
const LEFT_EDGE_TOLERANCE = 12;
const MAX_LINE_GAP_RATIO = 1.5;

export function computeLineHeights(textRegions: Region[]): Map<Region, number> {
  const sorted = [...textRegions].sort((a, b) => a.box.y - b.box.y);
  const lineHeights = new Map<Region, number>();

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const leftAligned = Math.abs(prev.box.x - curr.box.x) <= LEFT_EDGE_TOLERANCE;
    const gap = curr.box.y - (prev.box.y + prev.box.height);
    const maxGap = Math.max(prev.box.height, curr.box.height) * MAX_LINE_GAP_RATIO;

    if (leftAligned && gap >= 0 && gap <= maxGap) {
      lineHeights.set(curr, gap);
    }
  }

  return lineHeights;
}
