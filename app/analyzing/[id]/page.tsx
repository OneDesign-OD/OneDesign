"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AlertCircle, ArrowLeft, Check, RotateCcw, SearchX, WifiOff } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Lightfall from "@/components/ui/Lightfall/Lightfall";

type Status =
  | "pending"
  | "loading"
  | "extracting"
  | "analyzing"
  | "generating"
  | "complete"
  | "failed";

type StatusResponse = {
  status: Status;
  errorCode: string | null;
  errorMessage: string | null;
  screenshotUrl: string | null;
  markdown: string | null;
};

const POLL_INTERVAL_MS = 2000;

const STAGES = [
  {
    key: "loading",
    label: "Loading page",
    description: "Rendering the live page in a headless browser.",
  },
  {
    key: "extracting",
    label: "Extracting styles",
    description: "Reading real computed styles from the DOM.",
  },
  {
    key: "analyzing",
    label: "Analyzing patterns",
    description: "Flagging inconsistencies and cross-referencing tokens.",
  },
  {
    key: "generating",
    label: "Generating DESIGN.md",
    description: "Asking your AI provider to name and document the tokens.",
  },
] as const;

function stageIndexFor(status: Status): number {
  switch (status) {
    case "pending":
    case "loading":
      return 0;
    case "extracting":
      return 1;
    case "analyzing":
      return 2;
    case "generating":
      return 3;
    case "complete":
      return 4;
    default:
      return 0;
  }
}

// Maps a failure's errorCode to the stage it happened during, based on the
// pipeline's own status transitions in lib/pipeline.ts.
const ERROR_STAGE: Record<string, number> = {
  load_timeout: 0,
  blocked: 0,
  not_found: 0,
  unknown_load_error: 0,
  extraction_failed: 1,
  invalid_api_key: 2,
  rate_limited: 2,
  ai_response_invalid: 2,
  ai_provider_error: 2,
  markdown_generation_failed: 3,
};

const ERROR_MESSAGES: Record<string, string> = {
  load_timeout:
    "The site took too long to respond. It might be slow or temporarily unavailable — try again in a moment.",
  blocked: "This site blocks automated browsers, so we couldn't load it.",
  not_found:
    "We couldn't reach that URL. Double-check it's correct and publicly accessible.",
  unknown_load_error:
    "Something went wrong while loading or capturing the page. Please try again.",
  extraction_failed:
    "We loaded the page but couldn't read its styles. This can happen on pages with unusual rendering.",
  invalid_api_key:
    "Your API key was rejected by the provider. Double-check it's correct and has available credits.",
  rate_limited:
    "Your AI provider rate-limited this request. Wait a moment and try again.",
  ai_response_invalid:
    "The AI model's response couldn't be understood. This is usually transient — try again.",
  ai_provider_error:
    "Something went wrong on the AI provider's side, or we couldn't reach it. Try again in a moment.",
  markdown_generation_failed:
    "We analyzed the page but couldn't format the results. Please try again.",
};

export default function AnalyzingPage() {
  return (
    <Suspense fallback={null}>
      <AnalyzingPageContent />
    </Suspense>
  );
}

