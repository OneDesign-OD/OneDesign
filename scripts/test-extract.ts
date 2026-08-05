// Sanity-checks the Phase 1 computed-style extraction stage directly: loads
// a real URL with Playwright and runs extractComputedStyles over the live
// page, printing the resulting rawData shape. Runs in-process — no dev
// server or database required.
// Usage: pnpm test:extract [url]
import { loadPage } from "@/lib/browser";
import { extractComputedStyles } from "@/lib/extract";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function main() {
  const url = process.argv[2] ?? "https://nextjs.org";
  console.log(`Extracting computed styles from ${url}`);

  const result = await loadPage(url);
  assert(result.ok, `failed to load page: ${!result.ok ? result.errorMessage : ""}`);
  console.log("✓ page loaded");

  try {
    const extraction = await extractComputedStyles(result.page, url);
    assert(
      extraction.ok,
      `extraction failed: ${!extraction.ok ? extraction.errorMessage : ""}`,
    );

    const { data } = extraction;
    assert(data.elements.length > 0, "rawData.elements is empty");
    assert(
      data.sampleCount === data.elements.length,
      "sampleCount does not match elements.length",
    );
    assert(data.elements[0].label === "body", "first sampled element should be body");
    console.log(
      `✓ rawData shape looks correct (${data.elements.length} elements sampled)`,
    );

    console.log("\n--- rawData summary ---");
    console.log("url:", data.url);
    console.log("extractedAt:", data.extractedAt);
    console.log("sampleCount:", data.sampleCount);
    console.log(
      "labels:",
      data.elements.map((el) => el.label),
    );

    console.log("\n--- first 3 elements (full) ---");
    console.log(JSON.stringify(data.elements.slice(0, 3), null, 2));

    console.log("\nAll checks passed.");
  } finally {
    await result.browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
