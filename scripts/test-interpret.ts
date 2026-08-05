// Sanity-checks the Phase 3 AI interpretation stage directly against a real
// URL and a REAL AI provider API key. Runs in-process — no dev server or
// database required. The key is used only for this one call, never logged
// or written anywhere; run this yourself with your own key rather than
// pasting it into a shared conversation.
// Usage: pnpm test:interpret <openai|anthropic> <apiKey> [url]
import { loadPage } from "@/lib/browser";
import { extractComputedStyles } from "@/lib/extract";
import { interpretDesign, type Provider } from "@/lib/interpret";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function main() {
  const [, , providerArg, apiKey, urlArg] = process.argv;
  if ((providerArg !== "openai" && providerArg !== "anthropic") || !apiKey) {
    throw new Error("Usage: pnpm test:interpret <openai|anthropic> <apiKey> [url]");
  }
  const provider: Provider = providerArg;
  const url = urlArg ?? "https://nextjs.org";

  console.log(`Interpreting ${url} via ${provider}`);

  const result = await loadPage(url);
  assert(result.ok, `failed to load page: ${!result.ok ? result.errorMessage : ""}`);

  try {
    const extraction = await extractComputedStyles(result.page, url);
    assert(
      extraction.ok,
      `extraction failed: ${!extraction.ok ? extraction.errorMessage : ""}`,
    );
    console.log(`✓ extraction succeeded (${extraction.data.elements.length} elements)`);

    const interpretation = await interpretDesign(extraction.data, provider, apiKey);
    assert(
      interpretation.ok,
      `interpretation failed: ${
        !interpretation.ok
          ? `${interpretation.errorCode} — ${interpretation.errorMessage}`
          : ""
      }`,
    );
    assert(interpretation.data.tokens.length > 0, "no tokens were returned");
    console.log(`✓ interpretDesign returned ${interpretation.data.tokens.length} tokens`);

    console.log("\n--- tokens ---");
    console.log(JSON.stringify(interpretation.data.tokens, null, 2));

    console.log("\nAll checks passed.");
  } finally {
    await result.browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
