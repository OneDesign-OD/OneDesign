import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
      message: "URL must use http or https",
    }),
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

  // Extraction pipeline isn't implemented yet (Phase 3+). Stub the result
  // so the endpoint is testable end-to-end in the meantime.
  await prisma.analysis.update({
    where: { id: analysis.id },
    data: {
      status: "failed",
      errorMessage: "Not yet implemented",
    },
  });

  return NextResponse.json({ id: analysis.id });
}
