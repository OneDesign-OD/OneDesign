// Verifies the Phase 3 load+screenshot pipeline against 3 real URLs:
// a simple static site, a JS-heavy site, and a nonexistent domain.
// Requires a dev server running (`pnpm dev`) with BLOB_READ_WRITE_TOKEN set.
// Usage: pnpm test:pipeline [baseUrl]
export {};

const baseUrl = process.argv[2] ?? "http://localhost:3000";

type StatusResponse = {
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  screenshotUrl: string | null;
  markdown: string | null;
};

async function createAnalysis(url: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/analyze/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      provider: "anthropic",
      apiKey: "test-key-not-a-real-secret",
    }),
  });
  if (res.status !== 200) {
    throw new Error(`create failed for ${url}: ${res.status} ${await res.text()}`);
  }
  const { id } = (await res.json()) as { id: string };
  return id;
}

async function pollUntilTerminal(id: string, timeoutMs = 30_000): Promise<StatusResponse> {
  const terminal = new Set(["extracting", "complete", "failed"]);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${baseUrl}/api/analysis/${id}/status`);
    const status = (await res.json()) as StatusResponse;
    if (terminal.has(status.status)) return status;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`timed out waiting for ${id} to reach a terminal status`);
}

async function runCase(label: string, url: string) {
  console.log(`\n--- ${label}: ${url} ---`);
  const id = await createAnalysis(url);
  const status = await pollUntilTerminal(id);
  console.log(status);
  return status;
}

async function main() {
  console.log(`Testing against ${baseUrl}`);

  const staticSite = await runCase("simple static site", "https://example.com");
  if (staticSite.status !== "extracting" || !staticSite.screenshotUrl) {
    throw new Error("expected static site to succeed with a screenshotUrl");
  }
  console.log("✓ static site loaded and screenshotted");

  const jsSite = await runCase("JS-heavy site", "https://nextjs.org");
  if (jsSite.status !== "extracting" || !jsSite.screenshotUrl) {
    throw new Error("expected JS-heavy site to succeed with a screenshotUrl");
  }
  console.log("✓ JS-heavy site loaded and screenshotted");

  const badSite = await runCase(
    "nonexistent domain",
    "https://this-domain-should-not-exist-onedesign-test.com",
  );
  if (badSite.status !== "failed" || !badSite.errorCode) {
    throw new Error("expected nonexistent domain to fail with an errorCode");
  }
  console.log(`✓ nonexistent domain failed as expected (errorCode: ${badSite.errorCode})`);

  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
