---
name: eco-ci-selfcheck
description: Self-check for the rstack ecosystem CI framework. Audits the latest GitHub Actions runs of the six `*-ci-from-commit` workflows in `rstackjs/rstack-ecosystem-ci` and reports, in a Markdown table, whether each run was driven to completion by the eco-ci framework itself — separating framework / infra failures (which mean eco-ci is broken and the signal is untrustworthy) from legitimate downstream test failures (which mean eco-ci worked and an upstream change really broke a consumer). Use this whenever the user asks to self-check, sanity-check, audit, or "see the health of" the rstack ecosystem CI, the latest `from-commit` runs, or anything along the lines of "did eco-ci actually run the suites" / "is eco-ci itself healthy" — even when the user does not name the workflows explicitly.
---

# eco-ci-selfcheck

Self-check for the rstack ecosystem CI framework. Audit the latest run of each `*-ci-from-commit` workflow in `rstackjs/rstack-ecosystem-ci` and report whether the eco-ci framework drove the suite to completion. **A "correctly executed" run is one where the suite's test code actually ran to completion — even if individual tests failed.** Setup-side failures (build, install, Verdaccio publish, prepare-binding, etc.) count as eco-ci self-failures because the suite never got to exercise the upstream code under test.

## Why this distinction matters

The from-commit workflows are dispatched by the six upstream stack repos on every push to main. Their job is to verify that the upstream change does not break downstream consumers. Two failure shapes look identical at the GitHub UI level (red X), but mean very different things:

- **Eco-ci self-failure** — the runner could not even start the tests (binding build failed, `pnpm install` blew up in the eco-ci repo, Verdaccio refused to publish, etc.). This is on us to fix in this repo before the signal becomes useful again.
- **Legitimate test failure** — the suite booted, cloned the consumer repo, installed deps, built it, and ran its tests; some tests reported failures. That is the _intended_ signal — the upstream PR genuinely broke something downstream.

A reviewer scanning the Actions tab cannot tell these apart without clicking into every run. This skill does that distillation in one pass.

## Workflows in scope (exactly six)

```
rsbuild-ecosystem-ci-from-commit.yml
rsdoctor-ecosystem-ci-from-commit.yml
rslib-ecosystem-ci-from-commit.yml
rspack-ecosystem-ci-from-commit.yml
rspress-ecosystem-ci-from-commit.yml
rstest-ecosystem-ci-from-commit.yml
```

Only the latest run of each (one per stack, six runs total) is examined per invocation.

## Procedure

Run all six `gh run list` calls in parallel (single message, one Bash call per stack) — they are independent and finish in ~1s each. Then for each run, decide whether you need the deeper log inspection (see below) and pull those logs in parallel too.

### Step 1 — Fetch the latest run per workflow

For each stack, capture `databaseId`, `conclusion`, `status`, `createdAt`, `url`, and `displayTitle`:

```bash
gh run list --repo rstackjs/rstack-ecosystem-ci \
  --workflow "<stack>-ecosystem-ci-from-commit.yml" \
  --limit 1 \
  --json databaseId,conclusion,status,createdAt,url,displayTitle
```

If `status != "completed"`, the run is still in progress — mark it `⏳ IN PROGRESS` in the output table and skip the rest of the analysis for that row.

### Step 2 — Fetch jobs + failed steps for each completed run

```bash
gh run view --repo rstackjs/rstack-ecosystem-ci <runId> --json jobs \
  --jq '.jobs[] | {name, conclusion, status, url,
                   failed_steps: [.steps[] | select(.conclusion=="failure" or .conclusion=="cancelled") | {number, name, conclusion}]}'
```

### Step 3 — Classify each job

For each job in the run, apply these rules in order. The run as a whole inherits the worst classification across its jobs.

**Job-level shortcuts** (no step inspection needed):

| Condition                         | Classification                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `conclusion == "success"`         | ✅ OK                                                                                     |
| `conclusion == "skipped"`         | (ignore — these are the unused conditional jobs like `execute-all (${{ inputs.suite }})`) |
| `conclusion == "cancelled"`       | ⚠️ CANCELLED                                                                              |
| `conclusion == "timed_out"`       | ⚠️ TIMED OUT                                                                              |
| `conclusion == "startup_failure"` | 🛑 ECO-CI SELF                                                                            |

**Job conclusion == "failure"** — look at the failed steps:

A failed step counts as a **suite-run step** if its name matches _any_ of these patterns (case-sensitive substring match is fine):

