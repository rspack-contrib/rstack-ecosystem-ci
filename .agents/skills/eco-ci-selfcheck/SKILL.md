---
name: eco-ci-selfcheck
description: Self-check for the rstack ecosystem CI framework. Audits the latest GitHub Actions runs of the six `*-ci-from-commit` workflows in `rstackjs/rstack-ecosystem-ci` and reports, in a Markdown table, whether each failure's root cause lives in the eco-ci framework / infra (signal is untrustworthy — fix this repo first) or in real upstream↔consumer business code (signal is trustworthy — the framework's job is done, regardless of whether the crash happened during vitest, build, install, or a prepare-lifecycle hook). Use this whenever the user asks to self-check, sanity-check, audit, or "see the health of" the rstack ecosystem CI, the latest `from-commit` runs, or anything along the lines of "did eco-ci actually run the suites" / "is eco-ci itself healthy" — even when the user does not name the workflows explicitly.
---

# eco-ci-selfcheck

Self-check for the rstack ecosystem CI framework. Audit the latest run of each `*-ci-from-commit` workflow in `rstackjs/rstack-ecosystem-ci` and report **whether the failure root cause lives in the eco-ci framework / infra, or in the upstream-stack ↔ consumer pair the framework is trying to exercise.** The CI stage at which the failure surfaced (prepare-lifecycle hook, `pnpm install`, `pnpm build`, `tsc --build`, vitest) is irrelevant — eco-ci's whole job is to expose upstream↔consumer breakage, and an upstream change can break a consumer at any one of those stages. A `pnpm install` that triggers a consumer's `prepare` script which then crashes inside upstream code is still a legitimate ecosystem signal; what matters is whether the crashing code is framework code or business code.

## Why this distinction matters

The from-commit workflows are dispatched by the six upstream stack repos on every push to main. Their job is to verify that the upstream change does not break downstream consumers. Two failure shapes look identical at the GitHub UI level (red X), but mean very different things:

