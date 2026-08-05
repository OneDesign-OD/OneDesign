// Sanity-checks the Phase 2 ambiguity-detection heuristics directly: loads a
// real URL, runs extraction, then runs detectAmbiguities over the result and
// prints the flags that would feed the Phase 3 AI prompt. Runs in-process —
// no dev server or database required.
// Usage: pnpm test:ambiguity [url]
import { loadPage } from "@/lib/browser";
import { extractComputedStyles } from "@/lib/extract";
import { detectAmbiguities } from "@/lib/ambiguity";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function main() {
  const url = process.argv[2] ?? "https://nextjs.org";
  console.log(`Analyzing ambiguities for ${url}`);

  const result = await loadPage(url);
  assert(result.ok, `failed to load page: ${!result.ok ? result.errorMessage : ""}`);

  try {
    const extraction = await extractComputedStyles(result.page, url);
    assert(
      extraction.ok,
      `extraction failed: ${!extraction.ok ? extraction.errorMessage : ""}`,
    );
    console.log("✓ extraction succeeded");

    const report = detectAmbiguities(extraction.data);
    assert(Array.isArray(report.flags), "report.flags is not an array");
    console.log(`✓ detectAmbiguities ran without error (${report.flags.length} flags)`);

    const byType = {
      duplicate_color: report.flags.filter((f) => f.type === "duplicate_color").length,
      spacing_outlier: report.flags.filter((f) => f.type === "spacing_outlier").length,
      typography_inconsistency: report.flags.filter(
        (f) => f.type === "typography_inconsistency",
      ).length,
    };
    console.log("counts by type:", byType);

    console.log("\n--- flags ---");
    console.log(JSON.stringify(report.flags, null, 2));

    console.log("\nAll checks passed.");
  } finally {
    await result.browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
