import {
  Cpu,
  FileDown,
  MousePointerClick,
  Type,
  Palette,
  Ruler,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ExtractorCard } from "@/components/ExtractorCard";
import ShinyText from "@/components/ui/ShinyText/ShinyText";
import Lightfall from "@/components/ui/Lightfall/Lightfall";
import BorderGlow from "@/components/ui/BorderGlow/BorderGlow";
import SpotlightCard from "@/components/ui/SpotLight/SpotlightCard";

export default function Home() {
  return (
    <div className="min-h-screen text-foreground">
      <Header />

      

      <main className="relative pt-32">

        
        {/* subtle grid */}
        {/* <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-150 opacity-[0.35]"
          style={{
            maskImage: "radial-gradient(ellipse 60% 50% at 50% 0%, black, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse 60% 50% at 50% 0%, black, transparent 70%)",
            backgroundImage:
              "linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        /> */}

        <div className="absolute inset-0 -z-10">
            <Lightfall
              colors={['#FF6308', '#D7D1C9', '#F9F8F6']}
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

        <section className="relative mx-auto max-w-6xl px-6 pb-28 pt-10 text-center">


          <h1 className="mx-auto max-w-5xl text-balance text-6xl font-medium tracking-tight text-foreground md:text-7xl md:leading-none">
            <ShinyText
              text="One Extract any design system."
              speed={2}
              delay={0}
              color="#f9f8f6"
              shineColor="#ff6308"
              spread={120}
              direction="left"
              yoyo={false}
              pauseOnHover={false}
          />
            <br />
            <span className="font-normal">
            <ShinyText
              text="In seconds."
              speed={2}
              delay={0}
              color="#d7d1c9"
              shineColor="#ff6308"
              spread={120}
              direction="left"
              yoyo={false}
              pauseOnHover={false}
          />
            </span>
          </h1>
          <div className="mt-16">
            <ExtractorCard />
          </div>
        </section>

        
<SpotlightCard spotlightColor="rgba(255, 0, 0, 0.1)">
        {/* How it works */}
        <section id="how">
          <div className="mx-auto max-w-6xl px-6 py-28">
            <div className="mb-16 max-w-2xl">
              <div className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                How it works
              </div>
              <h2 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">
                Three steps. No pipeline.
              </h2>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              <Step
                num="01"
                icon={MousePointerClick}
                title="Submit"
                body="Drop a URL, a screenshot, or a GitHub repo. Bring your own Anthropic or OpenAI key."
              />
              <Step
                num="02"
                icon={Cpu}
                title="Analyze"
                body="We render, extract, and reason across styles — pulling colors, type, spacing, and layout patterns."
              />
              <Step
                num="03"
                icon={FileDown}
                title="Download"
                body="Get a clean DESIGN.md (and TOKENS.md for repos). Copy, commit, or share instantly."
              />
            </div>
          </div>
        </section>
        </SpotlightCard>

      </main>

      <Footer />
    </div>
  );
}

function Step({
  num,
  icon: Icon,
  title,
  body,
}: {
  num: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <BorderGlow
      className="h-full"
      backgroundColor="#1f2228"
      glowColor="22 100 52"
      colors={["#FF6308", "#D7D1C9", "#F9F8F6"]}
      borderRadius={12}
      glowRadius={28}
      glowIntensity={0.9}
      edgeSensitivity={35}
      coneSpread={30}
    >
      <div className="flex h-full flex-col gap-6 p-7">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-warm/10 text-warm">
            <Icon className="h-5 w-5" />
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Step {num}
          </span>
        </div>
        <div>
          <h3 className="text-xl font-medium tracking-tight">{title}</h3>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">{body}</p>
        </div>
      </div>
    </BorderGlow>
  );
}

function MarkdownWindow() {
  const swatches = [
    { hex: "#0A2540", label: "ink" },
    { hex: "#635BFF", label: "primary" },
    { hex: "#00D924", label: "success" },
    { hex: "#F6F9FC", label: "surface" },
    { hex: "#425466", label: "muted" },
    { hex: "#FFB13B", label: "warn" },
  ];
  return (
    <div className="mx-auto max-w-5xl overflow-hidden rounded-xl border border-border bg-surface shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
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
      <div className="space-y-10 p-10">
        <div>
          <div className="mb-3 flex items-center gap-2 font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground">
            <Palette className="h-3.5 w-3.5" /> Colors
          </div>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            {swatches.map((s) => (
              <div key={s.hex} className="space-y-2">
                <div
                  className="aspect-square w-full rounded-lg border border-border"
                  style={{ backgroundColor: s.hex }}
                />
                <div className="font-mono text-sm text-muted-foreground">{s.hex}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-center gap-2 font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground">
            <Type className="h-3.5 w-3.5" /> Typography
          </div>
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4">
              <div className="text-3xl font-semibold tracking-tight">Sohne Breit — Display</div>
              <div className="mt-1 font-mono text-sm text-muted-foreground">
                48px / 600 · tracking -0.02em
              </div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="text-lg">Inter — Body</div>
              <div className="mt-1 font-mono text-sm text-muted-foreground">
                16px / 400 · leading 1.6
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2 font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground">
            <Ruler className="h-3.5 w-3.5" /> Spacing
          </div>
          <div className="flex items-end gap-2">
            {[4, 8, 12, 16, 24, 32, 48].map((v) => (
              <div key={v} className="flex flex-col items-center gap-1.5">
                <div
                  className="rounded-sm bg-primary/70"
                  style={{ width: `${v}px`, height: "24px" }}
                />
                <div className="font-mono text-xs text-muted-foreground">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
