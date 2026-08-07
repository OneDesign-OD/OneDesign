import type { Page } from "playwright";
import sharp from "sharp";
import type { RegionWithColors } from "@/lib/colors";
import {
  estimateFontSize,
  estimateFontWeight,
  estimateLetterSpacing,
  computeLineHeights,
} from "@/lib/typography";
import { computeSpacing, detectLayoutGroups, type LayoutHint } from "@/lib/layout";
import type { GithubErrorCode } from "@/lib/github";
import type { RankedValue, RankedValues } from "@/lib/rank";

export type ExtractionErrorCode = "extraction_failed";

export type StyleProp =
  | "color"
  | "backgroundColor"
  | "borderColor"
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "lineHeight"
  | "letterSpacing"
  | "margin"
  | "padding"
  | "gap"
  | "display"
  | "flexDirection"
  | "gridTemplateColumns"
  | "position";

export type ExtractedElement = {
  label: string;
  tag: string;
  // Partial rather than a full Record: the URL pipeline's getComputedStyle()
  // always populates every prop, but the image pipeline can only report
  // what it actually measured from pixels (e.g. no pixel equivalent of
  // "position: relative") — omitting a prop is more honest than fabricating
  // one. Consumers (ambiguity.ts, interpret.ts) already treat missing/falsy
  // values as "no data" rather than assuming presence.
  styles: Partial<Record<StyleProp, string>>;
  // Only present for the GitHub pipeline: how many times this exact
  // (normalized) value appeared across the repo's stylesheets — the "measure
  // first" signal for how likely a value is to be an intentional design
  // token vs. a one-off. Absent for URL/image elements, which don't have a
  // meaningful frequency (each element is one sampled DOM node/region, not
  // an aggregated value).
  usageCount?: number;
};

// A best-guess, not a measurement — see lib/fontguess.ts. Kept as its own
// top-level field (rather than folded into an element's `fontFamily` style)
// so downstream stages and the final markdown can't mistake it for a
// pixel-measured fact the way the rest of `styles` is.
export type FontFamilyGuess = {
  value: string;
  confidence: "estimated";
};

export type RawData = {
  url: string;
  extractedAt: string;
  sampleCount: number;
  elements: ExtractedElement[];
  fontFamilyGuess?: FontFamilyGuess;
};

export type ExtractResult =
  | { ok: true; data: RawData }
  | { ok: false; errorCode: ExtractionErrorCode; errorMessage: string };

const MAX_ELEMENTS = 40;

/**
 * Samples a fixed set of DOM elements from the already-loaded `page` and
 * pulls their computed styles via `getComputedStyle()`. Runs entirely
 * in-browser via `page.evaluate()` — no screenshot/vision inference.
 */
