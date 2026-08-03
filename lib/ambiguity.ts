import type { ExtractedElement, RawData } from "@/lib/extract";

export type ColorProperty = "color" | "backgroundColor" | "borderColor";
export type SpacingProperty = "margin" | "padding" | "gap";

export type AmbiguityFlag =
  | {
      type: "duplicate_color";
      property: ColorProperty;
      values: [string, string];
      distance: number;
      elements: string[];
    }
  | {
      type: "spacing_outlier";
      property: SpacingProperty;
      baseScale: number;
      value: number;
      elements: string[];
    }
  | {
      type: "typography_inconsistency";
      role: string;
      property: "fontSize" | "fontWeight";
      values: string[];
      elements: string[];
    };

export type AmbiguityReport = {
  flags: AmbiguityFlag[];
};

const COLOR_PROPERTIES: ColorProperty[] = ["color", "backgroundColor", "borderColor"];
const SPACING_PROPERTIES: SpacingProperty[] = ["margin", "padding", "gap"];
const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
const TRANSPARENT = new Set(["rgba(0, 0, 0, 0)", "transparent"]);
const COLOR_DISTANCE_THRESHOLD = 20;

/**
 * Deterministic, non-AI heuristics over Phase 1's `rawData` that flag likely
 * design-token inconsistencies (near-duplicate colors, off-scale spacing,
 * inconsistent heading typography). Feeds the Phase 3 AI prompt — not shown
 * to the end user directly.
 */
export function detectAmbiguities(rawData: RawData): AmbiguityReport {
  return {
    flags: [
      ...detectDuplicateColors(rawData.elements),
      ...detectSpacingOutliers(rawData.elements),
      ...detectTypographyInconsistencies(rawData.elements),
    ],
  };
}

function detectDuplicateColors(elements: ExtractedElement[]): AmbiguityFlag[] {
  const flags: AmbiguityFlag[] = [];

  for (const property of COLOR_PROPERTIES) {
    const usages = new Map<string, string[]>();
    for (const el of elements) {
      const value = el.styles[property];
      if (!value || TRANSPARENT.has(value)) continue;
      const list = usages.get(value) ?? [];
      list.push(el.label);
      usages.set(value, list);
    }

    const colors = Array.from(usages.keys());

    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const a = parseRgb(colors[i]);
        const b = parseRgb(colors[j]);
        if (!a || !b) continue;

        const distance = colorDistance(a, b);
        if (distance > 0 && distance <= COLOR_DISTANCE_THRESHOLD) {
          flags.push({
            type: "duplicate_color",
            property,
            values: [colors[i], colors[j]],
            distance: Math.round(distance * 10) / 10,
            elements: [
              ...(usages.get(colors[i]) ?? []),
              ...(usages.get(colors[j]) ?? []),
            ],
          });
        }
      }
    }
  }

  return flags;
}

function parseRgb(value: string): { r: number; g: number; b: number } | null {
  const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

// "Redmean" weighted Euclidean distance — a cheap, well-known approximation
// of perceptual color difference that avoids a full LAB conversion.
function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  const rmean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  const weightR = 2 + rmean / 256;
  const weightG = 4;
  const weightB = 2 + (255 - rmean) / 256;
  return Math.sqrt(weightR * dr * dr + weightG * dg * dg + weightB * db * db);
}

function detectSpacingOutliers(elements: ExtractedElement[]): AmbiguityFlag[] {
  type Sample = { value: number; property: SpacingProperty; label: string };
  const samples: Sample[] = [];

  for (const el of elements) {
    for (const property of SPACING_PROPERTIES) {
      const raw = el.styles[property];
      if (!raw) continue;
      for (const token of raw.split(/\s+/)) {
        const px = parsePx(token);
        if (px !== null && px > 0) samples.push({ value: px, property, label: el.label });
      }
    }
  }

  if (samples.length === 0) return [];

  const count8 = samples.filter((s) => s.value % 8 === 0).length;
  const baseScale = count8 / samples.length >= 0.5 ? 8 : 4;

  const outliers = samples.filter((s) => s.value % baseScale !== 0);
  // Only worth flagging if outliers are a minority — otherwise there's no
  // real "scale" to be off from in the first place.
  if (outliers.length === 0 || outliers.length / samples.length > 0.4) return [];

  const grouped = new Map<
    string,
    { value: number; property: SpacingProperty; elements: string[] }
  >();
  for (const o of outliers) {
    const key = `${o.property}:${o.value}`;
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.elements.includes(o.label)) existing.elements.push(o.label);
    } else {
      grouped.set(key, { value: o.value, property: o.property, elements: [o.label] });
    }
  }

  return Array.from(grouped.values()).map((g) => ({
    type: "spacing_outlier" as const,
    property: g.property,
    baseScale,
    value: g.value,
    elements: g.elements,
  }));
}

function parsePx(token: string): number | null {
  const match = token.match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? Number(match[1]) : null;
}

function detectTypographyInconsistencies(elements: ExtractedElement[]): AmbiguityFlag[] {
  const flags: AmbiguityFlag[] = [];

  for (const tag of HEADING_TAGS) {
    const matches = elements.filter((el) => el.tag === tag);
    if (matches.length < 2) continue;

    for (const property of ["fontSize", "fontWeight"] as const) {
      const values = new Set(matches.map((el) => el.styles[property]));
      if (values.size > 1) {
        flags.push({
          type: "typography_inconsistency",
          role: tag,
          property,
          values: Array.from(values),
          elements: matches.map((el) => el.label),
        });
      }
    }
  }

  return flags;
}
