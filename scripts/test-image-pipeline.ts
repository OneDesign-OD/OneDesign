// Integration check for the image analysis pipeline, extended phase by
// phase as lib/pipeline.ts's runImageAnalysis grows.
//
// - Region detection (Phase 2), color extraction (Phase 3), typography/
//   layout measurement + rawData assembly (Phase 4), ambiguity detection
//   (Phase 6, reusing lib/ambiguity.ts unmodified), and the font-family
//   guess's crop-selection (Phase 5) all run in-process against a synthetic
//   sample design (scripts/fixtures/sample-design.ts) — no dev server or
//   database required. Phase 5's actual AI call is exercised with a
//   deliberately fake key (same convention as test-pipeline.ts's URL-flow
//   checks): a healthy run reaches the provider and fails with
//   "invalid_api_key", proving crop-selection and request wiring work.
//   Pass a real provider + key as extra args to run the full call yourself.
// - Upload infra (Phase 1) checks POST /api/analyze/image end to end: file
//   validation, Vercel Blob upload, and Analysis row creation. Requires a
//   dev server running (`pnpm dev`) with BLOB_READ_WRITE_TOKEN and
//   DATABASE_URL set.
// - The full pipeline (Phase 7, lib/pipeline.ts's runImageAnalysis) is run
//   end to end through the real upload endpoint with the rich sample-design
//   image: region detection -> colors -> typography/layout -> rawData ->
//   font guess -> AI interpretation -> markdown. With a fake key it should
//   succeed through every pixel-math stage and fail only at AI
//   interpretation; pass a real key to see the actual generated markdown.
//
// Usage: pnpm test:image-pipeline [baseUrl] [openai|anthropic|google] [realApiKey]
import sharp from "sharp";
import { detectRegions, type Region } from "@/lib/regions";
import { extractColors, type RegionWithColors } from "@/lib/colors";
import { assembleImageRawData, type RawData } from "@/lib/extract";
import { guessFontFamily } from "@/lib/fontguess";
import { detectAmbiguities } from "@/lib/ambiguity";
import type { Provider } from "@/lib/interpret";
import { buildSampleDesignSvg, SAMPLE_DESIGN } from "./fixtures/sample-design";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const realProvider = process.argv[3];
const realApiKey = process.argv[4];

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

async function pollUntilTerminal(id: string, timeoutMs = 45_000): Promise<StatusResponse> {
  const terminal = new Set(["complete", "failed"]);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${baseUrl}/api/analysis/${id}/status`);
    const status = (await res.json()) as StatusResponse;
    if (terminal.has(status.status)) return status;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timed out waiting for ${id} to reach a terminal status`);
}