- **🛑 ECO-CI SELF** — the failure root cause is in this repo's code / wiring / infra. Examples: binding artifact didn't download, Verdaccio publish failed, `pnpm install` blew up at the eco-ci repo root (not a consumer's repo), `applyPackageOverrides` in `utils.ts` wrote out an invalid `pnpm-workspace.yaml`, eco-ci didn't opt out of a new pnpm policy and got rejected, `actions/checkout` 502'd. The signal is not trustworthy until we fix this repo.
- **✅ OK (legitimate ecosystem signal)** — the framework worked. It cloned the consumer, applied the overrides, kicked off the consumer's own scripts, and at some point something crashed because upstream-stack code + current consumer code are no longer compatible. The crashing stage doesn't matter: vitest assertion failures, `tsc --build` errors against renamed upstream exports, a `pnpm install` whose `prepare` lifecycle invokes upstream code that throws, a templating error inside an upstream html plugin — these are all legitimate ecosystem signals. Whose "fault" it is (upstream changed a sync API to async; downstream hook never awaited it; both share the blame) is often genuinely ambiguous; the framework's job is to expose the incompatibility, not to apportion blame. Don't try to.

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

If _any_ failed step in the job is NOT a suite-run step → 🛑 ECO-CI SELF. The pre-suite steps are `Set up job`, `Run actions/checkout@…`, `Run moonrepo/setup-rust@…`, `Run ./.github/actions/build-<stack>`, `Run pnpm i --frozen-lockfile`, `Expose GitHub Runtime`, `Publish rspack to Verdaccio`. Any of these failing means the framework's own machinery broke before it ever invoked the consumer; the signal can't be trusted until we fix our own setup. Failures in the `Prepare Rspack Binding` job (rspack only) also fall here.

If the _only_ failed steps are suite-run steps → proceed to Step 4 (log inspection). The suite-run step is the boundary: inside it eco-ci does framework work (`applyPackageOverrides`, `runInRepo` housekeeping) _and_ runs consumer scripts, and the verdict depends on which side threw.

### Step 4 — Inspect the suite-run step log: framework throw, or business throw?

Fetch the failed log:

```bash
gh run view --repo rstackjs/rstack-ecosystem-ci <runId> --log-failed > /tmp/ecoci-<runId>.log
```

The verdict here is binary: **was the crashing code framework code, or consumer / upstream-stack business code?** Stage doesn't matter. A `pnpm install` that explodes can still be a legitimate signal; vitest assertions can still be eco-ci's fault if eco-ci wrote a malformed input.

**🛑 ECO-CI SELF markers** — find _any one_ and classify as ECO-CI SELF:

- The first chronological error's stack frame is in `utils.ts` _and_ the message describes a framework-internal action that produced an invalid input to the underlying tool (e.g. `applyPackageOverrides` wrote a `pnpm-workspace.yaml` missing a required field → pnpm rejects it; a sentinel-version override doesn't resolve; eco-ci copied a malformed `package.json`).
- pnpm / corepack / cargo / Node itself crashes or refuses to start because of how _we_ configured the runner (e.g. `[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION]` because eco-ci didn't opt out of a new pnpm policy; `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` from a stale corepack pin; `corepack` can't reach the registry).
- Network / infra: `ECONNRESET`, `ENETUNREACH`, `fatal: unable to access`, registry 5xx, GitHub artifact download failure, `Cannot find module '@rspack/binding-*'` (binding artifact didn't land), `Failed to save cache` _that actually breaks the job_.
- The error originates in an action we own (`build-<stack>`, `prepare-rspack-binding`, `publish-rspack-to-verdaccio`) and is not caused by a consumer's code.

**✅ OK markers** — find _any one_ and classify as ✅ OK (legitimate ecosystem signal; the framework worked):

- vitest reported failures: `Test Files \d+ (failed|passed)`, `Tests\s+\d+ (failed|passed)`, `Summary of all failing tests:`, `test succeed \d+, failed \d+` (from `tests/rsbuild/plugins.ts` aggregator), `\S+ test failed:` (per-repo failure line).
- Consumer's `prepare` lifecycle / build / typecheck crashed because of upstream code: stack trace lands in upstream-stack source (`@rsbuild/core/.../html.ts`, `@rspack/core/.../index.js`, etc.) or in consumer code reacting to an upstream change. Classic shapes: `ReferenceError: <var> is not defined` in a consumer template rendered by an upstream plugin; `TypeError: X is not a constructor` against an upstream export that got renamed; `error TS2305: Module 'X' has no exported member 'Y'` against upstream type declarations.
- `pnpm install` failed inside a _consumer_ repo because the consumer's lockfile / peer-deps / registry policy disagrees with what upstream is shipping (e.g. consumer pins an old peer that the new upstream sentinel doesn't satisfy).
- Any `ELIFECYCLE  Command failed with exit code 1` whose preceding error line points to consumer / upstream business code rather than a framework concern.

**Disambiguator when both could fit** — read the bottom of the JS stack trace in `--log-failed`. If the deepest frame is in `utils.ts` and the wrapped command is something eco-ci synthesized (an install of a path eco-ci just wrote into), inspect what eco-ci wrote and grade _that_. If the deepest frame is in `@rsbuild/...`, `@rspack/...`, `node_modules/.../<consumer-source>`, or in a template / config the consumer authored, it's a business signal.

If the log is genuinely ambiguous → ⚠️ NEEDS REVIEW. Proceed to Step 5 either way to root-cause.

### Step 5 — Root-cause the failure (mandatory for every non-OK row; evidence chain, no guessing)

Even a `✅ OK` row whose status came from a real ecosystem signal needs a root cause stated, so the user knows which upstream/downstream team to ping. A `🛑 ECO-CI SELF` verdict without a root cause is useless. Investigate every failing job along an explicit evidence chain. Quote verbatim from logs / API responses; do not infer from memory.

**Do not assume any source files exist on the local filesystem.** This skill runs on arbitrary machines that may not have a checkout of `rstackjs/rstack-ecosystem-ci`, the upstream stack repo, or any consumer repo. Read everything you need through the GitHub API:

```bash
# Read a file from a repo at a specific ref (commit SHA, branch, or tag)
gh api 'repos/<owner>/<repo>/contents/<path>?ref=<sha>' --jq '.content' | base64 -d

# Read commit metadata + changed files
gh api 'repos/<owner>/<repo>/commits/<sha>'

# List directory contents
gh api 'repos/<owner>/<repo>/contents/<dir>?ref=<sha>' --jq '.[] | .name'
```

