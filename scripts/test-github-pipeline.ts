// Integration check for the GitHub repo analysis pipeline, extended phase
// by phase as lib/pipeline.ts's runGithubAnalysis grows.
//
// - Candidate-file collection (Phase 1), stylesheet fetch/parse (Phase 2),
//   and tally/rank/rawData assembly (Phase 3) all run in-process against a
//   small, stable real public repo (necolas/normalize.css — a CSS reset
//   library, guaranteed to have real stylesheets and unlikely to ever
//   disappear or restructure) — no dev server or database required, just
//   real (unauthenticated) calls to the public GitHub API and
//   raw.githubusercontent.com.
// - Upload infra (Phase 1) checks POST /api/analyze/github end to end:
//   request validation and that a nonexistent repo correctly fails with
//   "repo_not_found" through the real pipeline.
// - The full pipeline (Phase 4, lib/pipeline.ts's runGithubAnalysis) is run
//   end to end through the real endpoint with the sample repo: candidate
//   collection -> fetch/parse -> rank/assemble -> AI interpretation ->
//   markdown. With a fake key it should succeed through every non-AI stage
//   and fail only at AI interpretation; pass a real provider + key as extra
//   args to see the actual generated markdown.
//   Both require a dev server running (`pnpm dev`) with DATABASE_URL set.
//
// Usage: pnpm test:github-pipeline [baseUrl] [repoUrl] [openai|anthropic|google] [realApiKey]
import { fetchCandidateFiles, parseGithubRepoUrl, type CandidateFile } from "@/lib/github";
import { fetchAndParseCandidate, type ExtractedValues } from "@/lib/cssparse";
import { rankExtractedValues } from "@/lib/rank";
import { assembleGithubRawData } from "@/lib/extract";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const sampleRepoUrl = process.argv[3] ?? "https://github.com/necolas/normalize.css";
const realProvider = process.argv[4];
const realApiKey = process.argv[5];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

type StatusResponse = {
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  markdown: string | null;
};

async function pollUntilTerminal(id: string, timeoutMs = 20_000): Promise<StatusResponse> {
  const terminal = new Set(["complete", "failed"]);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${baseUrl}/api/analysis/${id}/status`);
    const status = (await res.json()) as StatusResponse;
    if (terminal.has(status.status)) return status;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${id} to reach a terminal status`);
}

async function testCandidateFileCollection(): Promise<{
  owner: string;
  repo: string;
  branch: string;
  files: CandidateFile[];
}> {
  console.log(`--- Phase 1: candidate-file collection (in-process, real GitHub API) ---`);
  console.log(`Repo: ${sampleRepoUrl}`);

  const parsed = parseGithubRepoUrl(sampleRepoUrl);
  assert(parsed !== null, `failed to parse repo URL: ${sampleRepoUrl}`);
  console.log(`✓ parsed owner/repo: ${parsed.owner}/${parsed.repo}`);

  const result = await fetchCandidateFiles(parsed.owner, parsed.repo);
  assert(result.ok, `candidate file collection failed: ${!result.ok ? result.errorMessage : ""}`);

  assert(result.files.length > 0, "expected at least one candidate file");
  const stylesheets = result.files.filter((f) => f.kind === "stylesheet");
  assert(stylesheets.length > 0, "expected at least one real stylesheet file");
  console.log(
    `✓ found ${result.files.length} candidate files on branch "${result.branch}" (${stylesheets.length} stylesheets, ${result.files.length - stylesheets.length} CSS-in-JS candidates)`,
  );

  console.log("\nSample files:");
  for (const f of result.files.slice(0, 15)) {
    console.log(`  ${f.kind}: ${f.path}`);
  }

  // Bad repo: parses fine as a URL shape, but doesn't exist.
  const badResult = await fetchCandidateFiles(
    "this-org-should-not-exist-onedesign-test",
    "nope",
  );
  assert(
    !badResult.ok && badResult.errorCode === "repo_not_found",
    `expected a nonexistent repo to fail with "repo_not_found", got: ${JSON.stringify(badResult)}`,
  );
  console.log('✓ nonexistent repo correctly failed with "repo_not_found"');

  console.log();
  return { owner: parsed.owner, repo: parsed.repo, branch: result.branch, files: result.files };
}

async function testStylesheetParsing(
  owner: string,
  repo: string,
  branch: string,
  files: CandidateFile[],
): Promise<ExtractedValues> {
  console.log("--- Phase 2: fetch and parse stylesheets (in-process, real content fetch) ---");

  const totals: ExtractedValues = { colors: [], fontSizes: [], fontFamilies: [], spacing: [] };
  let filesParsed = 0;
  let filesSkipped = 0;

  for (const file of files) {
    const extracted = await fetchAndParseCandidate(owner, repo, branch, file);
    if (extracted === null) {
      filesSkipped++;
      continue;
    }
    filesParsed++;
    totals.colors.push(...extracted.colors);
    totals.fontSizes.push(...extracted.fontSizes);
    totals.fontFamilies.push(...extracted.fontFamilies);
    totals.spacing.push(...extracted.spacing);
  }

  assert(filesParsed > 0, "expected at least one candidate file to fetch and parse successfully");
  console.log(`✓ parsed ${filesParsed} file(s), skipped ${filesSkipped} (fetch failure or, for a CSS-in-JS candidate, no confirmed CSS-in-JS content)`);

  console.log("\nRaw extracted value counts by category:");
  console.log({
    colors: totals.colors.length,
    fontSizes: totals.fontSizes.length,
    fontFamilies: totals.fontFamilies.length,
    spacing: totals.spacing.length,
  });

  console.log("\nSample values per category:");
  console.log("  colors:", totals.colors.slice(0, 10));
  console.log("  fontSizes:", totals.fontSizes.slice(0, 10));
  console.log("  fontFamilies:", totals.fontFamilies.slice(0, 10));
  console.log("  spacing:", totals.spacing.slice(0, 10));

  console.log();
  return totals;
}

