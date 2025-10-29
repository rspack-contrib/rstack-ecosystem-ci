# Repository Guidelines

## Project Structure & Module Organization
The CLI entry point `ecosystem-ci.ts` handles argument parsing, stack selection, and GitHub Actions plumbing. Shared helpers such as `runInRepo`, workspace bootstrap logic, and git utilities live in `utils.ts`, while DTOs reside in `types.d.ts`. Integration suites are colocated under `tests/<stack>/` (for example `tests/rsbuild/plugins.ts`, `tests/rspack/nuxt.ts`, or `tests/rslib/rsbuild.ts`) and export an async `test(options: RunOptions)` function that delegates to the helpers. Runtime clones live under the generated `workspace/` directory, so keep it untracked and disposable.

## Build, Test & Development Commands
- `pnpm install` — install dependencies with pnpm 10 (Node ≥18 as declared in `package.json`).
- `pnpm test -- --stack <stack>` — run every suite for the selected stack (`rsbuild`, `rspack`, `rstest`, `rslib`, `rsdoctor`, or `rslint`); append a suite name to narrow the scope (for example `pnpm test -- --stack rspack nuxt`).
- `pnpm bisect -- --stack <stack>` — execute the bisect helper exposed by `ecosystem-ci.ts bisect` to isolate regressions within the chosen stack.
- `pnpm lint` — run `biome check .`, which formats files, organizes imports, and enforces the shared rule set.

## Coding Style & Naming Conventions
Biome enforces space indentation, single quotes, normalized imports, and recommended lint rules, and the pre-commit hook automatically runs `biome check . --write`. Honor the strict TypeScript configuration in `tsconfig.json` (ESNext target, NodeNext resolution, `noImplicitOverride`). Name suite files in lowercase or kebab-case (`tests/rspack/lynx-stack.ts`) and keep exported helpers camelCase; favor small, composable functions around `runInRepo`.

## Testing Guidelines
Suites boot via `setupEnvironment` and must stay idempotent because each invocation starts from a clean clone. Use `runInRepo` with explicit `repo`, `branch`, `test`, and overrides so reviewers can trace every step. Model new suites after the minimal examples in `tests/<stack>/` (for instance `tests/rsbuild/examples.ts`, which only defines `test: ['build:rsbuild']`). Before opening a PR, run the relevant suites locally (for example `pnpm test -- --stack rsbuild plugins`) and capture the final log lines for the PR description.

## Commit & Pull Request Guidelines
Commits are short, imperative statements (current history begins with `initial commit`); keep subjects ≤72 characters and elaborate in the body when behavior changes. Reference related issues or workflows when touching CI wiring. Pull requests should summarize the motivation, list impacted suites or utilities, and paste the exact command used for validation (for example, `pnpm test -- --stack rspack modernjs`). Attach logs or screenshots for GitHub Actions changes and call out any new secrets or webhooks reviewers must configure.

## Environment & Tooling Notes
Run `pnpm prepare` once to install `simple-git-hooks`, otherwise the Biome pre-commit hook will be skipped. The runner exports `ECOSYSTEM_CI`, `TURBO_FORCE`, and memory-safe `NODE_OPTIONS`; avoid overriding them unless a suite explicitly needs different values.