(Always single-quote the URL — `fish` expands `?` as a glob otherwise and you get `(eval):2: no matches found`.)

**Evidence chain — walk all of these in order, for every failing job:**

1. **The trigger.** Pull the dispatching workflow's inputs:

   ```bash
   gh run view --repo rstackjs/rstack-ecosystem-ci <runId> --json event,displayTitle,headBranch,headSha
   gh api repos/rstackjs/rstack-ecosystem-ci/actions/runs/<runId> --jq '{event, name, head_branch, head_sha, run_attempt}'
   ```

   For `workflow_dispatch`, the upstream commit being tested is in the dispatch payload. Extract it from any execute job's log by grepping for `repository: web-infra-dev/<stack>` followed by `ref: <40-hex>` (this is the `build-<stack>` action's checkout argument). Record: `upstreamRepo`, `upstreamSha`.

2. **The first chronological error.** `gh run view --log-failed` returns chronological lines for failed steps; find the _earliest_ line that is genuinely an error (skip `WARN`, `[WARN]`, deprecation notices). Quote it verbatim. The first error is the root; everything after may be cascades / cleanup noise / lock-contention from parallel workers and is usually not the cause.

3. **The failing command.** Right above the throw is the `$> <command>` group line, e.g. `$> pnpm turbo build` or `$> pnpm install …`. Record it exactly.

4. **The caller in eco-ci.** The Node stack trace will end in `utils.ts:<line>` (almost always `:103`, the generic `$` wrapper), then one frame up will point into `utils.ts` or `tests/<stack>/<suite>.ts`. The latter tells you which suite definition is responsible. Fetch it through the API at the same SHA as the run:

   ```bash
   gh api 'repos/rstackjs/rstack-ecosystem-ci/contents/tests/<stack>/<suite>.ts?ref=<run-head-sha>' --jq '.content' | base64 -d
   ```

   Record: the `repo` / `branch` / `test:` array / overrides the suite passes to `runInRepo`. This tells you which downstream consumer repo + ref was being exercised.

5. **The downstream consumer.** Cross-check that the consumer repo (from step 4) actually exists at the ref the suite asks for, and that the failing command (from step 3) maps to a real script in its `package.json`:

   ```bash
   gh api 'repos/<consumer-owner>/<consumer-repo>/contents/package.json?ref=<consumer-ref>' --jq '.content' | base64 -d
   ```

   Most suites pull the consumer's `branch: 'main'` HEAD on each run; if so, extract the actual HEAD SHA from the suite-run log (`git log -1 --format='%H'` or `git rev-parse HEAD` lines that eco-ci's `runInRepo` prints) and pin all subsequent consumer lookups to _that_ SHA. If the failing script is missing or renamed at the pinned ref, that _is_ the root cause. If it exists, look at what it does (often it chains `rslib build` / `vitest` / `pnpm -r build` / a `prepare` lifecycle / etc.).

