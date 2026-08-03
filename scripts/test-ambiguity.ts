// Sanity-checks the Phase 2 ambiguity-detection heuristics: triggers a real
// analysis via the API, waits for extraction to finish, reads `rawData`
// directly via Prisma, and runs `detectAmbiguities` over it to print the
// flags that would feed the Phase 3 AI prompt.
// Requires a dev server running (`pnpm dev`) with BLOB_READ_WRITE_TOKEN and
// DATABASE_URL set.
// Usage: pnpm test:ambiguity [baseUrl] [url]
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import type { RawData } from "@/lib/extract";
import { detectAmbiguities } from "@/lib/ambiguity";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const targetUrl = process.argv[3] ?? "https://nextjs.org";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

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

async function pollUntilTerminal(id: string, timeoutMs = 30_000): Promise<string> {
  const terminal = new Set(["analyzing", "failed"]);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${baseUrl}/api/analysis/${id}/status`);
    const status = (await res.json()) as { status: string };
    if (terminal.has(status.status)) return status.status;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timed out waiting for ${id} to reach a terminal status`);
}

async function main() {
  console.log(`Testing against ${baseUrl}, analyzing ${targetUrl}`);

  const id = await createAnalysis(targetUrl);
  const status = await pollUntilTerminal(id);
  assert(status === "analyzing", `expected status "analyzing", got ${status}`);
  console.log("✓ pipeline reached status: analyzing");

  const row = await prisma.analysis.findUniqueOrThrow({ where: { id } });
  const rawData = row.rawData as unknown as RawData;
  assert(rawData, "rawData is null");

  const report = detectAmbiguities(rawData);
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
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
