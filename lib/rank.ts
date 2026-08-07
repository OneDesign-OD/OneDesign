import type { ExtractedValues } from "@/lib/cssparse";

export type RankedValue = {
  value: string;
  usageCount: number;
};

export type RankedValues = {
  colors: RankedValue[];
  fontSizes: RankedValue[];
  fontFamilies: RankedValue[];
  spacing: RankedValue[];
};

const TOP_N_PER_CATEGORY = 12;

/**
 * Aggregates raw extracted values into frequency-ranked, deduplicated lists
 * per category — the "measure first" signal for which values represent the
 * real design system, even in a repo with no dedicated tokens file. Pure
 * counting/normalization — no AI calls.
 */
export function rankExtractedValues(totals: ExtractedValues): RankedValues {
  return {
    colors: rankCategory(totals.colors, normalizeColor),
    fontSizes: rankCategory(totals.fontSizes, normalizeFontSize),
    fontFamilies: rankCategory(totals.fontFamilies, normalizeFontFamily),
    spacing: rankCategory(totals.spacing, normalizeSpacing),
  };
}

function rankCategory(values: string[], normalize: (raw: string) => string): RankedValue[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const normalized = normalize(raw);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, usageCount]) => ({ value, usageCount }))
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, TOP_N_PER_CATEGORY);
}

// Collapses different textual representations of the identical color
// (#fff / #ffffff / rgb(255,255,255) / hsl(0,0%,100%) all become #ffffff)
// by converting hex/rgb/hsl forms to a canonical lowercase hex string
// before counting. Exotic color functions (lab/lch/oklab/oklch/hwb/color())
// aren't converted — true color-space conversion is a lot of complexity for
// a design-token frequency count — so those are kept as their own
// whitespace-normalized raw strings, distinct even if they'd represent the
// same visual color as some hex entry.
function normalizeColor(raw: string): string {
  const trimmed = raw.trim();

  const hexMatch = trimmed.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) return expandHex(hexMatch[1]);

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*(?:,\s*([\d.]+%?))?\s*\)$/i,
  );
  if (rgbMatch) {
    const [, r, g, b, a] = rgbMatch;
    return rgbToHex(parseChannel(r), parseChannel(g), parseChannel(b), parseAlpha(a));
  }

  const hslMatch = trimmed.match(
    /^hsla?\(\s*([\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+%?))?\s*\)$/i,
  );
  if (hslMatch) {
    const [, h, s, l, a] = hslMatch;
    const [r, g, b] = hslToRgb(Number(h), Number(s), Number(l));
    return rgbToHex(r, g, b, parseAlpha(a));
  }

  return trimmed.toLowerCase().replace(/\s+/g, " ");
}

function expandHex(hex: string): string {
  const lower = hex.toLowerCase();
  if (lower.length === 3 || lower.length === 4) {
    return `#${lower
      .split("")
      .map((c) => c + c)
      .join("")}`;
  }
  return `#${lower}`;
}

function parseChannel(token: string): number {
  const value = token.endsWith("%")
    ? (parseFloat(token) / 100) * 255
    : parseFloat(token);
  return Math.round(value);
}

function parseAlpha(token: string | undefined): number | undefined {
  if (token === undefined) return undefined;
  return token.endsWith("%") ? parseFloat(token) / 100 : parseFloat(token);
}

function rgbToHex(r: number, g: number, b: number, alpha?: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, "0");
  const base = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  if (alpha === undefined || alpha >= 1) return base;
  return `${base}${toHex(Math.round(alpha * 255))}`;
}

// Standard HSL -> RGB conversion.
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const C = (1 - Math.abs(2 * L - 1)) * S;
  const Hp = (((h % 360) + 360) % 360) / 60;
  const X = C * (1 - Math.abs((Hp % 2) - 1));

  let [r1, g1, b1] = [0, 0, 0];
  if (Hp < 1) [r1, g1, b1] = [C, X, 0];
  else if (Hp < 2) [r1, g1, b1] = [X, C, 0];
  else if (Hp < 3) [r1, g1, b1] = [0, C, X];
  else if (Hp < 4) [r1, g1, b1] = [0, X, C];
  else if (Hp < 5) [r1, g1, b1] = [X, 0, C];
  else [r1, g1, b1] = [C, 0, X];

  const m = L - C / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

function normalizeFontSize(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

// Collapses whitespace and quote-style differences ("'Inter', sans-serif"
// vs "Inter,sans-serif") while preserving font name casing, since font
// names are conventionally cased and CSS family matching is effectively
// case-sensitive in practice for anything but the generic keywords.
function normalizeFontFamily(raw: string): string {
  return raw
    .split(",")
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
    .filter((part) => part.length > 0)
    .join(", ");
}

function normalizeSpacing(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  return trimmed === "0" ? "0px" : trimmed;
}
