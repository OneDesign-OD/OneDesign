'use client'
import { Coffee } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link"
import { FiGithub } from "react-icons/fi";

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-5 transition-all duration-300">
      <div
        className={`flex h-20 w-full max-w-6xl items-center justify-between rounded-full px-8 transition-all duration-300 ${
          scrolled
            ? "border border-border/80 bg-background/80 shadow-lg backdrop-blur-xl"
            : "border border-border/40 bg-background/60 shadow-sm backdrop-blur-md"
        }`}
      >
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 text-foreground transition-opacity hover:opacity-80">
          <span className="text-lg font-semibold tracking-tight">One Design</span>
        </Link>

        {/* Navigation Links - Centered */}
        <nav className="hidden items-center gap-9 md:flex">
          <Link
            href="#how"
            className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            How it works
          </Link>
          <Link
            href="#examples"
            className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Examples
          </Link>
          <Link
            href="https://github.com/OneDesign-OD/OneDesign"
            target="_blank"
            rel="noreferrer"
            className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            GitHub
          </Link>
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Link
            href="https://github.com/OneDesign-OD/OneDesign"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="grid h-11 w-11 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <FiGithub className="h-5 w-5" />
          </Link>
          <Link
            href="#coffee"
            className="hidden items-center gap-2 rounded-full border border-warm/40 px-4 py-2 text-sm font-medium text-warm transition-colors hover:bg-warm/10 sm:inline-flex"
          >
            <Coffee className="h-4 w-4" />
            Buy me a coffee
          </Link>
          <Link
            href="https://github.com/OneDesign-OD/OneDesign"
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:brightness-110"
          >
            <FiGithub className="h-4 w-4" />
            Star on GitHub
          </Link>
        </div>
      </div>
    </header>
  );
}