- contains `run-suites` — e.g. `Run pnpm tsx ecosystem-ci.ts run-suites --stack rsbuild plugins`
- exactly `Run suite (with Verdaccio)` — rspack non-`_selftest` jobs
- exactly `Run suite (selftest)` — rspack `_selftest` job

If _any_ failed step in the job is NOT a suite-run step → 🛑 ECO-CI SELF. The pre-suite steps are `Set up job`, `Run actions/checkout@…`, `Run moonrepo/setup-rust@…`, `Run ./.github/actions/build-<stack>`, `Run pnpm i --frozen-lockfile`, `Expose GitHub Runtime`, `Publish rspack to Verdaccio`. Any of these failing means the framework never got a chance to run the suite. Failures in the `Prepare Rspack Binding` job (rspack only) also fall here.

If the _only_ failed steps are suite-run steps → proceed to Step 4 (log inspection). Do not assume legitimate-test-failure yet, because the suite-run step also covers cloning the consumer repo, `pnpm install`-ing its deps, and building it; a failure before the test command actually ran is still an eco-ci-shaped infrastructure problem, not a real signal from upstream.

### Step 4 — Inspect the suite-run step log (only when needed)

The user asked for the deeper check specifically to avoid mis-attributing in-suite setup failures (clone/install/build) as "the tests ran." Fetch the failed log:

```bash
gh run view --repo rstackjs/rstack-ecosystem-ci <runId> --log-failed > /tmp/ecoci-<runId>.log
```

Then scan for any of the following **"tests-ran" signals**. Finding _any one_ of them is enough to conclude the test command was actually invoked:

- `Test Files \d+ (failed|passed)` — vitest summary (rsdoctor, rstest, modernjs, etc.)
- `Tests\s+\d+ (failed|passed)` — vitest test-count summary
- `(passed|failed), \d+ (passed|failed)` from progress lines like `tests: 216 passed, 1 failed`
- `test succeed \d+, failed \d+` — emitted by `tests/rsbuild/plugins.ts` (`runInRepo` aggregator)
- `\S+ test failed:` — per-repo failure line printed by the plugins aggregator (`${repo} test failed: …`)
- `Summary of all failing tests:` — vitest banner
- `ELIFECYCLE  Command failed with exit code 1` _after_ any of the above

If you find one of these signals → ✅ OK (legitimate test failure — the suite genuinely exercised upstream code and some tests failed). Record which specific test files or repos failed (1-line evidence) for the table.

If you find none of these signals — only things like `Command failed with exit code 1: pnpm install …`, `Cannot find module …`, `ENOENT`, `ENETUNREACH`, `ECONNRESET`, `fatal: unable to access`, native binding load errors, `cargo` errors, or other crashes that pre-empt the test command — → 🛑 ECO-CI SELF (the suite framework ran but the consumer-repo setup blew up before tests started). The error string alone is not enough — proceed to Step 5 to root-cause it.

If the log is ambiguous (large, no clear test summary, no obvious setup-side crash either) → ⚠️ NEEDS REVIEW. Do not guess; proceed to Step 5.

### Step 5 — Root-cause the failure (mandatory for every non-OK row; evidence chain, no guessing)

A `🛑 ECO-CI SELF` verdict without a root cause is useless to the user — they need to know _why_ before they know where to fix. Investigate every failing job along an explicit evidence chain. Quote verbatim from logs / API responses; do not infer from memory.

**Do not assume any source files exist on the local filesystem.** This skill runs on arbitrary machines that may not have a checkout of `rstackjs/rstack-ecosystem-ci`, the upstream stack repo, or any consumer repo. Read everything you need through the GitHub API:

```bash
# Read a file from a repo at a specific ref (commit SHA, branch, or tag)
gh api repos/<owner>/<repo>/contents/<path>?ref=<sha> --jq '.content' | base64 -d

# Read commit metadata + changed files
gh api repos/<owner>/<repo>/commits/<sha>

# List directory contents
gh api repos/<owner>/<repo>/contents/<dir>?ref=<sha> --jq '.[] | .name'
```

**Evidence chain — walk all of these in order, for every failing job:**

1. **The trigger.** Pull the dispatching workflow's inputs:

   ```bash
   gh run view --repo rstackjs/rstack-ecosystem-ci <runId> --json event,displayTitle,headBranch,headSha
   gh api repos/rstackjs/rstack-ecosystem-ci/actions/runs/<runId> --jq '{event, name, head_branch, head_sha, run_attempt}'
   ```

   For `workflow_dispatch`, the upstream commit being tested is in the dispatch payload. Extract it from the first ~30 log lines of any execute job (look for `commitSHA`, `inputs.commitSHA`, or the matching pattern in `Set up job` logs / the workflow YAML). Record: `upstreamRepo`, `upstreamSha`.