async function renderSampleImage(): Promise<Buffer> {
  const svg = buildSampleDesignSvg();
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function testRegionDetection(png: Buffer): Promise<Region[]> {
  console.log("--- Phase 2: region detection (in-process, no server needed) ---");

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
  return regions;
}

async function testColorExtraction(png: Buffer, regions: Region[]): Promise<RegionWithColors[]> {
  console.log("--- Phase 3: color extraction (in-process, no server needed) ---");

  const result = await extractColors(png, regions);
  assert(result.ok, `color extraction failed: ${!result.ok ? result.errorMessage : ""}`);

  assert(
    result.regions.every((r) => Array.isArray(r.colors)),
    "expected every region to have a colors array",
  );
  console.log(`✓ extracted colors for ${result.regions.length} regions`);

  console.log("\nColors per region (compare against ground truth below):");
  for (const r of result.regions) {
    console.log(`  ${JSON.stringify({ type: r.type, box: r.box, text: r.text, colors: r.colors })}`);
  }
  console.log("\nGround truth colors:", JSON.stringify(SAMPLE_DESIGN.colors));

  console.log("\n✓ color extraction produced a sane result — sanity-check the colors above\n");
  return result.regions;
}

async function testRawDataAssembly(
  png: Buffer,
  regions: RegionWithColors[],
): Promise<RawData> {
  console.log("--- Phase 4: typography/layout measurement + rawData assembly (in-process) ---");

  const result = await assembleImageRawData("test://sample-design", png, regions);
  assert(result.ok, `rawData assembly failed: ${!result.ok ? result.errorMessage : ""}`);

  assert(result.data.elements.length === regions.length, "expected one element per region");
  console.log(`✓ assembled rawData with ${result.data.elements.length} elements`);

  console.log("\nFull assembled rawData:");
  console.log(JSON.stringify(result.data, null, 2));

  console.log("\n✓ rawData assembly produced a sane result — sanity-check the values above\n");
  return result.data;
}

async function testAmbiguityDetection(rawData: RawData) {
  console.log("--- Phase 6: ambiguity detection (reusing the URL flow's logic, unmodified) ---");

  const report = detectAmbiguities(rawData);
  console.log(`✓ detectAmbiguities ran without error (${report.flags.length} flags)`);

  const counts: Record<string, number> = {};
  for (const flag of report.flags) counts[flag.type] = (counts[flag.type] ?? 0) + 1;
  console.log("counts by type:", counts);

  console.log("\nFlags (expect some natural noise from pixel-derived data):");
  console.log(JSON.stringify(report.flags, null, 2));

  console.log("\n✓ ambiguity detection produced a sane result — sanity-check the flags above\n");
}

async function testFontGuess(png: Buffer, regions: Region[]) {
  console.log("--- Phase 5: font-family guess (crop selection in-process, AI call live) ---");

  const fakeKeyResult = await guessFontFamily(png, regions, "anthropic", "test-key-not-a-real-secret");
  assert(
    !fakeKeyResult.ok && fakeKeyResult.errorCode === "invalid_api_key",
    `expected a fake key to reach the provider and fail with "invalid_api_key", got: ${JSON.stringify(fakeKeyResult)}`,
  );
  console.log("✓ crop selection ran and the fake key was correctly rejected by the provider");

  if (realProvider && realApiKey) {
    const realResult = await guessFontFamily(png, regions, realProvider as Provider, realApiKey);
    assert(
      realResult.ok,
      `expected the real key to succeed, got errorCode: ${!realResult.ok ? realResult.errorCode : ""}`,
    );
    console.log("✓ real font-family guess:", JSON.stringify(realResult.guess));
  } else {
    console.log(
      "(skipping the real AI call — pass [openai|anthropic|google] [realApiKey] to run it)",
    );
  }

  console.log();
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

async function testFullPipeline(png: Buffer) {
  console.log(`--- Phase 7: full pipeline end-to-end (requires dev server at ${baseUrl}) ---`);

  // A deliberately fake key: a healthy run should sail through region
  // detection, color extraction, typography/layout measurement, and the
  // font-family guess (which fails open, non-fatally), then fail at AI
  // interpretation with "invalid_api_key" — proving the whole chain up to
  // that boundary works, without needing a real key.
  const fakeForm = new FormData();
  fakeForm.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "sample-design.png");
  fakeForm.append("provider", "anthropic");
  fakeForm.append("apiKey", "test-key-not-a-real-secret");
  const fakeCreateRes = await fetch(`${baseUrl}/api/analyze/image`, {
    method: "POST",
    body: fakeForm,
  });
  assert(fakeCreateRes.status === 200, `expected 200 from create, got ${fakeCreateRes.status}`);
  const { id: fakeId } = (await fakeCreateRes.json()) as { id: string };
  const fakeStatus = await pollUntilTerminal(fakeId);
  assert(
    fakeStatus.status === "failed" && fakeStatus.errorCode === "invalid_api_key",
    `expected the full chain to fail only at AI interpretation with "invalid_api_key", got: ${JSON.stringify(fakeStatus)}`,
  );
  console.log(
    "✓ full chain (region detection -> colors -> typography/layout -> font guess -> ...) succeeded, correctly rejected only at AI interpretation",
  );

  if (realProvider && realApiKey) {
    const realForm = new FormData();
    realForm.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "sample-design.png");
    realForm.append("provider", realProvider);
    realForm.append("apiKey", realApiKey);
    const realCreateRes = await fetch(`${baseUrl}/api/analyze/image`, {
      method: "POST",
      body: realForm,
    });
    assert(realCreateRes.status === 200, `expected 200 from create, got ${realCreateRes.status}`);
    const { id: realId } = (await realCreateRes.json()) as { id: string };
    const realStatus = await pollUntilTerminal(realId);
    assert(
      realStatus.status === "complete" && !!realStatus.markdown,
      `expected the full chain to reach status "complete" with markdown, got ${realStatus.status} (errorCode: ${realStatus.errorCode})`,
    );
    console.log("✓ full chain reached status: complete");
    console.log("\n--- generated markdown ---");
    console.log(realStatus.markdown);
  } else {
    console.log(
      "\n(skipping the real end-to-end run — pass [openai|anthropic|google] [realApiKey] to see actual markdown output)",
    );
  }
}

async function main() {
  const png = await renderSampleImage();
  const regions = await testRegionDetection(png);
  const coloredRegions = await testColorExtraction(png, regions);
  const rawData = await testRawDataAssembly(png, coloredRegions);
  await testAmbiguityDetection(rawData);
  await testFontGuess(png, regions);
  await testUploadInfra();
  await testFullPipeline(png);

  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
