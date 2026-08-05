import type { Page } from "playwright";

export type ExtractionErrorCode = "extraction_failed";

type StyleProp =
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
  styles: Record<StyleProp, string>;
};

export type RawData = {
  url: string;
  extractedAt: string;
  sampleCount: number;
  elements: ExtractedElement[];
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