2. **The first chronological error.** `gh run view --log-failed` returns chronological lines for failed steps; find the _earliest_ line that is genuinely an error (skip `WARN`, `[WARN]`, deprecation notices). Quote it verbatim. The first error is the root; everything after may be cascades / cleanup noise / lock-contention from parallel workers and is usually not the cause.

3. **The failing command.** Right above the throw is the `$> <command>` group line, e.g. `$> pnpm turbo build` or `$> pnpm install …`. Record it exactly.

4. **The caller in eco-ci.** The Node stack trace will end in `utils.ts:<line>` (almost always `:102`, the generic `$` wrapper), then one frame up will point into `utils.ts` or `tests/<stack>/<suite>.ts`. The latter tells you which suite definition is responsible. Fetch it through the API at the same SHA as the run:

   ```bash
   gh api repos/rstackjs/rstack-ecosystem-ci/contents/tests/<stack>/<suite>.ts?ref=<run-head-sha> --jq '.content' | base64 -d
   ```

   Record: the `repo` / `branch` / `test:` array / overrides the suite passes to `runInRepo`. This tells you which downstream consumer repo + ref was being exercised.

5. **The downstream consumer.** Cross-check that the consumer repo (from step 4) actually exists at the ref the suite asks for, and that the failing command (from step 3) maps to a real script in its `package.json`:

   ```bash
   gh api repos/<consumer-owner>/<consumer-repo>/contents/package.json?ref=<consumer-ref> --jq '.content' | base64 -d
   ```

   If the script is missing or renamed, that _is_ the root cause. If it exists, look at what it does (often it chains `rslib build` / `vitest` / `pnpm -r build` / etc.).

6. **The actual API / file / symbol named in the error.** If the error message names a specific symbol (e.g. `rspack.experiments.EsmLibraryPlugin is not a constructor`), a missing module, or a broken patch, verify against the upstream stack repo _at the SHA being tested_:

   ```bash
   gh api repos/<upstreamRepo>/git/trees/<upstreamSha>?recursive=1 --jq '.tree[] | .path' | grep -i <symbol-or-filename>
   # then for any plausible file:
   gh api repos/<upstreamRepo>/contents/<path>?ref=<upstreamSha> --jq '.content' | base64 -d | grep -nE '<symbol>'
   ```

   If the symbol is genuinely absent / renamed / moved at the tested SHA, the root cause is a real upstream API break (even though it manifested at build time instead of test time — note this in the verdict but do not change the classification, the user has decided one binary signal is enough). If the symbol is still present, suspect either a version-pin mismatch in the consumer or an eco-ci override that's wrong.

7. **The pnpm overrides applied by eco-ci.** Many failures originate in `applyPackageOverrides` (utils.ts:818) and arise from sentinel-version overrides not resolving cleanly. If the stack trace passes through `applyPackageOverrides`, look at the suite's `overrides` object (already in hand from step 4) and verify each override key resolves at the consumer's lockfile. Cite the exact override that broke.

8. **State the root cause in one sentence**, with the cited evidence behind it. Acceptable shape: `<command> failed at <eco-ci function> because <verbatim error>; <minimal explanation tied to step 5/6/7 evidence>`. If after walking all 7 steps the cause is still genuinely unclear, write `⚠️ NEEDS REVIEW: ran out of evidence at step <N>; <what blocked the chain>`. Never paper over uncertainty with a confident-sounding guess.

A correctly walked chain produces a notes-cell entry like (this is the lynx-stack case from rspack run 26384019463):

> `lynx-stack: pnpm turbo build → create-rspeedy → rslib build → throws TypeError: rspack.experiments.EsmLibraryPlugin is not a constructor (rslib@0.19.6 calls a constructor that no longer exists in rspack@<tested-sha>; upstream API removed/renamed at tree path packages/rspack/src/exports.ts L<n>)`

Not:

> ~~`lynx-stack: build failed, looks like API change`~~ ← guess, not evidence

## Output format

**Language** — Reply in the user's preferred language (e.g. from any global instruction such as a `CLAUDE.md` "communicate in X" rule) and the language they are currently using in this conversation. If neither signals a preference, fall back to **English**. Only the surrounding prose translates; the status tokens (`✅ OK`, `🛑 ECO-CI SELF`, etc.), the table column headers, every verbatim error string, every command, every file path / line number / SHA, and any inline code stay in their original form so they remain greppable and copy-pasteable.

The reply has **two parts**:

1. A Markdown table with one row per stack — the at-a-glance verdict, kept tight enough to skim.
2. A `## Details` section **below** the table that contains the full evidence for every non-OK row, written as a proper Markdown ordered list.

The table cell can't carry a real list. Markdown table cells flatten newlines, and inline `<ol><li>` only renders on github.com — every other markdown renderer (Claude Code's terminal output, most editors, most chat apps) collapses it into a wall of run-on text, which is exactly what the user complained about. So the Notes cell stays a **one-line summary** and the actual list lives in `## Details` where ordered lists render properly everywhere.

Table column order and stack order:

```markdown
| Stack    | Status              | Run                                                                                     | Created              | Notes                                                                                                     |
| -------- | ------------------- | --------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| rsbuild  | ✅ OK               | [26380848398](https://github.com/rstackjs/rstack-ecosystem-ci/actions/runs/26380848398) | 2026-05-25 02:58 UTC | all suites passed                                                                                         |
| rsdoctor | ✅ OK (test failed) | [26018807250](…)                                                                        | 2026-05-18 07:07 UTC | rsbuild suite: 4 tests failed in vitest — see details                                                     |
| rslib    | ✅ OK               | [26382662636](…)                                                                        | 2026-05-25 04:07 UTC | all suites passed                                                                                         |
| rspack   | 🛑 ECO-CI SELF      | [26384019463](…)                                                                        | 2026-05-25 04:57 UTC | 2 framework failures (`_selftest`, `lynx-stack`) + 5 sibling jobs with vitest test failures — see details |
| rspress  | ✅ OK               | [26381920989](…)                                                                        | 2026-05-25 03:40 UTC | all suites passed                                                                                         |
| rstest   | ✅ OK               | [26382680571](…)                                                                        | 2026-05-25 04:08 UTC | all suites passed                                                                                         |
```

Followed by:

```markdown
## Details

### rspack — [26384019463](https://github.com/rstackjs/rstack-ecosystem-ci/actions/runs/26384019463)

1. **`execute-all (_selftest)`** — `pnpm install --prefer-frozen-lockfile --prefer-offline --no-strict-peer-dependencies` in the cloned `web-infra-dev/rspack-ecosystem-ci` → ` ERROR  packages field missing or empty`.
   Root cause: `applyPackageOverrides` (`utils.ts:818-908` @ `a3cd90c`) unconditionally writes a `pnpm-workspace.yaml` carrying only `overrides:` + `strictDepBuilds: false` into the consumer; the consumer pins `pnpm@9.15.2` (`package.json` engines), where `pnpm-workspace.yaml` is exclusively a workspace-definition file and must contain a non-empty `packages:` field. pnpm 9 bails out before installing anything → eco-ci framework bug, breaks every consumer still on pnpm <10.
2. **`execute-all (lynx-stack)`** — `pnpm turbo build` → `rslib build` (via `create-rspeedy`) → `TypeError: rspack.experiments.EsmLibraryPlugin is not a constructor`.
   Root cause: at upstream rspack SHA `b0bdcf836770d24a6303eeb97470a2990fce8fce`, `packages/rspack/src/exports.ts:415` exports `experiments` with `RsdoctorPlugin` / `RstestPlugin` / `RslibPlugin` / `RemoveDuplicateModulesPlugin` but **not** `EsmLibraryPlugin` (the source file `packages/rspack/src/builtin-plugin/EsmLibraryPlugin.ts` still exists, just isn't re-exported). The rslib version pulled in by lynx-stack still calls `new rspack.experiments.EsmLibraryPlugin(...)` → real upstream API removal; tests never ran so the binary rule classifies as eco-ci self.
3. Sibling jobs with legitimate test failures (separate from the two framework issues above): `rspress` 14/47 failed, `rslib` 1/78 failed, `rstest` 1/66 failed, `plugin` 1/21 failed, `rsdoctor` 1/58 failed — all show vitest `Summary of all failing tests:` and `Test Files X failed | Y passed`.
```

Single-error rows still get a `## Details` subsection — just a one-item list — so the format stays uniform and grep-friendly. OK rows get no subsection at all.

**Status vocabulary** (use exactly these strings so they stay greppable):

- `✅ OK` — run succeeded outright
- `✅ OK (test failed)` — eco-ci ran the suite cleanly; some tests reported failures (intended signal)
- `🛑 ECO-CI SELF` — eco-ci framework / setup failed; signal is not trustworthy
- `⚠️ NEEDS REVIEW` — ambiguous failure, log did not give a clean read
- `⚠️ CANCELLED` / `⚠️ TIMED OUT` — self-explanatory
- `⏳ IN PROGRESS` — run not yet completed