6. **First-bad-commit bisect (always do this whenever the verdict is not pure ECO-CI SELF infrastructure).** The PR being tested is rarely the _actual_ culprit. Concrete example: rsbuild PR `4dfeadef` was a "test: simplify path resolution in entry" patch that only touched `e2e/cases/**`, yet the modernjs suite still crashed during `pnpm install`'s `prepare` lifecycle with `ReferenceError: mountId is not defined`. The real culprit was the _previous_ merged rsbuild commit `c84542d` (#7773), which silently turned `getTemplateParameters` from sync to async; modernjs's `parseCommonConfig.ts` hook never awaited it, so spreading the Promise dropped `mountId`. Without the bisect step you would have written "the PR seems unrelated to the symptom" and stopped — which is exactly the failure mode this step exists to prevent.

   Run the bisect unconditionally for every failing suite job (not just the suspicious ones — the marginal cost is six API calls, the cost of skipping it is a wrong verdict).

   ```bash
   # List the last ~10 runs of the same workflow.
   gh run list --repo rstackjs/rstack-ecosystem-ci \
     --workflow "<stack>-ecosystem-ci-from-commit.yml" \
     --limit 10 \
     --json databaseId,conclusion,createdAt,displayTitle \
     --jq '.[] | "\(.databaseId)  \(.createdAt)  \(.conclusion)"'

   # For each candidate run, check whether the same suite job was failing.
   gh run view --repo rstackjs/rstack-ecosystem-ci <candidateRunId> --json jobs \
     --jq '.jobs[] | select(.name | contains("<failing-suite-name>")) | {name, conclusion}'

   # Extract the upstream `ref:` for each candidate from its build-<stack> checkout log.
   gh run view --repo rstackjs/rstack-ecosystem-ci <candidateRunId> --log 2>&1 \
     | grep -E "^execute-all .* repository: web-infra-dev/<stack>|^execute-all .* ref: [0-9a-f]{40}" \
     | head -2
   ```

   Walk back until you find the transition `success → failure`. The upstream SHA on the first-failing run is the first-bad commit. Diff it:

   ```bash
   gh api 'repos/<upstreamRepo>/commits/<first-bad-sha>' \
     --jq '{msg: .commit.message, files: [.files[] | {filename, additions, deletions}]}'

   gh api 'repos/<upstreamRepo>/commits/<first-bad-sha>' \
     --jq '.files[] | select(.filename | contains("<relevant-path>")) | .patch'
   ```

   Cite the first-bad SHA, its PR title, and the relevant patch hunk in the verdict. If every recent run has the same failure (no success in the last 10), say so — it means the regression is older than the bisect window.

7. **The actual API / file / symbol named in the error.** If the error message names a specific symbol (e.g. `rspack.experiments.EsmLibraryPlugin is not a constructor`), a missing module, or a broken patch, verify against the upstream stack repo _at the SHA being tested_:

   ```bash
   gh api 'repos/<upstreamRepo>/git/trees/<upstreamSha>?recursive=1' --jq '.tree[] | .path' | grep -i <symbol-or-filename>
   # then for any plausible file:
   gh api 'repos/<upstreamRepo>/contents/<path>?ref=<upstreamSha>' --jq '.content' | base64 -d | grep -nE '<symbol>'
   ```

   If the symbol is genuinely absent / renamed / moved at the tested SHA, the root cause is a real upstream API change (regardless of which CI stage surfaced it) → ✅ OK with a clear ecosystem signal; name both upstream and consumer in the verdict. If the symbol is still present, suspect either a version-pin mismatch in the consumer or an eco-ci override that's wrong (the latter shifts the verdict back toward 🛑 ECO-CI SELF).

8. **The pnpm overrides applied by eco-ci.** Many failures originate in `applyPackageOverrides` (`utils.ts`) and arise from sentinel-version overrides not resolving cleanly or from the framework writing files the underlying tool can't accept. If the stack trace passes through `applyPackageOverrides`, look at the suite's `overrides` object (from step 4), the file eco-ci synthesized (read it from the log if visible), and verify each override key resolves at the consumer's lockfile. If eco-ci's _own_ output is the input that broke the tool, that's 🛑 ECO-CI SELF — cite the exact override or written file that broke.

9. **State the root cause in one sentence**, with the cited evidence behind it. For ✅ OK rows that surfaced real upstream/downstream breakage, name **both sides** so the user knows whom to ping — e.g. `upstream <stack> at <SHA> (#<PR>) changed X to async; consumer <name> hook at <path>:<line> never awaited it`. For 🛑 ECO-CI SELF rows, name the framework function / step + the synthesized input that broke. If after walking all eight steps the cause is still genuinely unclear, write `⚠️ NEEDS REVIEW: ran out of evidence at step <N>; <what blocked the chain>`. Never paper over uncertainty with a confident-sounding guess.

A correctly walked chain produces a notes-cell entry like (this is the rsbuild ↔ modernjs case from rsbuild run 26557329578):

> `modernjs: pnpm install's prepare lifecycle → modern build → @rsbuild/core's html-rspack-plugin throws ReferenceError: mountId is not defined. First-bad upstream commit c84542d (fix(core): support async html template parameters, rsbuild#7773) flipped getTemplateParameters to async; modernjs's parseCommonConfig.ts:176 hook spreads the Promise without awaiting, so mountId gets dropped from templateParameters. Ping rsbuild + modernjs. → ✅ OK (legitimate ecosystem signal).`

Not:

> ~~`modernjs: build failed, probably an rsbuild change`~~ ← guess, not evidence

