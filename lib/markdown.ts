import type { AiOutput, DesignToken } from "@/lib/interpret";

export type MarkdownErrorCode = "markdown_generation_failed";

export type MarkdownResult =
  | { ok: true; markdown: string }
  | { ok: false; errorCode: MarkdownErrorCode; errorMessage: string };

const CATEGORY_ORDER: DesignToken["category"][] = [
  "color",
  "typography",
  "spacing",
  "layout",
];

const SECTION_TITLES: Record<DesignToken["category"], string> = {
  color: "Colors",
  typography: "Typography",
  spacing: "Spacing",
  layout: "Layout Patterns",
};

/**
 * Formats the Phase 3 `aiOutput` into a readable DESIGN.md. Tokens are
 * already validated by the Phase 3 zod schema, so failures here are only
 * unexpected/defensive — not part of the normal control flow.
 */
export function generateMarkdown(url: string, aiOutput: AiOutput): MarkdownResult {
  try {
    const lines: string[] = ["# DESIGN.md", "", `Generated from [${url}](${url}).`, ""];

    for (const category of CATEGORY_ORDER) {
      const tokens = aiOutput.tokens.filter((token) => token.category === category);
      if (tokens.length === 0) continue;

      lines.push(`## ${SECTION_TITLES[category]}`, "");
      lines.push("| Token | Value | Notes |", "| --- | --- | --- |");
      for (const token of tokens) {
        lines.push(
          `| ${escapeCell(token.name)} | \`${escapeCell(token.value)}\` | ${escapeCell(token.rationale)} |`,
        );
      }
      lines.push("");
    }

    return { ok: true, markdown: lines.join("\n").trimEnd() + "\n" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errorCode: "markdown_generation_failed",
      errorMessage: `Failed to generate markdown: ${message}`,
    };
  }
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
