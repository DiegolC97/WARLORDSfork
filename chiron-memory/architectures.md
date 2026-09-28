# architecture

How the system is put together — layers, boundaries, and how data flows.

## Engine behind an EngineHost seam so the shell and screens test headless

**What:** `src/engine/host.ts` defines `EngineHost` (app, asset backend, `createSceneRoot`, `setClearColor`). `playcanvasHost.ts` is the only module that constructs the PlayCanvas application; `nullHost.ts` is used by tests. Screens import engine types as `import type` only.
**Why:** PlayCanvas needs WebGL, which jsdom lacks. The seam lets the scripted navigation pass and save tests run under Vitest + jsdom, while `src/app.ts` composes the same shell in the browser.
**Where:** `src/engine/`, `src/app.ts` (composition root), `src/main.ts` (browser entry).
**Learned:** 2026-09-25.
