"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  LayoutGrid,
  Loader2,
  Palette,
  RotateCcw,
  Ruler,
  SearchX,
  Type,
  WifiOff,
} from "lucide-react";
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
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      {/* Keying on `id` remounts this on retry (which swaps to a new id),
          giving every analysis a clean state slate instead of manually
          resetting state for the previous one inside an effect. */}
      <AnalyzingPageContent key={params.id} id={params.id} />
    </Suspense>
  );
}

function AnalyzingPageContent({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const displayUrl = searchParams.get("url");
  const displayProvider = searchParams.get("provider");

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

      <main className="relative mx-auto max-w-5xl px-6 pt-32 pb-28">
        {notFound ? (
          <NotFoundState />
        ) : (
          <>
            <PageHeader displayUrl={displayUrl} status={data?.status ?? "pending"} />

            {connectionLost && (
              <div className="animate-fade-in-up mb-8 flex items-center gap-2.5 rounded-lg border border-border-strong bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                <WifiOff className="h-4 w-4 shrink-0" />
                Having trouble reaching the server — retrying…
              </div>
            )}

            {data?.status === "complete" ? (
              <CompleteState data={data} />
            ) : (
              <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
                <StageList
                  status={data?.status ?? "pending"}
                  errorCode={data?.errorCode ?? null}
                />
                <ScreenshotPreview url={data?.screenshotUrl ?? null} />
              </div>
            )}

            {data?.status === "failed" && (
              <FailedState
                errorCode={data.errorCode}
                errorMessage={data.errorMessage}
                url={displayUrl}
                defaultProvider={displayProvider}
              />
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

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Colors: Palette,
  Typography: Type,
  Spacing: Ruler,
  "Layout Patterns": LayoutGrid,
};

const COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$|^rgba?\(/i;

const markdownComponents: Components = {
  // The page already renders its own title — a literal "DESIGN.md" H1
  // inside the doc would just duplicate it.
  h1: () => null,
  h2: ({ children }) => {
    const text = String(children);
    const Icon = SECTION_ICONS[text] ?? FileText;
    return (
      <div className="mt-10 mb-4 flex items-center gap-2 border-b border-border pb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground first:mt-0">
        <Icon className="h-3.5 w-3.5" />
        {children}
      </div>
    );
  },
  p: ({ children }) => (
    <p className="text-base leading-relaxed text-muted-foreground">{children}</p>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-foreground underline underline-offset-4 hover:text-primary"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-background/60">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border px-4 py-2.5 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/60 px-4 py-3 align-top text-foreground/90 last:text-muted-foreground">
      {children}
    </td>
  ),
  code: ({ children }) => {
    const text = String(children).trim();
    const isColor = COLOR_PATTERN.test(text);
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 font-mono text-xs text-foreground/90">
        {isColor && (
          <span
            aria-hidden
            className="h-3 w-3 rounded-full border border-border-strong"
            style={{ backgroundColor: text }}
          />
        )}
        {children}
      </span>
    );
  },
};

function CompleteState({ data }: { data: StatusResponse }) {
  const markdown = data.markdown ?? "";

  return (
    <div className="animate-fade-in-up">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-col gap-3 sm:flex-row">
          <CopyButton text={markdown} />
          <DownloadButton text={markdown} />
        </div>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground sm:ml-auto"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Analyze another page
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-3 border-b border-border bg-background/40 px-5 py-3">
            <div className="flex gap-2">
              <span className="h-3 w-3 rounded-full bg-muted-foreground/25" />
              <span className="h-3 w-3 rounded-full bg-muted-foreground/25" />
              <span className="h-3 w-3 rounded-full bg-muted-foreground/25" />
            </div>
            <div className="rounded-md border border-border bg-surface-elevated px-3 py-1.5 font-mono text-sm text-foreground/80">
              DESIGN.md
            </div>
          </div>
          {markdown ? (
            <div className="max-h-168 overflow-auto p-8">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {markdown}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="p-8 text-sm text-muted-foreground">
              No markdown was returned for this analysis.
            </div>
          )}
        </div>

        <ScreenshotPreview url={data.screenshotUrl} />
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      disabled={!text}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-foreground/30 hover:bg-foreground/5 disabled:pointer-events-none disabled:opacity-50"
    >
      {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : "Copy Markdown"}
    </button>
  );
}

function DownloadButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      disabled={!text}
      onClick={() => {
        const blob = new Blob([text], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "DESIGN.md";
        link.click();
        URL.revokeObjectURL(url);
      }}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
    >
      <Download className="h-4 w-4" />
      Download DESIGN.md
    </button>
  );
}

function FailedState({
  errorCode,
  errorMessage,
  url,
  defaultProvider,
}: {
  errorCode: string | null;
  errorMessage: string | null;
  url: string | null;
  defaultProvider: string | null;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState(
    defaultProvider === "openai" || defaultProvider === "google"
      ? defaultProvider
      : "anthropic",
  );
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const message =
    (errorCode && ERROR_MESSAGES[errorCode]) ??
    errorMessage ??
    "Something unexpected happened. Please try again.";

  async function handleRetry() {
    setRetryError(null);

    if (!url) {
      setRetryError("We lost track of the original URL — please start a new analysis.");
      return;
    }
    if (!apiKey.trim()) {
      setRetryError("Enter your API key to retry.");
      return;
    }

    setIsRetrying(true);
    try {
      const res = await fetch("/api/analyze/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, provider, apiKey }),
      });

      if (!res.ok) {
        setRetryError("Couldn't start a new analysis. Please try again.");
        setIsRetrying(false);
        return;
      }

      const { id } = (await res.json()) as { id: string };
      router.replace(
        `/analyzing/${id}?url=${encodeURIComponent(url)}&provider=${provider}`,
      );
    } catch {
      setRetryError("Couldn't reach the server. Check your connection and try again.");
      setIsRetrying(false);
    }
  }

  return (
    <div className="animate-fade-in-up mt-10 rounded-xl border border-destructive/30 bg-destructive/10 p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div>
          <div className="text-base font-medium text-foreground">Analysis failed</div>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
      </div>

      <div className="mt-5 border-t border-destructive/20 pt-5">
        <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto]">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={isRetrying}
            className="rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-60"
          >
            <option value="anthropic">◆ Anthropic</option>
            <option value="openai">◇ OpenAI</option>
            <option value="google">◈ Google</option>
          </select>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={isRetrying}
              placeholder="sk-..."
              className="w-full rounded-md border border-border bg-background py-2.5 pl-3 pr-10 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? "Hide key" : "Show key"}
              className="absolute top-1/2 right-1.5 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {showKey ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
          >
            {isRetrying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {isRetrying ? "Retrying…" : "Retry"}
          </button>
        </div>

        {retryError && <p className="mt-2 text-sm text-destructive">{retryError}</p>}

        <p className="mt-3 text-xs text-muted-foreground">
          Re-enter your key to retry — it&apos;s never stored, so we can&apos;t reuse it
          automatically.
        </p>
      </div>
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