## Output format

**Language** — Reply in the user's preferred language (e.g. from any global instruction such as a `CLAUDE.md` "communicate in X" rule) and the language they are currently using in this conversation. If neither signals a preference, fall back to **English**. Only the surrounding prose translates; the status tokens (`✅ OK`, `🛑 ECO-CI SELF`, etc.), the table column headers, every verbatim error string, every command, every file path / line number / SHA, and any inline code stay in their original form so they remain greppable and copy-pasteable.

The reply has **two parts**:

1. A Markdown table with one row per stack — the at-a-glance verdict, kept tight enough to skim.
2. A `## Details` section **below** the table that contains the full evidence for every non-pure-passing row, written as a proper Markdown ordered list.

The table cell can't carry a real list. Markdown table cells flatten newlines, and inline `<ol><li>` only renders on github.com — every other markdown renderer (Claude Code's terminal output, most editors, most chat apps) collapses it into a wall of run-on text. So the Notes cell stays a **one-line summary** and the actual list lives in `## Details` where ordered lists render properly everywhere.

Table column order and stack order:

```markdown
| Stack    | Status         | Run                                                                                     | Created              | Notes                                                                                                                 |
| -------- | -------------- | --------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| rsbuild  | ✅ OK          | [26557329578](https://github.com/rstackjs/rstack-ecosystem-ci/actions/runs/26557329578) | 2026-05-28 05:50 UTC | modernjs prepare lifecycle crashed: rsbuild#7773 (async templateParameters) ↔ modernjs hook not awaited — see details |
| rsdoctor | ✅ OK          | [26018807250](…)                                                                        | 2026-05-18 07:07 UTC | rsbuild suite: 4 vitest tests failed — see details                                                                    |
| rslib    | ✅ OK          | [26382662636](…)                                                                        | 2026-05-25 04:07 UTC | all suites passed                                                                                                     |
| rspack   | 🛑 ECO-CI SELF | [26384019463](…)                                                                        | 2026-05-25 04:57 UTC | 1 framework failure (`_selftest`); 6 sibling jobs surfaced real upstream↔consumer breakage — see details              |
| rspress  | ✅ OK          | [26381920989](…)                                                                        | 2026-05-25 03:40 UTC | all suites passed                                                                                                     |
| rstest   | ✅ OK          | [26382680571](…)                                                                        | 2026-05-25 04:08 UTC | all suites passed                                                                                                     |
```

Followed by:

```markdown
## Details

### rspack — [26384019463](https://github.com/rstackjs/rstack-ecosystem-ci/actions/runs/26384019463)

1. **🛑 `execute-all (_selftest)`** — `pnpm install --prefer-frozen-lockfile --prefer-offline --no-strict-peer-dependencies` in the cloned `web-infra-dev/rspack-ecosystem-ci` → ` ERROR  packages field missing or empty`.
   Root cause: `applyPackageOverrides` (`utils.ts:818-908` @ `a3cd90c`) unconditionally writes a `pnpm-workspace.yaml` carrying only `overrides:` + `strictDepBuilds: false` into the consumer; the consumer pins `pnpm@9.15.2` (`package.json` engines), where `pnpm-workspace.yaml` is exclusively a workspace-definition file and must contain a non-empty `packages:` field. pnpm 9 bails out before installing anything. Framework's own output broke the tool → 🛑 ECO-CI SELF. Fix in this repo.
2. **✅ `execute-all (lynx-stack)` — real ecosystem signal** — `pnpm turbo build` → `rslib build` (via `create-rspeedy`) → `TypeError: rspack.experiments.EsmLibraryPlugin is not a constructor`.
   Root cause: at upstream rspack SHA `b0bdcf836770d24a6303eeb97470a2990fce8fce`, `packages/rspack/src/exports.ts:415` exports `experiments` with `RsdoctorPlugin` / `RstestPlugin` / `RslibPlugin` / `RemoveDuplicateModulesPlugin` but **not** `EsmLibraryPlugin` (the source file `packages/rspack/src/builtin-plugin/EsmLibraryPlugin.ts` still exists, just isn't re-exported). The rslib version pulled in by lynx-stack still calls `new rspack.experiments.EsmLibraryPlugin(...)`. Real upstream API removal — ping rspack + rslib.
3. Other sibling jobs with legitimate vitest failures: `rspress` 14/47 failed, `rslib` 1/78 failed, `rstest` 1/66 failed, `plugin` 1/21 failed, `rsdoctor` 1/58 failed — all show vitest `Summary of all failing tests:` and `Test Files X failed | Y passed`. All ✅ OK ecosystem signals; ping the respective owners.
```

