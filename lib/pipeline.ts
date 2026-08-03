import { put } from "@vercel/blob";
import { loadPage } from "@/lib/browser";
import { extractComputedStyles } from "@/lib/extract";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Runs the URL analysis pipeline for an already-created Analysis row.
 * Intended to be invoked via next/server's `after()` so the API route can
 * return `{ id }` immediately while this continues in the background;
 * clients observe progress by polling GET /api/analysis/[id]/status.
 */
export async function runUrlAnalysis(analysisId: string, url: string) {
  try {
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: "loading" },
    });

    const result = await loadPage(url);

    if (!result.ok) {
      await prisma.analysis.update({
        where: { id: analysisId },
        data: {
          status: "failed",
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        },
      });
      return;
    }

    const { browser, page } = result;

    try {
      const screenshot = await page.screenshot({ fullPage: true });
      const blob = await put(`screenshots/${analysisId}.png`, screenshot, {
        access: "public",
        contentType: "image/png",
      });

      await prisma.analysis.update({
        where: { id: analysisId },
        data: { status: "extracting", screenshotUrl: blob.url },
      });

      const extraction = await extractComputedStyles(page, url);

      if (!extraction.ok) {
        await prisma.analysis.update({
          where: { id: analysisId },
          data: {
            status: "failed",
            errorCode: extraction.errorCode,
            errorMessage: extraction.errorMessage,
          },
        });
        return;
      }

      await prisma.analysis.update({
        where: { id: analysisId },
        data: {
          status: "analyzing",
          rawData: extraction.data as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      console.error(`[pipeline] screenshot/upload failed for ${analysisId}:`, err);
      await prisma.analysis.update({
        where: { id: analysisId },
        data: {
          status: "failed",
          errorCode: "unknown_load_error",
          errorMessage: "Failed to capture or store the screenshot.",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error(`[pipeline] unexpected failure for ${analysisId}:`, err);
    await prisma.analysis
      .update({
        where: { id: analysisId },
        data: {
          status: "failed",
          errorCode: "unknown_load_error",
          errorMessage: "Something went wrong while analyzing this URL.",
        },
      })
      .catch(() => {});
  }
}
