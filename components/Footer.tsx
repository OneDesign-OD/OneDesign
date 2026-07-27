import { Coffee } from "lucide-react";
import {FiGithub} from "react-icons/fi";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-14 md:grid-cols-4">
          <div>
            <div className="text-lg font-medium tracking-tight text-foreground">
              One Design
            </div>
            <p className="mt-3 max-w-sm text-lg text-muted-foreground">
              Turn any interface into a documented design system.
            </p>
          </div>
          <FooterCol
            title="Product"
            links={[
              ["How it works", "#how"],
              ["Examples", "#examples"],
              ["Changelog", "#"],
            ]}
          />
          <FooterCol
            title="Community"
            links={[
              ["GitHub", "https://github.com/OneDesign-OD/OneDesign"],
              ["Discord", "#"],
              ["Twitter / X", "#"],
            ]}
          />
          <div>
            <div className="mb-6 font-mono text-sm uppercase tracking-[0.18em] text-muted-foreground">
              Support
            </div>
            <ul className="space-y-4 text-lg">
              <li>
                <a className="inline-flex items-center gap-2 text-foreground/80 hover:text-foreground" href="#">
                  <Coffee className="h-5 w-5 text-warm" /> Buy Me a Coffee
                </a>
              </li>
              <li>
                <a className="inline-flex items-center gap-2 text-foreground/80 hover:text-foreground" href="#">
                  <FiGithub className="h-5 w-5" /> GitHub Sponsors
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-20 flex flex-col items-start justify-between gap-3 border-t border-border pt-10 text-base text-muted-foreground md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} Design Extractor. MIT licensed.</p>
          <p className="font-mono">Built with your own AI key. No data stored.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="mb-6 font-mono text-sm uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      <ul className="space-y-4 text-lg">
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="text-foreground/80 transition-colors hover:text-foreground">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
