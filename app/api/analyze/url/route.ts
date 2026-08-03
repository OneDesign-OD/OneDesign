import { NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runUrlAnalysis } from "@/lib/pipeline";

const requestSchema = z.object({
  url: z.url({ protocol: /^https?$/, message: "URL must use http or https" }),
  provider: z.enum(["openai", "anthropic"]),
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
      sourceType: "url",
      sourceInput: parsed.data.url,
    },
  });

  after(() => runUrlAnalysis(analysis.id, parsed.data.url));

  return NextResponse.json({ id: analysis.id });
}
