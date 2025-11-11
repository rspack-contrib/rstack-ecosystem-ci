# Repository Guidelines

## Project Structure & Module Organization
The CLI entry point lives in `ecosystem-ci.ts`, handling argument parsing, stack selection, and GitHub Actions plumbing. Shared helpers (`runInRepo`, git utilities, bootstrap logic) reside in `utils.ts`, while DTOs are defined in `types.d.ts`. Integration suites are colocated under `tests/<stack>/` (for example `tests/rspack/nuxt.ts` or `tests/rsbuild/plugins.ts`) and export an async `test(options: RunOptions)` function. Runtime clones are created under `workspace/`; treat this directory as disposable and keep it untracked. The `website/` directory hosts the deployed page, which pulls fresh data from the `data` branch via ecosystem CI rendering before the scheduled deployment jobs run.

## Build, Test, and Development Commands
Use `pnpm install` to bootstrap dependencies (Node ≥18). Run targeted suites with `pnpm test -- --stack <stack> [suite]`, e.g. `pnpm test -- --stack rsbuild plugins`. Bisect regressions via `pnpm bisect -- --stack <stack>`. Execute `pnpm lint` to run `biome check .`. After cloning, `pnpm prepare` installs `simple-git-hooks` so the Biome pre-commit hook fires locally.

## Coding Style & Naming Conventions
Biome enforces space indentation, single quotes, normalized imports, and the shared lint rules. Follow the strict TypeScript settings in `tsconfig.json` (ESNext target, NodeNext resolution, `noImplicitOverride`). Name suite files in lowercase or kebab-case (`tests/rspack/lynx-stack.ts`), keep helpers camelCase, and reserve `test` exports for suite entry points.

## Testing Guidelines
Suites boot via `setupEnvironment` and must remain idempotent so reruns start clean. Prefer `runInRepo` with explicit `repo`, `branch`, `test`, and overrides so reviewers can audit each step. When adding scenarios, mirror the minimal patterns (for example `tests/rsbuild/examples.ts` with `test: ['build:rsbuild']`) and document any required environment tweaks.

## Commit & Pull Request Guidelines
Commits follow short, imperative subjects (≤72 chars), elaborating in the body only when behavior changes. PRs should justify the change, list affected stacks or utilities, and include the exact validation command, e.g. `pnpm test -- --stack rspack modernjs`. Attach logs or screenshots for CI changes and highlight any new secrets or webhooks reviewers must configure.

## Environment & Tooling Notes
The runner exports `ECOSYSTEM_CI`, `TURBO_FORCE`, and memory-safe `NODE_OPTIONS`; avoid overriding them unless a suite explicitly requires it. Keep `workspace/` untracked, and never commit runtime artifacts. Remember that network-dependent steps may need explicit approval in restricted environments.
