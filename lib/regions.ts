import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";

export type RegionType = "text" | "block";

export type BoundingBox = { x: number; y: number; width: number; height: number };

export type Region = {
  type: RegionType;
  box: BoundingBox;
  // Only present for type "text".
  text?: string;
  confidence?: number;
};

export type RegionDetectionErrorCode = "region_detection_failed";

export type RegionDetectionResult =
  | { ok: true; regions: Region[] }
  | { ok: false; errorCode: RegionDetectionErrorCode; errorMessage: string };

const MAX_REGIONS = 40;

/**
 * Combines OCR text-line detection (tesseract.js) with pixel-based block/
 * shape detection (sharp) into a single capped list of regions — the
 * foundation everything downstream (color, typography, layout) reads from.
 * No AI calls; both passes are deterministic image processing.
 */
export async function detectRegions(imageBuffer: Buffer): Promise<RegionDetectionResult> {
  try {
    const [textRegions, blockRegions] = await Promise.all([
      detectTextRegions(imageBuffer),
      detectBlockRegions(imageBuffer),
    ]);

    const regions = [...textRegions, ...blockRegions]
      .sort((a, b) => area(b.box) - area(a.box))
      .slice(0, MAX_REGIONS);

    return { ok: true, regions };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errorCode: "region_detection_failed",
      errorMessage: `Failed to detect regions: ${message}`,
    };
  }
}

function area(box: BoundingBox): number {
  return box.width * box.height;
}

/**
 * Uses PSM.SPARSE_TEXT rather than Tesseract's default page segmentation
 * (which assumes a single coherent document layout): a UI screenshot is
 * scattered text in unrelated regions (nav links, a heading, a button
 * label), and the default mode's layout analysis silently drops small
 * isolated text like nav items or a button label because it doesn't fit
 * into whatever single block it detects.
 */
async function detectTextRegions(imageBuffer: Buffer): Promise<Region[]> {
  const worker = await createWorker("eng");

  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const { data } = await worker.recognize(imageBuffer, {}, { blocks: true });
    const regions: Region[] = [];

    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          const text = line.text.trim();
          if (!text) continue;

          const { x0, y0, x1, y1 } = line.bbox;
          regions.push({
            type: "text",
            box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
            text,
            confidence: line.confidence,
          });
        }
      }
    }

    return regions;
  } finally {
    await worker.terminate();
  }
}

const WORKING_MAX_DIM = 400;
const COLOR_QUANTUM = 24;
const MIN_BLOCK_AREA_RATIO = 0.003;
// Deliberately lenient: a button/card's own label text carves a real hole
// out of its flood-filled region (e.g. white text on a solid button can
// drop fill-ratio well below what a "clean" rectangle would have), so this
// only needs to reject clearly non-rectangular blobs (thin slivers, organic
// photo/gradient noise), not penalize ordinary text-bearing UI elements.
const MIN_RECTANGULARITY = 0.55;
// Drops thin boundary-artifact strips that resize interpolation leaves at
// color edges (a few px of blended color between e.g. a nav bar and the
// page background) — real UI blocks are never this thin.
const MIN_BLOCK_DIMENSION = 4;
const MAX_BLOCK_CANDIDATES = 60;

/**
 * Finds non-text rectangular regions with a background color distinct from
 * their surroundings (candidate buttons/cards/containers/nav bars) by
 * flood-filling connected components of similar color over a downsampled
 * copy of the image, then filtering to ones that are large and solid
 * enough to be a deliberate UI block rather than photo/gradient noise.
 */
async function detectBlockRegions(imageBuffer: Buffer): Promise<Region[]> {
  const image = sharp(imageBuffer);
  const meta = await image.metadata();
  const fullWidth = meta.width ?? 0;
  const fullHeight = meta.height ?? 0;
  if (!fullWidth || !fullHeight) return [];

  const scale = Math.min(1, WORKING_MAX_DIM / Math.max(fullWidth, fullHeight));
  const workWidth = Math.max(1, Math.round(fullWidth * scale));
  const workHeight = Math.max(1, Math.round(fullHeight * scale));

  const { data, info } = await image
    .resize(workWidth, workHeight, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const quantize = (pixelIndex: number): number => {
    const base = pixelIndex * channels;
    const qr = Math.round(data[base] / COLOR_QUANTUM);
    const qg = Math.round(data[base + 1] / COLOR_QUANTUM);
    const qb = Math.round(data[base + 2] / COLOR_QUANTUM);
    return (qr << 16) | (qg << 8) | qb;
  };

  const colorCounts = new Map<number, number>();
  for (let i = 0; i < width * height; i++) {
    const color = quantize(i);
    colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1);
  }
  let backgroundColor = -1;
  let backgroundCount = 0;
  for (const [color, count] of colorCounts) {
    if (count > backgroundCount) {
      backgroundColor = color;
      backgroundCount = count;
    }
  }

  const labels = new Int32Array(width * height).fill(-1);
  const stackX = new Int32Array(width * height);
  const stackY = new Int32Array(width * height);
  const candidates: BoundingBox[] = [];
  const minArea = MIN_BLOCK_AREA_RATIO * width * height;

  for (let startY = 0; startY < height; startY++) {
    for (let startX = 0; startX < width; startX++) {
      const startIndex = startY * width + startX;
      if (labels[startIndex] !== -1) continue;

      const componentId = candidates.length;
      const targetColor = quantize(startIndex);
      let stackSize = 0;
      stackX[stackSize] = startX;
      stackY[stackSize] = startY;
      stackSize++;
      labels[startIndex] = componentId;

      let minX = startX;
      let maxX = startX;
      let minY = startY;
      let maxY = startY;
      let pixelCount = 0;

      while (stackSize > 0) {
        stackSize--;
        const x = stackX[stackSize];
        const y = stackY[stackSize];
        pixelCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        const neighbors: [number, number][] = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const ni = ny * width + nx;
          if (labels[ni] !== -1) continue;
          if (quantize(ni) !== targetColor) continue;
          labels[ni] = componentId;
          stackX[stackSize] = nx;
          stackY[stackSize] = ny;
          stackSize++;
        }
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const bboxArea = boxWidth * boxHeight;
      const rectangularity = pixelCount / bboxArea;
      const isBackground = targetColor === backgroundColor;
      const isSliver = boxWidth < MIN_BLOCK_DIMENSION || boxHeight < MIN_BLOCK_DIMENSION;

      if (bboxArea >= minArea && rectangularity >= MIN_RECTANGULARITY && !isBackground && !isSliver) {
        candidates.push({ x: minX, y: minY, width: boxWidth, height: boxHeight });
      }
    }
  }

  const inverseScale = 1 / scale;
  return candidates
    .sort((a, b) => area(b) - area(a))
    .slice(0, MAX_BLOCK_CANDIDATES)
    .map((box) => ({
      type: "block" as const,
      box: {
        x: Math.round(box.x * inverseScale),
        y: Math.round(box.y * inverseScale),
        width: Math.round(box.width * inverseScale),
        height: Math.round(box.height * inverseScale),
      },
    }));
}
