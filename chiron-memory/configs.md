# config

Setup and configuration — env vars, flags, how to run the project.

## Commands and CI sequence

**What:** `npm ci` · `npm run dev` · `npm test` (Vitest, jsdom, headless) · `npm run build` = `check:deps` → `check:names` → `typecheck` → `vite build`. `__APP_VERSION__` is injected from `package.json` by `vite.config.ts` (vitest merges that config). CI (`.github/workflows/ci.yml`) runs that same sequence on every push and pull request with Node 22.
**Why:** The build must fail on an import-boundary violation, so the dependency check is part of `build`, not a separate lint step people can skip.
**Where:** `package.json` scripts, `.github/workflows/ci.yml`, `README.md`.
**Learned:** 2026-09-25.

## The project's build/verify sequence is: dependency-cruiser boundary check → check-names →…

What: The project's build/verify sequence is: dependency-cruiser boundary check → check-names → typecheck (tsc --noEmit) → vitest (headless, jsdom) → vite build, and this exact sequence is what CI runs on push and pull_request. · Why: — · Where: package.json scripts, .github/workflows/ci.yml. · Learned: run the dependency/name checks before typecheck/build locally so a violation is caught early, matching CI order. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-10 -->

## The `/chiron-push` slash command commits all pending changes, pushes to `main`, and marks…

What: The `/chiron-push` slash command commits all pending changes, pushes to `main`, and marks the associated Chiron board cards as Done in one step. · Why: — · Where: chiron-push command. · Learned: use `/chiron-push` once work is verified locally instead of running git commit/push manually in this project. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-19 -->

## PlayCanvas is consumed exclusively from the npm registry pinned to an exact version (2.22…

What: PlayCanvas is consumed exclusively from the npm registry pinned to an exact version (2.22.4, no caret) in package.json and the lockfile, with zero engine source copied into the repo and no fork/source checkout in the build. · Why: work order requires the engine be a pure dependency; the playcanvas-engine repo is a read-only reference, never a push target. · Where: package.json, package-lock.json. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-9 -->
