import { chromium, errors, type Browser, type Page } from "playwright";

export type LoadErrorCode =
  "load_timeout" | "blocked" | "not_found" | "unknown_load_error";

export type LoadResult =
  | { ok: true; browser: Browser; page: Page }
  | { ok: false; errorCode: LoadErrorCode; errorMessage: string };

const NAVIGATION_TIMEOUT_MS = 20_000;
const SETTLE_TIMEOUT_MS = 5_000;
const UNREACHABLE_HOST_PATTERN =
  /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_ADDRESS_UNREACHABLE/;

/**
 * Launches Chromium and navigates to `url`. On success, returns the open
 * browser/page (caller is responsible for closing the browser once done
 * with it). On failure, the browser is already closed.
 */
export async function loadPage(url: string): Promise<LoadResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // "networkidle" is unreliable as the primary signal: plenty of real
    // sites (analytics beacons, price polling, websockets — airbnb.com is a
    // good example) never stop firing background requests, so they'd always
    // time out here even though the page itself loaded fine. Use "load" to
    // navigate, then give the page a short best-effort window to settle
    // (e.g. client-rendered content finishing hydration) without hard
    // failing if it never truly goes idle.
    const response = await page.goto(url, {
      waitUntil: "load",
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    if (!response) {
      await browser.close();
      return {
        ok: false,
        errorCode: "unknown_load_error",
        errorMessage: "The page did not return a response.",
      };
    }

    if (!response.ok()) {
      await browser.close();
      const status = response.status();
      if (status === 403 || status === 429) {
        return {
          ok: false,
          errorCode: "blocked",
          errorMessage: `The site returned ${status}, which usually means it blocks automated browsers.`,
        };
      }
      if (status === 404) {
        return {
          ok: false,
          errorCode: "not_found",
          errorMessage: "The page returned 404 Not Found.",
        };
      }
      return {
        ok: false,
        errorCode: "unknown_load_error",
        errorMessage: `The site returned an unexpected status: ${status}.`,
      };
    }

    await page
      .waitForLoadState("networkidle", { timeout: SETTLE_TIMEOUT_MS })
      .catch(() => {});

    return { ok: true, browser, page };
  } catch (err) {
    await browser.close();

    if (err instanceof errors.TimeoutError) {
      return {
        ok: false,
        errorCode: "load_timeout",
        errorMessage: "The site took too long to respond.",
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    if (UNREACHABLE_HOST_PATTERN.test(message)) {
      return {
        ok: false,
        errorCode: "not_found",
        errorMessage: "The site's domain could not be reached.",
      };
    }

    return {
      ok: false,
      errorCode: "unknown_load_error",
      errorMessage: "Failed to load the page.",
    };
  }
}