async function testRankingAndAssembly(repoUrl: string, totals: ExtractedValues) {
  console.log("--- Phase 3: tally, rank, and assemble rawData (in-process) ---");

  const ranked = rankExtractedValues(totals);
  console.log("Ranked counts by category:", {
    colors: ranked.colors.length,
    fontSizes: ranked.fontSizes.length,
    fontFamilies: ranked.fontFamilies.length,
    spacing: ranked.spacing.length,
  });

  const result = assembleGithubRawData(repoUrl, ranked);
  assert(result.ok, `rawData assembly failed: ${!result.ok ? result.errorMessage : ""}`);
  assert(
    result.data.elements.every((el) => typeof el.usageCount === "number"),
    "expected every element to have a usageCount",
  );
  console.log(`✓ assembled rawData with ${result.data.elements.length} elements, all with usageCount`);

  console.log("\nFull assembled rawData:");
  console.log(JSON.stringify(result.data, null, 2));

  console.log();
}

async function testUploadInfra() {
  console.log(`--- Phase 1: upload infra (requires dev server at ${baseUrl}) ---`);

  // 1. Invalid repoUrl shape should be rejected before touching the DB.
  const invalidRes = await fetch(`${baseUrl}/api/analyze/github`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repoUrl: "not-a-github-url",
      provider: "anthropic",
      apiKey: "test-key-not-a-real-secret",
    }),
  });
  assert(invalidRes.status === 400, `expected 400 for invalid repoUrl, got ${invalidRes.status}`);
  console.log("✓ invalid repoUrl rejected with 400");

  // 2. A repo that doesn't exist should reach "failed" with the right code.
  const badCreateRes = await fetch(`${baseUrl}/api/analyze/github`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repoUrl: "https://github.com/this-org-should-not-exist-onedesign-test/nope",
      provider: "anthropic",
      apiKey: "test-key-not-a-real-secret",
    }),
  });
  assert(badCreateRes.status === 200, `expected 200 from create, got ${badCreateRes.status}`);
  const badCreated = (await badCreateRes.json()) as { id: string };
  const badStatus = await pollUntilTerminal(badCreated.id);
  assert(
    badStatus.status === "failed" && badStatus.errorCode === "repo_not_found",
    `expected a nonexistent repo to fail with "repo_not_found", got: ${JSON.stringify(badStatus)}`,
  );
  console.log('✓ nonexistent repo correctly failed with "repo_not_found" through the full pipeline');
}

async function testFullPipeline() {
  console.log(`--- Phase 4: full pipeline end-to-end (requires dev server at ${baseUrl}) ---`);

  // A deliberately fake key: a healthy run should sail through candidate
  // collection, stylesheet fetch/parse, and ranking/assembly, then fail at
  // AI interpretation with "invalid_api_key" — proving the whole chain up
  // to that boundary works, without needing a real key.
  const fakeCreateRes = await fetch(`${baseUrl}/api/analyze/github`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repoUrl: sampleRepoUrl,
      provider: "anthropic",
      apiKey: "test-key-not-a-real-secret",
    }),
  });
  assert(fakeCreateRes.status === 200, `expected 200 from create, got ${fakeCreateRes.status}`);
  const { id: fakeId } = (await fakeCreateRes.json()) as { id: string };
  const fakeStatus = await pollUntilTerminal(fakeId);
  assert(
    fakeStatus.status === "failed" && fakeStatus.errorCode === "invalid_api_key",
    `expected the full chain to fail only at AI interpretation with "invalid_api_key", got: ${JSON.stringify(fakeStatus)}`,
  );
  console.log(
    "✓ full chain (candidate collection -> fetch/parse -> rank/assemble -> ...) succeeded, correctly rejected only at AI interpretation",
  );

  if (realProvider && realApiKey) {
    const realCreateRes = await fetch(`${baseUrl}/api/analyze/github`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl: sampleRepoUrl, provider: realProvider, apiKey: realApiKey }),
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
      "\n(skipping the real end-to-end run — pass [openai|anthropic|google] [realApiKey] as extra args to see actual markdown output)",
    );
  }
}

async function main() {
  const { owner, repo, branch, files } = await testCandidateFileCollection();
  const totals = await testStylesheetParsing(owner, repo, branch, files);
  await testRankingAndAssembly(sampleRepoUrl, totals);
  await testUploadInfra();
  await testFullPipeline();

  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
