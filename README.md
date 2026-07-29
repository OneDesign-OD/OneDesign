# onedesign

An open-source, **BYOK** (Bring Your Own API Key) design intelligence tool.
Point it at a URL and it renders the live page, extracts real computed
styles (colors, typography, spacing, layout) via a headless browser, and
uses an AI model to interpret that ground-truth data into a clean,
human-readable `DESIGN.md`.

No API keys are ever stored server-side, persisted to a database, or
logged. You supply your own OpenAI or Anthropic key at request time; it is
used only for that request and then discarded.

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- TypeScript
- Tailwind CSS + [shadcn/ui](https://ui.shadcn.com)
- Prisma + [Neon](https://neon.tech) (Postgres)
- [Vercel AI SDK](https://sdk.vercel.ai) (BYOK: OpenAI / Anthropic)
- [Playwright](https://playwright.dev) for headless page rendering
- Zod for schema validation

## Getting started

This project uses [pnpm](https://pnpm.io) as its package manager.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

Copy `.env.example` to `.env` and fill in the values described there. AI
provider API keys are **not** configured via environment variables — they
are entered by the user in the UI and sent per-request only.

## Scripts

- `pnpm dev` — start the dev server
- `pnpm build` — production build
- `pnpm lint` — run ESLint
- `pnpm format` — format the codebase with Prettier
- `pnpm format:check` — check formatting without writing changes

## Project status

This repository is being built out in phases (see the design extraction
pipeline: URL fetch → computed-style extraction → ambiguity detection → AI
interpretation → markdown generation). Not all functionality described
above is wired up yet.