function AnalyzingPageContent() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const displayUrl = useSearchParams().get("url");

  const [data, setData] = useState<StatusResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/analysis/${id}/status`, { cache: "no-store" });

        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error(`unexpected status ${res.status}`);

        const json = (await res.json()) as StatusResponse;
        if (cancelled) return;

        setData(json);
        setConnectionLost(false);

        if (json.status !== "complete" && json.status !== "failed") {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        if (cancelled) return;
        setConnectionLost(true);
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  return (
    <div className="min-h-screen text-foreground">
      <Header />

      <div className="pointer-events-none fixed inset-0 -z-10">
        <Lightfall
          colors={["#FF6308", "#D7D1C9", "#F9F8F6"]}
          backgroundColor="#1F2228"
          speed={0.2}
          streakCount={5}
          streakWidth={1}
          streakLength={1}
          glow={0.2}
          density={0.7}
          twinkle={0.2}
          zoom={2}
          backgroundGlow={1}
          opacity={1}
          mouseInteraction={false}
        />
      </div>

      <main className="relative mx-auto max-w-4xl px-6 pt-40 pb-28">
        {notFound ? (
          <NotFoundState />
        ) : !data ? (
          <InitialLoadingState displayUrl={displayUrl} />
        ) : (
          <>
            <PageHeader displayUrl={displayUrl} status={data.status} />

            {connectionLost && (
              <div className="animate-fade-in-up mb-8 flex items-center gap-2.5 rounded-lg border border-border-strong bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                <WifiOff className="h-4 w-4 shrink-0" />
                Having trouble reaching the server — retrying…
              </div>
            )}

            {data.status === "complete" ? (
              <CompleteState data={data} />
            ) : (
              <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
                <StageList status={data.status} errorCode={data.errorCode} />
                <ScreenshotPreview url={data.screenshotUrl} />
              </div>
            )}

            {data.status === "failed" && (
              <FailedState errorCode={data.errorCode} errorMessage={data.errorMessage} />
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

function PageHeader({
  displayUrl,
  status,
}: {
  displayUrl: string | null;
  status: Status;
}) {
  return (
    <div className="mb-14">
      <div className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {status === "complete"
          ? "Analysis complete"
          : status === "failed"
            ? "Analysis failed"
            : "Analyzing"}
      </div>
      <h1 className="mt-3 truncate text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
        {displayUrl ?? "Your page"}
      </h1>
    </div>
  );
}

function InitialLoadingState({ displayUrl }: { displayUrl: string | null }) {
  return (
    <div className="animate-fade-in-up">
      <PageHeader displayUrl={displayUrl} status="pending" />
      <div className="space-y-10">
        {STAGES.map((stage, i) => (
          <StageRow
            key={stage.key}
            label={stage.label}
            description={stage.description}
            state={i === 0 ? "active" : "pending"}
            isLast={i === STAGES.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

type StageState = "done" | "active" | "pending" | "error";

function StageList({ status, errorCode }: { status: Status; errorCode: string | null }) {
  const currentIndex = stageIndexFor(status);
  const failedIndex =
    status === "failed"
      ? errorCode
        ? (ERROR_STAGE[errorCode] ?? currentIndex)
        : currentIndex
      : -1;

  return (
    <div className="animate-fade-in-up">
      {STAGES.map((stage, i) => {
        let state: StageState;
        if (status === "failed") {
          state = i < failedIndex ? "done" : i === failedIndex ? "error" : "pending";
        } else {
          state = i < currentIndex ? "done" : i === currentIndex ? "active" : "pending";
        }
        return (
          <StageRow
            key={stage.key}
            label={stage.label}
            description={stage.description}
            state={state}
            isLast={i === STAGES.length - 1}
          />
        );
      })}
    </div>
  );
}

function StageRow({
  label,
  description,
  state,
  isLast,
}: {
  label: string;
  description: string;
  state: StageState;
  isLast: boolean;
}) {
  return (
    <div className="relative flex gap-4 pb-10 last:pb-0">
      {!isLast && (
        <span
          aria-hidden
          className={`absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px transition-colors ${
            state === "done" ? "bg-primary/40" : "bg-border"
          }`}
        />
      )}
      <span
        className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-colors ${
          state === "done"
            ? "border-primary/40 bg-primary/15 text-primary"
            : state === "active"
              ? "animate-pulse-scale border-warm bg-warm/15 text-warm"
              : state === "error"
                ? "border-destructive/50 bg-destructive/15 text-destructive"
                : "border-border text-muted-foreground"
        }`}
      >
        {state === "done" && <Check className="h-4 w-4" />}
        {state === "active" && <span className="h-2 w-2 rounded-full bg-warm" />}
        {state === "error" && <AlertCircle className="h-4 w-4" />}
        {state === "pending" && (
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
        )}
      </span>
      <div className="flex-1 pt-0.5">
        <div
          className={`text-lg font-medium tracking-tight transition-colors ${
            state === "pending" ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {label}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {state === "active" && (
          <div className="mt-3 h-1 w-full max-w-48 overflow-hidden rounded-full bg-border">
            <div className="animate-indeterminate h-full w-1/3 rounded-full bg-warm" />
          </div>
        )}
      </div>
    </div>
  );
}

function ScreenshotPreview({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="hidden h-fit rounded-xl border border-dashed border-border-strong bg-background/40 p-6 text-center text-sm text-muted-foreground lg:block">
        A preview will appear here once the page has loaded.
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up h-fit overflow-hidden rounded-xl border border-border bg-background/40">
      <div className="border-b border-border px-4 py-2.5 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Preview
      </div>
      <div className="relative aspect-[4/5] w-full overflow-hidden">
        <Image
          src={url}
          alt="Screenshot of the analyzed page"
          fill
          className="object-cover object-top"
          unoptimized
        />
      </div>
    </div>
  );
}

function CompleteState({ data }: { data: StatusResponse }) {
  return (
    <div className="animate-fade-in-up">
      <div className="mb-10 flex flex-col items-center text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full border border-primary/30 bg-primary/10 text-primary">
          <Check className="h-6 w-6" />
        </div>
        <p className="mt-4 text-muted-foreground">Your DESIGN.md is ready below.</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Analyze another page
        </Link>
      </div>

      <div className="surface-card max-h-[32rem] overflow-auto p-6 font-mono text-sm whitespace-pre-wrap text-foreground/90">
        {data.markdown}
      </div>
    </div>
  );
}

function FailedState({
  errorCode,
  errorMessage,
}: {
  errorCode: string | null;
  errorMessage: string | null;
}) {
  const message =
    (errorCode && ERROR_MESSAGES[errorCode]) ??
    errorMessage ??
    "Something unexpected happened. Please try again.";

  return (
    <div className="animate-fade-in-up mt-10 flex flex-col items-start gap-4 rounded-xl border border-destructive/30 bg-destructive/10 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div>
          <div className="text-base font-medium text-foreground">Analysis failed</div>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
      <Link
        href="/"
        className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:brightness-110"
      >
        <RotateCcw className="h-4 w-4" />
        Try again
      </Link>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="animate-fade-in-up flex flex-col items-center py-20 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full border border-border-strong bg-background/60 text-muted-foreground">
        <SearchX className="h-6 w-6" />
      </div>
      <h1 className="mt-6 text-2xl font-medium tracking-tight text-foreground">
        Analysis not found
      </h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        This link doesn&apos;t point to a real analysis — it may have expired or been
        mistyped.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-all hover:brightness-110"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>
    </div>
  );
}
