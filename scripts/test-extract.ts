// Sanity-checks the Phase 1 computed-style extraction stage: triggers a real
// analysis via the API, waits for it to reach `analyzing` (extraction done),
// then reads the row directly via Prisma and prints the shape of `rawData`.
// Requires a dev server running (`pnpm dev`) with BLOB_READ_WRITE_TOKEN and
// DATABASE_URL set.
// Usage: pnpm test:extract [baseUrl] [url]
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import type { RawData } from "@/lib/extract";

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
    const status = (await res.json()) as { status: string; errorCode: string | null };
    if (terminal.has(status.status)) return status.status;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timed out waiting for ${id} to reach a terminal status`);
}

async function main() {
  console.log(`Testing against ${baseUrl}, extracting ${targetUrl}`);

  const id = await createAnalysis(targetUrl);
  const status = await pollUntilTerminal(id);
  assert(status === "analyzing", `expected status "analyzing", got ${status}`);
  console.log("✓ pipeline reached status: analyzing");

  const row = await prisma.analysis.findUniqueOrThrow({ where: { id } });
  const rawData = row.rawData as unknown as RawData;

  assert(rawData, "rawData is null");
  assert(Array.isArray(rawData.elements), "rawData.elements is not an array");
  assert(rawData.elements.length > 0, "rawData.elements is empty");
  assert(
    rawData.sampleCount === rawData.elements.length,
    "sampleCount does not match elements.length",
  );
  assert(rawData.elements[0].label === "body", "first sampled element should be body");
  console.log(
    `✓ rawData shape looks correct (${rawData.elements.length} elements sampled)`,
  );

  console.log("\n--- rawData summary ---");
  console.log("url:", rawData.url);
  console.log("extractedAt:", rawData.extractedAt);
  console.log("sampleCount:", rawData.sampleCount);
  console.log(
    "labels:",
    rawData.elements.map((el) => el.label),
  );

  console.log("\n--- first 3 elements (full) ---");
  console.log(JSON.stringify(rawData.elements.slice(0, 3), null, 2));

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
