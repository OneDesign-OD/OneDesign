// Verifies the full load -> screenshot -> extract -> interpret -> generate
// chain against real URLs. The 3 regression cases (simple static site,
// JS-heavy site, nonexistent domain) use a deliberately fake API key, so a
// healthy run is expected to fail at the AI step with errorCode
// "invalid_api_key" — that proves load/screenshot/extraction succeeded and
// only the (intentionally fake) key was rejected. Pass a real provider +
// API key as extra args to additionally run one true end-to-end case that
// reaches status "complete" and prints the generated markdown — run this
// part yourself with your own key rather than pasting it into a shared
// conversation.
// Requires a dev server running (`pnpm dev`) with BLOB_READ_WRITE_TOKEN set.
// Usage: pnpm test:pipeline [baseUrl] [openai|anthropic] [realApiKey]
export {};

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const realProvider = process.argv[3];
const realApiKey = process.argv[4];

type StatusResponse = {
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  screenshotUrl: string | null;
  markdown: string | null;
};

async function createAnalysis(
  url: string,
  provider: string,
  apiKey: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/analyze/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, provider, apiKey }),
  });
  if (res.status !== 200) {
    throw new Error(`create failed for ${url}: ${res.status} ${await res.text()}`);
  }
  const { id } = (await res.json()) as { id: string };
  return id;
}

async function pollUntilTerminal(
  id: string,
  timeoutMs = 45_000,
): Promise<StatusResponse> {
  const terminal = new Set(["complete", "failed"]);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${baseUrl}/api/analysis/${id}/status`);
    const status = (await res.json()) as StatusResponse;
    if (terminal.has(status.status)) return status;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`timed out waiting for ${id} to reach a terminal status`);
}

async function runCase(
  label: string,
  url: string,
  provider = "anthropic",
  apiKey = "test-key-not-a-real-secret",
) {
  console.log(`\n--- ${label}: ${url} ---`);
  const id = await createAnalysis(url, provider, apiKey);
  const status = await pollUntilTerminal(id);
  console.log(status);
  return status;
}

async function main() {
  console.log(`Testing against ${baseUrl}`);

  const staticSite = await runCase("simple static site", "https://example.com");
  if (
    staticSite.status !== "failed" ||
    staticSite.errorCode !== "invalid_api_key" ||
    !staticSite.screenshotUrl
  ) {
    throw new Error(
      "expected static site to load/screenshot/extract successfully and fail only at the AI step with errorCode invalid_api_key",
    );
  }
  console.log(
    "✓ static site loaded, screenshotted, extracted, and correctly rejected the fake key",
  );

  const jsSite = await runCase("JS-heavy site", "https://nextjs.org");
  if (
    jsSite.status !== "failed" ||
    jsSite.errorCode !== "invalid_api_key" ||
    !jsSite.screenshotUrl
  ) {
    throw new Error(
      "expected JS-heavy site to load/screenshot/extract successfully and fail only at the AI step with errorCode invalid_api_key",
    );
  }
  console.log(
    "✓ JS-heavy site loaded, screenshotted, extracted, and correctly rejected the fake key",
  );

  const badSite = await runCase(
    "nonexistent domain",
    "https://this-domain-should-not-exist-onedesign-test.com",
  );
  if (badSite.status !== "failed" || !badSite.errorCode) {
    throw new Error("expected nonexistent domain to fail with an errorCode");
  }
  console.log(
    `✓ nonexistent domain failed as expected (errorCode: ${badSite.errorCode})`,
  );

  if (realProvider && realApiKey) {
    const complete = await runCase(
      "full chain with a real key",
      "https://nextjs.org",
      realProvider,
      realApiKey,
    );
    if (complete.status !== "complete" || !complete.markdown) {
      throw new Error(
        `expected full chain to reach status "complete" with markdown, got ${complete.status} (errorCode: ${complete.errorCode})`,
      );
    }
    console.log("✓ full chain reached status: complete");
    console.log("\n--- generated markdown ---");
    console.log(complete.markdown);
  } else {
    console.log(
      "\n(skipping full end-to-end case — pass [openai|anthropic] [realApiKey] to run it)",
    );
  }

  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
