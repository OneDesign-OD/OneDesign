// Integration check for the image analysis pipeline, extended phase by
// phase as lib/pipeline.ts's runImageAnalysis grows.
//
// - Region detection (Phase 2) runs in-process against a synthetic sample
//   design (scripts/fixtures/sample-design.ts) — no dev server or database
//   required.
// - Upload infra (Phase 1) checks POST /api/analyze/image end to end: file
//   validation, Vercel Blob upload, and Analysis row creation. Requires a
//   dev server running (`pnpm dev`) with BLOB_READ_WRITE_TOKEN and
//   DATABASE_URL set.
//
// Usage: pnpm test:image-pipeline [baseUrl]
import sharp from "sharp";
import { detectRegions } from "@/lib/regions";
import { buildSampleDesignSvg, SAMPLE_DESIGN } from "./fixtures/sample-design";

const baseUrl = process.argv[2] ?? "http://localhost:3000";

// The canonical 1x1 transparent PNG — enough to exercise upload/validation
// without committing a binary fixture to the repo.
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

type StatusResponse = {
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  screenshotUrl: string | null;
  markdown: string | null;
};

function samplePngBlob(): Blob {
  return new Blob([Buffer.from(ONE_PIXEL_PNG_BASE64, "base64")], { type: "image/png" });
}

async function pollUntilStatusChanges(
  id: string,
  from: string,
  timeoutMs = 15_000,
): Promise<StatusResponse> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${baseUrl}/api/analysis/${id}/status`);
    const status = (await res.json()) as StatusResponse;
    if (status.status !== from) return status;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${id} to leave status "${from}"`);
}

async function testRegionDetection() {
  console.log("--- Phase 2: region detection (in-process, no server needed) ---");

  const svg = buildSampleDesignSvg();
  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  const result = await detectRegions(png);
  assert(result.ok, `region detection failed: ${!result.ok ? result.errorMessage : ""}`);

  const { regions } = result;
  const textRegions = regions.filter((r) => r.type === "text");
  const blockRegions = regions.filter((r) => r.type === "block");
  assert(textRegions.length > 0, "expected at least one text region");
  assert(blockRegions.length > 0, "expected at least one block region");
  console.log(
    `✓ detected ${regions.length} regions (${textRegions.length} text, ${blockRegions.length} block)`,
  );

  console.log("\nSample text regions:");
  for (const r of textRegions.slice(0, 8)) {
    console.log(`  ${JSON.stringify({ box: r.box, text: r.text, confidence: r.confidence })}`);
  }

  console.log("\nSample block regions (compare against ground truth below):");
  for (const r of blockRegions.slice(0, 8)) {
    console.log(`  ${JSON.stringify({ box: r.box })}`);
  }
  console.log("\nGround truth boxes:", JSON.stringify(SAMPLE_DESIGN.boxes));

  console.log("\n✓ region detection produced a sane result — sanity-check the boxes above\n");
}

async function testUploadInfra() {
  console.log(`--- Phase 1: upload infra (requires dev server at ${baseUrl}) ---`);

  // 1. Missing file should be rejected before touching the DB.
  const missingFileForm = new FormData();
  missingFileForm.append("provider", "anthropic");
  missingFileForm.append("apiKey", "test-key-not-a-real-secret");
  const missingFileRes = await fetch(`${baseUrl}/api/analyze/image`, {
    method: "POST",
    body: missingFileForm,
  });
  assert(
    missingFileRes.status === 400,
    `expected 400 for missing file, got ${missingFileRes.status}`,
  );
  console.log("✓ missing file rejected with 400");

  // 2. Wrong file type should be rejected.
  const badTypeForm = new FormData();
  badTypeForm.append("file", new Blob([Buffer.from("not an image")], { type: "text/plain" }), "notes.txt");
  badTypeForm.append("provider", "anthropic");
  badTypeForm.append("apiKey", "test-key-not-a-real-secret");
  const badTypeRes = await fetch(`${baseUrl}/api/analyze/image`, {
    method: "POST",
    body: badTypeForm,
  });
  assert(
    badTypeRes.status === 400,
    `expected 400 for wrong file type, got ${badTypeRes.status}`,
  );
  console.log("✓ non-image file rejected with 400");

  // 3. Valid upload creates a row, stores the blob, and kicks off the pipeline.
  const validForm = new FormData();
  validForm.append("file", samplePngBlob(), "sample.png");
  validForm.append("provider", "anthropic");
  validForm.append("apiKey", "test-key-not-a-real-secret");
  const createRes = await fetch(`${baseUrl}/api/analyze/image`, {
    method: "POST",
    body: validForm,
  });
  assert(createRes.status === 200, `expected 200 from create, got ${createRes.status}`);
  const created = (await createRes.json()) as { id?: string };
  assert(typeof created.id === "string" && created.id.length > 0, "response missing id");
  console.log("✓ created analysis:", created.id);

  const status = await pollUntilStatusChanges(created.id, "pending");
  assert(
    status.status === "extracting",
    `expected status to advance to "extracting", got ${status.status}`,
  );
  assert(
    typeof status.screenshotUrl === "string" && status.screenshotUrl.length > 0,
    "expected screenshotUrl to be set to the uploaded blob URL",
  );
  console.log("✓ analysis advanced to status: extracting, screenshotUrl set:", status.screenshotUrl);
}

async function main() {
  await testRegionDetection();
  await testUploadInfra();

  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
