import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";

export type GithubErrorCode =
  | "repo_not_found"
  | "github_rate_limited"
  | "no_styles_found"
  | "github_api_error";

export type CandidateFileKind = "stylesheet" | "css-in-js-candidate";

export type CandidateFile = {
  path: string;
  kind: CandidateFileKind;
};

export type FetchCandidatesResult =
  | { ok: true; branch: string; files: CandidateFile[] }
  | { ok: false; errorCode: GithubErrorCode; errorMessage: string };

const GITHUB_REPO_URL_PATTERN =
  /^https:\/\/github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)\/([a-zA-Z0-9._-]+?)(?:\.git)?\/?$/;

export function parseGithubRepoUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(GITHUB_REPO_URL_PATTERN);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

const STYLESHEET_PATTERN = /\.(css|scss|sass)$/i;
const CODE_PATTERN = /\.(jsx?|tsx?)$/i;
// Cheap, no-fetch heuristic for CSS-in-JS candidates: styled-components and
// similar libraries are overwhelmingly authored in files whose name signals
// styling intent (Button.styles.tsx, styled.ts, GlobalStyle.tsx, theme.ts).
// This trades recall (a component with an inline `styled.div` call in an
// otherwise unremarkably-named file won't be caught) for staying within a
// sane number of content fetches — checking every .js/.ts file's content in
// a large repo isn't practical. Phase 2 fetches each candidate's actual
// content and confirms the pattern really is CSS-in-JS before extracting
// anything from it.
const CSS_IN_JS_FILENAME_HINT = /style/i;

const MAX_CANDIDATE_FILES = 200;

/**
 * Fetches the repo's file tree (one recursive call) and filters it down to
 * candidate stylesheet / likely-CSS-in-JS files, capped at
 * MAX_CANDIDATE_FILES with real stylesheets prioritized over heuristic
 * CSS-in-JS candidates. Only two GitHub REST API calls total (repo lookup +
 * tree fetch) — well within the unauthenticated rate limit (60/hour)
 * regardless of repo size. Actual file content is fetched separately in
 * Phase 2 via the raw.githubusercontent.com CDN, which isn't subject to
 * that same quota.
 */
export async function fetchCandidateFiles(
  owner: string,
  repo: string,
): Promise<FetchCandidatesResult> {
  const octokit = new Octokit();

  try {
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    const branch = repoData.default_branch;

    const { data: treeData } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: "true",
    });

    const stylesheets: CandidateFile[] = [];
    const cssInJsCandidates: CandidateFile[] = [];

    for (const entry of treeData.tree) {
      if (entry.type !== "blob" || !entry.path) continue;

      if (STYLESHEET_PATTERN.test(entry.path)) {
        stylesheets.push({ path: entry.path, kind: "stylesheet" });
      } else if (CODE_PATTERN.test(entry.path) && CSS_IN_JS_FILENAME_HINT.test(entry.path)) {
        cssInJsCandidates.push({ path: entry.path, kind: "css-in-js-candidate" });
      }
    }

    // Real stylesheets are guaranteed-relevant; fill any remaining budget
    // with heuristic CSS-in-JS candidates rather than letting them crowd
    // out actual CSS files in a repo with many of both.
    const files = [...stylesheets, ...cssInJsCandidates].slice(0, MAX_CANDIDATE_FILES);

    if (files.length === 0) {
      return {
        ok: false,
        errorCode: "no_styles_found",
        errorMessage: "No stylesheet or likely CSS-in-JS files were found in this repository.",
      };
    }

    return { ok: true, branch, files };
  } catch (err) {
    return { ok: false, ...classifyGithubError(err) };
  }
}

function classifyGithubError(err: unknown): {
  errorCode: GithubErrorCode;
  errorMessage: string;
} {
  if (err instanceof RequestError) {
    if (err.status === 404) {
      return {
        errorCode: "repo_not_found",
        errorMessage: "Repository not found — it may be private, deleted, or misspelled.",
      };
    }

    const remaining = err.response?.headers?.["x-ratelimit-remaining"];
    if (err.status === 429 || (err.status === 403 && remaining === "0")) {
      return {
        errorCode: "github_rate_limited",
        errorMessage: "Hit GitHub's API rate limit. Try again later.",
      };
    }

    console.error(`[github] API returned ${err.status}:`, err.message);
    return {
      errorCode: "github_api_error",
      errorMessage: `GitHub API returned an error (${err.status}).`,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  console.error("[github] unclassified error:", err);
  return {
    errorCode: "github_api_error",
    errorMessage: `Failed to reach GitHub: ${message}`,
  };
}
