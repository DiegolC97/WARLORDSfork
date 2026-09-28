# config

Setup and configuration — env vars, flags, how to run the project.

## Commands and CI sequence

**What:** `npm ci` · `npm run dev` · `npm test` (Vitest, jsdom, headless) · `npm run build` = `check:deps` → `check:names` → `typecheck` → `vite build`. `__APP_VERSION__` is injected from `package.json` by `vite.config.ts` (vitest merges that config). CI (`.github/workflows/ci.yml`) runs that same sequence on every push and pull request with Node 22.
**Why:** The build must fail on an import-boundary violation, so the dependency check is part of `build`, not a separate lint step people can skip.
**Where:** `package.json` scripts, `.github/workflows/ci.yml`, `README.md`.
**Learned:** 2026-09-25.