Single-error rows still get a `## Details` subsection — just a one-item list — so the format stays uniform and grep-friendly. Pure-passing rows (Notes = `all suites passed`) get no subsection. ✅ OK rows that surfaced a real incompatibility (single-error or multi-error) DO get a subsection — the user needs the evidence to know whom to ping.

**Status vocabulary** (use exactly these strings so they stay greppable):

- `✅ OK` — eco-ci framework worked. Whether the run had zero failures, vitest assertions, a `prepare` lifecycle crash from upstream↔consumer drift, or a `tsc --build` failure against renamed upstream exports, it's all the same status; the Notes column carries the nature.
- `🛑 ECO-CI SELF` — failure root cause lives in this repo's code / wiring / infra; signal is not trustworthy.
- `⚠️ NEEDS REVIEW` — ambiguous failure, log did not give a clean read.
- `⚠️ CANCELLED` / `⚠️ TIMED OUT` — self-explanatory.
- `⏳ IN PROGRESS` — run not yet completed.

There is no `✅ OK (test failed)` sub-state any more. Tests-passed-but-vitest-reported-failures lives in the Notes column, not in the status token — historically that sub-state implied vitest-stage failures were "more legitimate" than build/install-stage failures, which is exactly the bias the new model rejects.

**Notes column (the one in the table)** — a single short line per row. Its job is to let a skimmer count problems and point them at the `## Details` section, not to carry evidence:

