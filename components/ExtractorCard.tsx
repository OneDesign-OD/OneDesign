'use client'

import { useState } from "react";
import {
  Eye,
  EyeOff,
    Globe,
  ImagePlus,
  Info,
  Link as LinkIcon,
  Lock,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FiGithub } from "react-icons/fi";


type Tab = "url" | "screenshot" | "repo";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "url", label: "URL", icon: LinkIcon },
  { id: "screenshot", label: "Screenshot", icon: ImagePlus },
  { id: "repo", label: "GitHub Repo", icon: FiGithub },
];

export function ExtractorCard() {
  const [tab, setTab] = useState<Tab>("url");
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const canEstimate = apiKey.length > 4;
  const activeIndex = TABS.findIndex((t) => t.id === tab);

  const router = useRouter()

  return (
    <div id="start" className="relative mx-auto w-full max-w-205">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-16 -top-16 -z-10 h-72 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, color-mix(in oklab, var(--color-primary-glow) 55%, transparent), transparent 60%)",
        }}
      />
      <div className="surface-card overflow-hidden shadow-[0_1px_0_0_var(--color-border-strong)_inset]">
        {/* Tabs */}
        <div className="border-b border-border p-3">
          <div className="relative flex rounded-lg border border-border/60 bg-foreground/5 p-1.5 backdrop-blur-md">
            <span
              aria-hidden
              className="absolute inset-y-1.5 rounded-md border border-foreground/15 bg-foreground/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_0_0_1px_var(--color-border-strong)] backdrop-blur-md transition-[left] duration-300 ease-out"
              style={{
                width: `calc((100% - 0.75rem) / 3)`,
                left: `calc(0.375rem + (100% - 0.75rem) / 3 * ${activeIndex})`,
              }}
            />
            {TABS.map((t) => {
              const active = tab === t.id;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative z-10 flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-base font-medium transition-colors ${
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 p-7">
          <div className="min-h-30">
            {tab === "url" && (
              <div className="animate-fade-in-up flex h-full flex-col justify-center space-y-2">
                <div className="relative">
                  <Globe className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="url"
                    placeholder="https://example.com"
                    className="w-full rounded-md border border-border bg-background py-3.5 pl-12 pr-5 text-base text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-primary focus:outline-none"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  We'll analyze the live rendered page — colors, fonts, spacing, and layout.
                </p>
              </div>
            )}

            {tab === "screenshot" && (
              <div className="animate-fade-in-up h-full">
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                  }}
                  className={`flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed text-center transition-all ${
                    dragOver
                      ? "border-primary bg-primary/5"
                      : "border-border-strong bg-background hover:border-muted-foreground/40"
                  }`}
                >
                  <ImagePlus className="h-14 w-14 text-muted-foreground" strokeWidth={1.5} />
                  <p className="mt-4 text-base font-medium text-foreground">Drop a screenshot here</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    or click to browse — PNG, JPG up to 10MB
                  </p>
                  <input type="file" accept="image/*" className="hidden" />
                </label>
              </div>
            )}

            {tab === "repo" && (
              <div className="animate-fade-in-up flex h-full flex-col justify-center space-y-2">
                <div className="relative">
                  <FiGithub className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="github.com/username/repository"
                    className="w-full rounded-md border border-border bg-background py-3.5 pl-12 pr-5 text-base text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-primary focus:outline-none"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Public repos only for now. We'll scan for Tailwind config, CSS variables, and component structure.
                </p>
              </div>
            )}
          </div>

          {/* BYOK */}
          <div className="rounded-lg border border-border bg-background/60 p-5">
            <div className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              AI Provider
            </div>
            <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="rounded-md border border-border bg-background px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none"
              >
                <option value="anthropic">◆ Anthropic</option>
                <option value="openai">◇ OpenAI</option>
              </select>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-md border border-border bg-background py-3 pl-4 pr-11 font-mono text-base text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "Hide key" : "Show key"}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="mt-4 flex items-start justify-between gap-4">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                Your key is never stored or sent to our servers. Used only for this request.
              </p>
              <a href="#" className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Where do I get an API key?
              </a>
            </div>
          </div>

          <button
            onClick={() => router.push("/analyzing")}
            className="group flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-4 text-base font-medium text-primary-foreground transition-all hover:brightness-110 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-10px_color-mix(in_oklab,var(--color-primary-glow)_70%,transparent)]"
          >
            <Sparkles className="h-5 w-5" />
            Analyze Design
          </button>

          {canEstimate && (
            <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <span>Estimated cost:</span>
              <span className="font-mono text-foreground/80">~$0.02–0.05</span>
              <Info className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
