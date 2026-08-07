import { NextResponse, after } from "next/server";
import { z } from "zod";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { runImageAnalysis } from "@/lib/pipeline";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const requestSchema = z.object({
  file: z
    .instanceof(File, { message: "file is required" })
    .refine((f) => ALLOWED_TYPES.has(f.type), {
      message: "File must be png, jpg, jpeg, or webp",
    })
    .refine((f) => f.size <= MAX_FILE_BYTES, {
      message: "File must be 10MB or smaller",
    }),
  provider: z.enum(["openai", "anthropic", "google"]),
  apiKey: z.string().min(1),
});

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);

  if (!form) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse({
    file: form.get("file"),
    provider: form.get("provider"),
    apiKey: form.get("apiKey"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { file, provider, apiKey } = parsed.data;
  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = EXTENSION_BY_TYPE[file.type];

  const blob = await put(`uploads/${crypto.randomUUID()}.${extension}`, buffer, {
    access: "public",
    contentType: file.type,
  });

  const analysis = await prisma.analysis.create({
    data: {
      sourceType: "screenshot",
      sourceInput: blob.url,
      screenshotUrl: blob.url,
    },
  });

  after(() => runImageAnalysis(analysis.id, blob.url, provider, apiKey));

  return NextResponse.json({ id: analysis.id });
}
