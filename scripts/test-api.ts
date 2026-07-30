// Integration check for POST /api/analyze/url and GET /api/analysis/[id]/status.
// Requires a dev server running (`pnpm dev`) in another terminal.
// Usage: pnpm test:api [baseUrl]

const baseUrl = process.argv[2] ?? "http://localhost:3000";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function main() {
  console.log(`Testing against ${baseUrl}`);

  // 1. Invalid request should be rejected before touching the DB.
  const invalidRes = await fetch(`${baseUrl}/api/analyze/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "not-a-url", provider: "openai", apiKey: "x" }),
  });
  assert(invalidRes.status === 400, `expected 400 for invalid url, got ${invalidRes.status}`);
  console.log("✓ invalid url rejected with 400");

  // 2. Valid request creates a row and returns { id }.
  const createRes = await fetch(`${baseUrl}/api/analyze/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://example.com",
      provider: "anthropic",
      apiKey: "test-key-not-a-real-secret",
    }),
  });
  assert(createRes.status === 200, `expected 200 from create, got ${createRes.status}`);
  const created = (await createRes.json()) as { id?: string };
  assert(typeof created.id === "string" && created.id.length > 0, "response missing id");
  console.log("✓ created analysis:", created.id);

  // 3. Status endpoint reflects the not-yet-implemented stub.
  const statusRes = await fetch(`${baseUrl}/api/analysis/${created.id}/status`);
  assert(statusRes.status === 200, `expected 200 from status, got ${statusRes.status}`);
  const status = (await statusRes.json()) as {
    status?: string;
    errorMessage?: string;
  };
  assert(status.status === "failed", `expected status "failed", got ${status.status}`);
  assert(
    status.errorMessage === "Not yet implemented",
    `expected stub errorMessage, got ${status.errorMessage}`,
  );
  console.log("✓ status endpoint returned the expected stub result:", status);

  // 4. Unknown id returns 404.
  const notFoundRes = await fetch(`${baseUrl}/api/analysis/does-not-exist/status`);
  assert(notFoundRes.status === 404, `expected 404 for unknown id, got ${notFoundRes.status}`);
  console.log("✓ unknown id returns 404");

  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