export async function extractComputedStyles(
  page: Page,
  url: string,
): Promise<ExtractResult> {
  try {
    const elements = await page.evaluate(sampleDom, MAX_ELEMENTS);

    if (elements.length === 0) {
      return {
        ok: false,
        errorCode: "extraction_failed",
        errorMessage: "No elements could be sampled from the page.",
      };
    }

    return {
      ok: true,
      data: {
        url,
        extractedAt: new Date().toISOString(),
        sampleCount: elements.length,
        elements,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errorCode: "extraction_failed",
      errorMessage: `Failed to extract computed styles: ${message}`,
    };
  }
}

const MAX_LABEL_TEXT_LENGTH = 40;

/**
 * Assembles Phase 2-4's region + color + typography + layout data into the
 * same `RawData` shape `extractComputedStyles` produces for the URL flow,
 * so ambiguity-detection and AI-interpretation can run unmodified. Pure
 * pixel math (plus the k-means clustering already done in Phase 3) — no AI
 * calls in this function.
 */
export async function assembleImageRawData(
  imageUrl: string,
  imageBuffer: Buffer,
  regions: RegionWithColors[],
): Promise<ExtractResult> {
  try {
    if (regions.length === 0) {
      return {
        ok: false,
        errorCode: "extraction_failed",
        errorMessage: "No regions were detected to assemble into elements.",
      };
    }

    const { data, info } = await sharp(imageBuffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const textRegions = regions.filter((r) => r.type === "text");
    const lineHeights = computeLineHeights(textRegions);
    const spacing = computeSpacing(regions);
    const layoutHints = detectLayoutGroups(regions);

    const elements = regions.map((region) =>
      buildElement(region, {
        pixels: data,
        imageWidth: info.width,
        imageHeight: info.height,
        channels: info.channels,
        lineHeightPx: lineHeights.get(region),
        gapPx: spacing.get(region),
        layoutHint: layoutHints.get(region),
      }),
    );

    return {
      ok: true,
      data: {
        url: imageUrl,
        extractedAt: new Date().toISOString(),
        sampleCount: elements.length,
        elements,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errorCode: "extraction_failed",
      errorMessage: `Failed to assemble image raw data: ${message}`,
    };
  }
}

function buildElement(
  region: RegionWithColors,
  context: {
    pixels: Buffer;
    imageWidth: number;
    imageHeight: number;
    channels: number;
    lineHeightPx: number | undefined;
    gapPx: number | undefined;
    layoutHint: LayoutHint | undefined;
  },
): ExtractedElement {
  const styles: Partial<Record<StyleProp, string>> = {};

  // colors[0] is the region's dominant cluster — for a block that's its
  // fill; for a text line it's usually the background around the glyphs
  // (see lib/colors.ts). colors[1], when present, is the minority cluster —
  // for text that's the closest available signal for glyph/ink color.
  if (region.colors[0]) styles.backgroundColor = rgbString(region.colors[0]);
  if (region.type === "text" && region.colors[1]) {
    styles.color = rgbString(region.colors[1]);
  }

  if (region.type === "text" && region.text) {
    const fontSize = estimateFontSize(region);
    if (fontSize !== undefined) {
      styles.fontSize = `${fontSize}px`;
      styles.letterSpacing = `${estimateLetterSpacing(region.text, region.box.width, fontSize)}px`;
    }

    const fontWeight = estimateFontWeight(
      context.pixels,
      context.imageWidth,
      context.imageHeight,
      context.channels,
      region,
      fontSize,
    );
    if (fontWeight !== undefined) styles.fontWeight = fontWeight;

    if (context.lineHeightPx !== undefined) styles.lineHeight = `${context.lineHeightPx}px`;
  }

  if (context.gapPx !== undefined) styles.gap = `${context.gapPx}px`;
  if (context.layoutHint) {
    styles.display = context.layoutHint.display;
    styles.flexDirection = context.layoutHint.flexDirection;
  }

  return {
    label: labelFor(region),
    tag: region.type,
    styles,
  };
}

function labelFor(region: RegionWithColors): string {
  if (region.type === "text" && region.text) {
    const truncated =
      region.text.length > MAX_LABEL_TEXT_LENGTH
        ? `${region.text.slice(0, MAX_LABEL_TEXT_LENGTH)}…`
        : region.text;
    return `text "${truncated}"`;
  }
  return `block (${region.box.width}×${region.box.height})`;
}

function rgbString(hex: string): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

export type AssembleGithubRawDataResult =
  | { ok: true; data: RawData }
  | { ok: false; errorCode: GithubErrorCode; errorMessage: string };

/**
 * Turns Phase 3's frequency-ranked values into the same `RawData` shape the
 * other two pipelines produce — each ranked value becomes one element, with
 * `usageCount` carrying the frequency signal ambiguity-detection and AI
 * interpretation can reason about. Pure assembly — no AI calls.
 */
export function assembleGithubRawData(
  repoUrl: string,
  ranked: RankedValues,
): AssembleGithubRawDataResult {
  const elements: ExtractedElement[] = [
    ...ranked.colors.map((r) => rankedValueToElement("color", "color", r)),
    ...ranked.fontSizes.map((r) => rankedValueToElement("font-size", "fontSize", r)),
    ...ranked.fontFamilies.map((r) => rankedValueToElement("font-family", "fontFamily", r)),
    ...ranked.spacing.map((r) => rankedValueToElement("spacing", "gap", r)),
  ];

  if (elements.length === 0) {
    return {
      ok: false,
      errorCode: "no_styles_found",
      errorMessage:
        "No usable color, font-size, font-family, or spacing values were found across the repo's stylesheets.",
    };
  }

  return {
    ok: true,
    data: {
      url: repoUrl,
      extractedAt: new Date().toISOString(),
      sampleCount: elements.length,
      elements,
    },
  };
}

function rankedValueToElement(
  category: string,
  styleProp: StyleProp,
  ranked: RankedValue,
): ExtractedElement {
  return {
    label: `${category} ${ranked.value}`,
    tag: category,
    styles: { [styleProp]: ranked.value },
    usageCount: ranked.usageCount,
  };
}

/**
 * Executed inside the browser context by `page.evaluate()` — must be fully
 * self-contained (no references to Node-side scope other than `maxElements`).
 *
 * Helpers are grouped as methods on a plain object rather than named
 * function/const declarations: esbuild's `keepNames` transform (used by
 * `tsx`, which runs the test scripts) wraps named function bindings in a
 * `__name()` call inserted into this function's own body, and that helper
 * isn't available when Playwright ships just this function's source to the
 * browser. Object-literal method shorthand isn't rewritten that way.
 */
function sampleDom(maxElements: number): ExtractedElement[] {
  const STYLE_PROPS: StyleProp[] = [
    "color",
    "backgroundColor",
    "borderColor",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "margin",
    "padding",
    "gap",
    "display",
    "flexDirection",
    "gridTemplateColumns",
    "position",
  ];

  const picked: ExtractedElement[] = [];
  const seen = new Set<Element>();

  const dom = {
    readStyles(el: Element): Record<StyleProp, string> {
      const computed = getComputedStyle(el);
      const styles = {} as Record<StyleProp, string>;
      for (const prop of STYLE_PROPS) {
        styles[prop] = computed[prop];
      }
      return styles;
    },
    isVisible(el: Element): boolean {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    },
    labelFor(el: Element, index: number, total: number, prefix?: string): string {
      const tag = el.tagName.toLowerCase();
      const cls = el.classList.length > 0 ? `.${el.classList[0]}` : "";
      const base = prefix ? `${prefix} ${tag}${cls}` : `${tag}${cls}`;
      return total > 1 ? `${base} (${index + 1} of ${total})` : base;
    },
    add(el: Element, label: string) {
      if (seen.has(el) || !dom.isVisible(el)) return;
      seen.add(el);
      picked.push({ label, tag: el.tagName.toLowerCase(), styles: dom.readStyles(el) });
    },
  };

  if (!document.body) return [];
  dom.add(document.body, "body");

  for (let level = 1; level <= 6; level++) {
    const headings = Array.from(document.querySelectorAll(`h${level}`))
      .filter((el) => dom.isVisible(el))
      .slice(0, 2);
    headings.forEach((el, i) => dom.add(el, dom.labelFor(el, i, headings.length)));
  }

  const nav = document.querySelector("nav");
  if (nav && dom.isVisible(nav)) {
    dom.add(nav, "nav");
    const navLinks = Array.from(nav.querySelectorAll("a"))
      .filter((el) => dom.isVisible(el))
      .slice(0, 4);
    navLinks.forEach((el, i) => dom.add(el, dom.labelFor(el, i, navLinks.length, "nav")));
  }

  const buttons = Array.from(
    document.querySelectorAll(
      'button, a[role="button"], input[type="submit"], input[type="button"]',
    ),
  )
    .filter((el) => dom.isVisible(el))
    .slice(0, 8);
  buttons.forEach((el, i) => dom.add(el, dom.labelFor(el, i, buttons.length)));

  const links = Array.from(document.querySelectorAll("a"))
    .filter((el) => dom.isVisible(el) && !seen.has(el))
    .slice(0, 6);
  links.forEach((el, i) => dom.add(el, dom.labelFor(el, i, links.length)));

  // Card/container-like: has a visible border, a shadow, or a background
  // color distinct from its parent's. Larger elements first; skip anything
  // nested inside an already-picked card to avoid redundant duplicates.
  const cardCandidates = Array.from(
    document.querySelectorAll("div, section, article, li, aside"),
  ).filter((el) => {
    if (!dom.isVisible(el) || seen.has(el)) return false;
    const style = getComputedStyle(el);
    const hasBorder = style.borderWidth !== "0px" && style.borderStyle !== "none";
    const hasShadow = style.boxShadow !== "none";
    const parentBg = el.parentElement
      ? getComputedStyle(el.parentElement).backgroundColor
      : null;
    const hasDistinctBg =
      style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      style.backgroundColor !== "transparent" &&
      style.backgroundColor !== parentBg;
    return hasBorder || hasShadow || hasDistinctBg;
  });

  cardCandidates.sort((a, b) => {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return br.width * br.height - ar.width * ar.height;
  });

  const cards: Element[] = [];
  for (const el of cardCandidates) {
    if (cards.length >= 10) break;
    if (cards.some((c) => c.contains(el) || el.contains(c))) continue;
    cards.push(el);
  }
  cards.forEach((el, i) => dom.add(el, dom.labelFor(el, i, cards.length, "card")));

  return picked.slice(0, maxElements);
}
