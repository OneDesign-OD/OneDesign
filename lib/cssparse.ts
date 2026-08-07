import postcss from "postcss";
import valueParser from "postcss-value-parser";
import type { CandidateFile } from "@/lib/github";
import { fetchFileContent } from "@/lib/github";

export type ExtractedValues = {
  colors: string[];
  fontSizes: string[];
  fontFamilies: string[];
  spacing: string[];
};

function emptyExtractedValues(): ExtractedValues {
  return { colors: [], fontSizes: [], fontFamilies: [], spacing: [] };
}

const SPACING_PROPERTIES = new Set([
  "margin",
  "padding",
  "gap",
  "row-gap",
  "column-gap",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
]);

const HEX_COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;
const COLOR_FUNCTION_NAMES = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
]);
const LENGTH_TOKEN_PATTERN =
  /^-?\d*\.?\d+(px|rem|em|%|vh|vw|vmin|vmax|pt|pc|cm|mm|in|ch|ex|fr)$/i;

/**
 * Parses a plain-CSS-subset stylesheet (works for CSS and the common ground
 * of SCSS/Sass syntax — full Sass-specific constructs like `@each`/`@mixin`
 * aren't understood and will make postcss throw, in which case this returns
 * empty rather than failing; a file postcss can't parse is skipped, not
 * fatal) and pulls out declared color, font-size, font-family, and spacing
 * values. Pure parsing — no AI calls.
 */
export function extractValuesFromCss(cssText: string): ExtractedValues {
  const result = emptyExtractedValues();

  let root;
  try {
    root = postcss.parse(cssText);
  } catch {
    return result;
  }

  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();

    result.colors.push(...extractColorTokens(decl.value));

    if (prop === "font-size") {
      result.fontSizes.push(decl.value.trim());
    } else if (prop === "font-family") {
      result.fontFamilies.push(decl.value.trim());
    } else if (SPACING_PROPERTIES.has(prop)) {
      result.spacing.push(...extractLengthTokens(decl.value));
    }
  });

  return result;
}

// Scans a declaration's value for color-shaped tokens regardless of which
// property it came from — this naturally handles shorthand properties
// (`border: 1px solid #333`, `box-shadow: 0 2px 4px rgba(0,0,0,.1)`) without
// needing to maintain an exhaustive list of "color-ish" property names.
function extractColorTokens(value: string): string[] {
  const found: string[] = [];
  valueParser(value).walk((node) => {
    if (node.type === "word" && HEX_COLOR_PATTERN.test(node.value)) {
      found.push(node.value.toLowerCase());
    } else if (node.type === "function" && COLOR_FUNCTION_NAMES.has(node.value.toLowerCase())) {
      found.push(valueParser.stringify(node));
      return false; // don't also walk into the function's own arguments
    }
  });
  return found;
}

function extractLengthTokens(value: string): string[] {
  const found: string[] = [];
  for (const node of valueParser(value).nodes) {
    if (node.type !== "word") continue;
    if (node.value === "0" || LENGTH_TOKEN_PATTERN.test(node.value)) {
      found.push(node.value.toLowerCase());
    }
  }
  return found;
}

// Cheap heuristic scan (not a JS/TS parser) for styled-components-style
// tagged template literals: `styled.div\`...\``, `styled(Foo)\`...\``, and
// bare `css\`...\``. Deliberately simple per the task's own guidance — this
// will miss unusual CSS-in-JS patterns and can't handle a nested backtick
// inside an interpolation, but covers the overwhelming majority of real
// usage. `${...}` interpolations are replaced with a neutral placeholder so
// the surrounding text stays parseable as CSS syntax (we can't evaluate the
// JS expression statically, and don't need its actual value — only the
// literal CSS around it).
const CSS_IN_JS_TEMPLATE_PATTERN = /(?:styled(?:\.\w+|\([^)]*\))|\bcss)\s*`([\s\S]*?)`/g;
const TEMPLATE_INTERPOLATION_PATTERN = /\$\{[^}]*\}/g;

export function extractCssInJsSnippets(sourceText: string): string[] {
  const snippets: string[] = [];
  for (const match of sourceText.matchAll(CSS_IN_JS_TEMPLATE_PATTERN)) {
    snippets.push(match[1].replace(TEMPLATE_INTERPOLATION_PATTERN, "0"));
  }
  return snippets;
}

function mergeInto(target: ExtractedValues, source: ExtractedValues): void {
  target.colors.push(...source.colors);
  target.fontSizes.push(...source.fontSizes);
  target.fontFamilies.push(...source.fontFamilies);
  target.spacing.push(...source.spacing);
}

/**
 * Fetches one candidate file's content and extracts its declared values.
 * For a `stylesheet`, parses the whole file as CSS. For a
 * `css-in-js-candidate`, first confirms it actually contains a CSS-in-JS
 * tagged template (the Phase 1 filename heuristic is intentionally loose)
 * and extracts only from those template contents — returns null if the
 * file couldn't be fetched, or if a candidate turns out not to actually
 * contain CSS-in-JS syntax.
 */
export async function fetchAndParseCandidate(
  owner: string,
  repo: string,
  branch: string,
  file: CandidateFile,
): Promise<ExtractedValues | null> {
  const content = await fetchFileContent(owner, repo, branch, file.path);
  if (content === null) return null;

  if (file.kind === "stylesheet") {
    return extractValuesFromCss(content);
  }

  const snippets = extractCssInJsSnippets(content);
  if (snippets.length === 0) return null;

  const merged = emptyExtractedValues();
  for (const snippet of snippets) {
    mergeInto(merged, extractValuesFromCss(snippet));
  }
  return merged;
}
