import { NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseGithubRepoUrl } from "@/lib/github";
import { runGithubAnalysis } from "@/lib/pipeline";

const requestSchema = z.object({
  repoUrl: z.string().refine((v) => parseGithubRepoUrl(v) !== null, {
    message: "Must be a valid GitHub repository URL, e.g. https://github.com/owner/repo",
  }),
  provider: z.enum(["openai", "anthropic", "google"]),
  apiKey: z.string().min(1),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const analysis = await prisma.analysis.create({
    data: {
      sourceType: "github",
      sourceInput: parsed.data.repoUrl,
    },
  });

  after(() =>
    runGithubAnalysis(
      analysis.id,
      parsed.data.repoUrl,
      parsed.data.provider,
      parsed.data.apiKey,
    ),
  );

  return NextResponse.json({ id: analysis.id });
}