- **Pure-passing ✅ OK rows**: `all suites passed` (or the equivalent in the chosen language).
- **✅ OK rows with vitest test failures**: `<suite>: N vitest tests failed — see details`.
- **✅ OK rows with non-vitest ecosystem signals** (prepare-lifecycle crash, build/typecheck against renamed upstream API, consumer install failed against upstream sentinel, etc.): one-clause description identifying the failing consumer + the upstream side, e.g. `modernjs prepare lifecycle crashed: rsbuild#7773 ↔ modernjs hook not awaited — see details` or `lynx-stack TS build broke: rspack removed @rspack/test-tools exports — see details`. **Always name both sides** so the user knows who needs pinging without opening Details.
- **🛑 ECO-CI SELF rows**: one short clause naming the framework step / file that broke, ending with `— see details`. e.g. `applyPackageOverrides wrote invalid pnpm-workspace.yaml — see details`.
- **Mixed rows** (some jobs framework-broken, others surfacing real signals — like the rspack matrix case): summarize as `<N> framework failure(s) (<job-a>, <job-b>); <M> sibling jobs surfaced real upstream↔consumer breakage — see details`. **Do not** put `<ol><li>` inside the cell — most renderers (Claude Code's terminal output, most editors, most chat clients) strip or flatten it.

**`## Details` section** — the actual evidence chain, written as proper Markdown lists where renderers naturally break each item onto its own line.

- One `### <stack> — <run link>` heading per non-pure-passing row in the table.
- Underneath each heading, a real Markdown ordered list. Prefix each item with its per-job verdict so the reader can sort framework-bugs from ecosystem-signals at a glance: `1. **🛑 \`<job-name>\`** — <one-line summary of the failing command and verbatim error>.<newline-and-indent>Root cause: <evidence with file path + line + SHA / version cited inline>.`or`1. **✅ \`<job-name>\` — real ecosystem signal\*\* — …`.
- One list item per _distinct_ root cause. Mixed runs put the 🛑 framework-failure items first and the ✅ ecosystem-signal items after, so the user sees "what we have to fix in this repo" before "what we have to ping the owners about."
- Quote ≤80 chars of any verbatim error per item. Never paste log lines longer than one screen line. Always cite the file path + line + SHA / package version that backs the root-cause claim so the user can re-verify in two clicks. For every non-vitest ecosystem signal, also cite the first-bad upstream commit from Step 5 sub-step 6.
- The list items are real Markdown — they MUST start with `1.` `2.` `3.` … on their own line, NOT be jammed onto one line separated by HTML.

After the table (and before `## Details`), add a one-line summary like:

> **Summary: 4 pure ✅ OK; 1 ✅ OK with real ecosystem signal (rsbuild ↔ modernjs); 1 🛑 ECO-CI SELF (rspack `_selftest` — applyPackageOverrides bug).**

Do not narrate the analysis steps in prose elsewhere — the table + `## Details` already carry the evidence.

## Things to remember

- `gh run view --json jobs` returns step `name` exactly as it appears in the workflow YAML or as the `Run <uses-or-run>` auto-name. Match against the patterns in Step 3 verbatim.
- Skipped jobs (`execute-all (${{ inputs.suite }})`, the conditional `execute-selected-suite`) are normal artifacts of the matrix dispatch model — ignore them silently. Do not treat them as failures.
- The `--log-failed` flag only returns logs of failed steps, which keeps the payload manageable. Always pull the _full_ `--log-failed` for any failing run before doing Step 5 — grep snippets are fine for classification, but root-causing needs the chronological context.
- The rspack run typically has 12 parallel suite jobs in the matrix; do not panic if many are red — check each, the verdict is per-run not per-job. Different jobs in the same run very often fail for different reasons; treat each one as its own evidence chain in Step 5 (and present them as separate ordered-list items in `## Details`).
- **"The PR being tested" is rarely the actual culprit.** Always run Step 5 sub-step 6 (first-bad-commit bisect), unconditionally, for every failing suite job. The from-commit dispatch is fired per push to upstream main; if a regression landed in commit N and broke a downstream consumer that hasn't caught up, every push after N (N+1, N+2, …) keeps tripping the same failure even when the PR's diff is unrelated to the symptom. Without the bisect you will write "the PR seems unrelated, root cause unclear" and stop — that's exactly the failure mode this step exists to prevent.
- **Don't try to apportion blame between upstream and downstream.** When upstream changes a function from sync to async and the consumer's hook never awaited it, both share fault. State both sides in the verdict (`upstream <stack> at <SHA> changed X; consumer <name> at <path>:<line> doesn't handle it`) and let the maintainers sort it out. The framework's job is to surface the incompatibility, not to decide whose ticket it is.
- **Stage of the crash doesn't change the verdict.** A `pnpm install` whose `prepare` lifecycle throws inside upstream code is just as legitimate an ecosystem signal as a vitest assertion. The framework decoupling rule is `framework code throws → 🛑 ECO-CI SELF; business code throws → ✅ OK`. Drop the older "tests must have run for the signal to count" heuristic — it caused mis-attributions where real upstream breakage got blamed on this repo.
- **Never read source files from the local filesystem.** Do not assume `~/Projects/rstack-ecosystem-ci`, `~/code/rspack`, or any other local checkout exists — those paths exist on the skill author's machine, not on whichever machine the skill is currently running. Every code lookup goes through `gh api 'repos/<owner>/<repo>/contents/<path>?ref=<sha>'`. If you find yourself wanting to `cat` or `Read` a path under `~/Projects` or the cwd, stop and re-do the lookup through `gh api`. This also means the user's local working directory state (uncommitted changes, branch checkouts) is irrelevant — the evidence chain lives entirely in remote refs.
- **Single-quote every `gh api` URL** when running under `fish`. `?ref=…` triggers fish's glob expansion otherwise and you get `(eval):2: no matches found`. `bash` / `zsh` are looser but quoting unconditionally is cheaper than remembering the shell.
- Pin every code lookup to a specific ref (`?ref=<sha>`). The `main` branch moves; an answer that quoted `main` an hour ago may not reproduce. Use the run's `head_sha` for eco-ci files and the run's upstream `ref:` (captured in Step 5.1) for upstream-stack files.
- The first error in a failed log is the cause; everything after is usually cascading noise (turbo lock contention, sibling-package failures triggered by the dependency it broke, cleanup errors). When in doubt, sort by timestamp and trust the earliest. `Blocking waiting for file lock on package cache` is almost always a symptom, not a cause.
- If `gh` returns an auth error, surface it directly; do not silently swap to `WebFetch`.