**Notes column (the one in the table)** — a single short line per row. Its job is to let a skimmer count problems and point them at the `## Details` section, not to carry evidence:

- **OK rows**: `all suites passed` (or the equivalent in the chosen language).
- **`✅ OK (test failed)` rows**: `<suite name>: N tests failed — see details` (or similar one-liner).
- **Single-error 🛑 / ⚠️ rows**: one short clause naming the failing job and the shape of the failure, ending with `— see details`. e.g. `pnpm install failed in tests/rsdoctor/rsbuild — see details`.
- **Multi-error 🛑 rows** (e.g. the rspack matrix, where `_selftest` and `lynx-stack` failed for different root causes): summarize as `N framework failures (<job-a>, <job-b>) — see details`. **Do not** put `<ol><li>` inside the cell — most renderers (Claude Code's terminal output, most editors, most chat clients) strip or flatten it and the cell turns into the run-on wall of text the user already pushed back on.

**`## Details` section** — the actual evidence chain, written as proper Markdown lists where renderers naturally break each item onto its own line.

- One `### <stack> — <run link>` heading per non-OK row in the table (no subsection for OK rows; their table cell already says everything).
- Underneath each heading, a real Markdown ordered list: `1. **\`<job-name>\`\*\* — <one-line summary of the failing command and verbatim error>.<newline-and-indent>Root cause: <Step 5/6/7 evidence, with file path + line + SHA / version cited inline>.`
- One list item per _distinct_ root cause. If a single run has both a framework failure and a separate set of legitimate vitest failures (rspack matrix), append a final list item like `Sibling jobs with legitimate test failures: <suite> X/Y failed, …` so the reader sees the whole picture in one place.
- Quote ≤80 chars of any verbatim error per item. Never paste log lines longer than one screen line. Always cite the file path + line + SHA / package version that backs the root-cause claim so the user can re-verify in two clicks.
- The list items are real Markdown — they MUST start with `1.` `2.` `3.` … on their own line, NOT be jammed onto one line separated by HTML. If a renderer can't break a numbered list onto separate lines, nothing else will save it.

After the table (and before `## Details`), add a one-line summary like:

> **Summary: 4 OK, 0 with legitimate test failures only, 2 eco-ci self-failures (rsdoctor, rspack).**

Do not narrate the analysis steps in prose elsewhere — the table + `## Details` already carry the evidence.

## Things to remember

- `gh run view --json jobs` returns step `name` exactly as it appears in the workflow YAML or as the `Run <uses-or-run>` auto-name. Match against the patterns in Step 3 verbatim.
- Skipped jobs (`execute-all (${{ inputs.suite }})`, the conditional `execute-selected-suite`) are normal artifacts of the matrix dispatch model — ignore them silently. Do not treat them as failures.
- The `--log-failed` flag only returns logs of failed steps, which keeps the payload manageable. Always pull the _full_ `--log-failed` for any failing run before doing Step 5 — grep snippets are fine for classification, but root-causing needs the chronological context.
- The rspack run typically has 12 parallel suite jobs in the matrix; do not panic if many are red — check each, the verdict is per-run not per-job. Different jobs in the same run very often fail for different reasons; treat each one as its own evidence chain in Step 5 (and present them as an ordered list in the Notes cell).
- **Never read source files from the local filesystem.** Do not assume `~/Projects/rstack-ecosystem-ci`, `~/code/rspack`, or any other local checkout exists — those paths exist on the skill author's machine, not on whichever machine the skill is currently running. Every code lookup goes through `gh api repos/<owner>/<repo>/contents/<path>?ref=<sha>`. If you find yourself wanting to `cat` or `Read` a path under `~/Projects` or the cwd, stop and re-do the lookup through `gh api`. This also means the user's local working directory state (uncommitted changes, branch checkouts) is irrelevant — the evidence chain lives entirely in remote refs.
- Pin every code lookup to a specific ref (`?ref=<sha>`). The `main` branch moves; an answer that quoted `main` an hour ago may not reproduce. Use the run's `head_sha` for eco-ci files and the run's `commitSHA` input for upstream-stack files.
- The first error in a failed log is the cause; everything after is usually cascading noise (turbo lock contention, sibling-package failures triggered by the dependency it broke, cleanup errors). When in doubt, sort by timestamp and trust the earliest. `Blocking waiting for file lock on package cache` is almost always a symptom, not a cause.
- If `gh` returns an auth error, surface it directly; do not silently swap to `WebFetch`.
