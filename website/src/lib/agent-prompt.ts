import type { EcosystemCommitHistory, EcosystemCommitRecord } from '@/types';

/**
 * Matches a release commit message across all stacks.
 *
 * Captures every release convention seen in rstack-ecosystem-ci history:
 *   rspack:   "chore: release v2.0.0-beta.8", "release: 2.0.0-beta.9",
 *             "chore(release): release 2.0.0-rc.2"
 *   rsbuild:  "release: v2.0.0-beta.11"
 *   rslib:    "Release v0.20.2"
 *   rstest:   "release: 0.9.5"
 *   rsdoctor: "release v1.5.5"
 *   rspress:  "Release v2.0.7"
 *
 * Grammar: optional `chore[(scope)]:` prefix, then `release`, then
 * any punctuation/space, then a version digit (optionally preceded by `v`).
 */
const RELEASE_PATTERN = /^(chore(\([^)]+\))?:\s*)?release[:\s]*v?\d/i;

/** Fallback cap when no release commit is found in the history window. */
const WINDOW_CAP = 50;

function shortSha(sha: string) {
  return sha.slice(0, 7);
}

function extractPrNumber(message: string): number | null {
  const m = message.match(/\(#(\d+)\)\s*$/);
  return m ? Number(m[1]) : null;
}

function isReleaseCommit(message: string): boolean {
  return RELEASE_PATTERN.test(message);
}

interface HistoryWindow {
  /** Newest → oldest, inclusive of both the target commit and the prev release (when found). */
  window: EcosystemCommitHistory;
  /** The prev release commit that bounds the window (included as the last entry of `window`). */
  bound: EcosystemCommitRecord | null;
}

/**
 * Returns the slice of history starting AT the target commit and extending
 * backward through (and INCLUDING) the most recent release commit older than
 * the target. Capped at WINDOW_CAP entries when no release commit is found.
 *
 * The prev release commit is included because the diagnosis flow may need to
 * compare its failure signature against the current one (Case B below).
 */
function buildWindow(
  history: EcosystemCommitHistory,
  targetSha: string,
): HistoryWindow {
  const startIdx = history.findIndex((r) => r.commitSha === targetSha);
  if (startIdx === -1) {
    return { window: [], bound: null };
  }

  const windowEntries: EcosystemCommitRecord[] = [];
  let bound: EcosystemCommitRecord | null = null;

  for (let i = startIdx; i < history.length; i++) {
    const entry = history[i];
    windowEntries.push(entry);
    if (i > startIdx && isReleaseCommit(entry.commitMessage)) {
      bound = entry;
      break;
    }
    if (windowEntries.length >= WINDOW_CAP) {
      break;
    }
  }

  return { window: windowEntries, bound };
}

interface SuiteTableResult {
  table: string;
  /** True if every row with data for this suite is a failure. */
  allFailure: boolean;
}

function buildSuiteTable(
  suiteName: string,
  window: EcosystemCommitHistory,
  boundSha: string | null,
): SuiteTableResult {
  // Render oldest → newest so that a ✓→✗ transition reads naturally
  // top-to-bottom (forward in time).
  const ordered = [...window].reverse();

  const rows: string[] = [];
  let seenSuccess = false;
  let sawSuite = false;

  for (const entry of ordered) {
    const suite = entry.suites.find((s) => s.name === suiteName);
    if (!suite) {
      continue;
    }
    sawSuite = true;
    if (suite.status === 'success') {
      seenSuccess = true;
    }
    const statusCell =
      suite.status === 'failure'
        ? `✗ ${suite.logUrl ?? '(no log url)'}`
        : suite.status === 'success'
          ? '✓'
          : '— (cancelled)';
    const msg = entry.commitMessage.replace(/\|/g, '\\|');
    const tag = entry.commitSha === boundSha ? ' _(prev release)_' : '';
    rows.push(
      `| ${shortSha(entry.commitSha)} | ${msg}${tag} | ${statusCell} |`,
    );
  }

  const header =
    '| Commit (oldest → newest) | Message | Status / Log |\n|--------------------------|---------|--------------|';

  const body =
    rows.length > 0
      ? rows.join('\n')
      : '| — | (suite not present in window) | — |';

  return {
    table: `${header}\n${body}`,
    allFailure: sawSuite && !seenSuccess,
  };
}

export interface BuildPromptInput {
  entry: EcosystemCommitRecord;
  stackId: string;
  history: EcosystemCommitHistory;
}

export function buildAgentPrompt({
  entry,
  stackId,
  history,
}: BuildPromptInput): string {
  const failingSuites = entry.suites.filter((s) => s.status === 'failure');
  const upstreamRepo = entry.repository.fullName;
  const commitUrl = `https://github.com/${upstreamRepo}/commit/${entry.commitSha}`;
  const prNumber = extractPrNumber(entry.commitMessage);
  const prLink = prNumber
    ? `https://github.com/${upstreamRepo}/pull/${prNumber}`
    : null;

  const { window, bound } = buildWindow(history, entry.commitSha);

  const suiteNames = Array.from(
    new Set(history.flatMap((r) => r.suites.map((s) => s.name))),
  ).sort();

  const boundDescription = bound
    ? `bounded by (and including) the most recent release commit \`${shortSha(bound.commitSha)}\` — "${bound.commitMessage}"`
    : `capped at the ${window.length} most recent commits (no release commit found within that range)`;

  const suiteSections = failingSuites.map((suite) => {
    const { table, allFailure } = buildSuiteTable(
      suite.name,
      window,
      bound?.commitSha ?? null,
    );
    return { name: suite.name, table, allFailure };
  });

  const perSuiteMarkdown = suiteSections
    .map(({ name, table }) => `### ${name}\n\n${table}`)
    .join('\n\n');

  const anyAllFailure = suiteSections.some((s) => s.allFailure);

  const failingSuiteList = failingSuites.map((s) => `\`${s.name}\``).join(', ');

  const suiteListSentence = suiteNames.length
    ? `Each "suite" is one downstream project (${suiteNames.map((n) => `\`${n}\``).join(', ')}) running its own test/build command against the ${stackId} under test.`
    : `Each "suite" is one downstream project running its own test/build command against the ${stackId} under test.`;

  const allFailureBlock = anyAllFailure
    ? `
- **Case B — all ✗ in the window.** At least one suite has been failing since (or before) the prev release row. For those suites, compare the current failure log against the **prev release row's** log:
  - **Same root cause** (same error at a similar spot — you decide; don't require identical stack frames): stop here. Report "this has been broken since at least ${bound ? shortSha(bound.commitSha) : 'the window boundary'}; the current run is the same failure."
  - **Different root cause**: the failure mutated somewhere in between. Binary-search the ✗ rows to find where the signature changes (≈log₂N log fetches, not N). Report that pivot commit as the one that changed the failure mode.
`
    : '';

  return `I'm a maintainer of ${stackId}. Please help me investigate why the rstack-ecosystem-ci pipeline is failing on a recent commit to ${stackId} \`main\`.

## What is rstack-ecosystem-ci?

rstack-ecosystem-ci (https://github.com/rstackjs/rstack-ecosystem-ci) is an integration CI pipeline for the Rstack ecosystem. On every push to ${stackId} \`main\` it runs a matrix of downstream ecosystem projects against the freshly built ${stackId} artifact to catch ecosystem-level regressions before release. ${suiteListSentence} A suite failure means that ${stackId} commit broke something downstream, even if ${stackId}'s own tests still pass.

## Failing run

- Commit: \`${entry.commitSha}\` — "${entry.commitMessage}"
  - ${commitUrl}${prLink ? `\n  - PR: ${prLink}` : ''}
- Eco-CI workflow run: ${entry.workflowRunUrl}
- Failing suites: ${failingSuiteList}

## Per-suite history (current commit → prev release, inclusive)

Tables below are pre-filtered eco-ci history for each failing suite, ${boundDescription}. Rows are **oldest → newest top-to-bottom**, so ✓→✗ transitions read forward in time. The prev release row is tagged \`(prev release)\` and is the hard lower bound — don't look further back. \`✗\` rows include the job log URL; \`✓\` rows are shown without a URL (skip them).

${perSuiteMarkdown}

## What I need you to do

Treat each failing suite independently and produce one diagnosis per suite. Two shapes to handle:

- **Case A — there is a ✓→✗ transition.** The \`✗\` row directly below the last \`✓\` is the candidate breaking commit. Read its log and the current commit's log and confirm they look like the same underlying failure. If they clearly don't, walk forward from the candidate until the signature matches the current one, and report that commit instead.
${allFailureBlock}
Use rough judgement on "same root cause" — matching error message and roughly-similar failure spot is enough. You don't need identical stack traces or file paths.

### Pulling logs

Job ID is the **last path segment** of each log URL (URL shape: \`.../actions/runs/<runId>/job/<jobId>\`). Pull the log with:

    gh run view --job <job-id> --repo rstackjs/rstack-ecosystem-ci --log | grep -E -i -C 3 'error|fail|panic|✖' | head -200

If that misses the real failure, fall back to the full log (\`gh run view --job <job-id> --repo rstackjs/rstack-ecosystem-ci --log\`) or the HTML URL directly.

### Reading ${stackId} commits

You are likely inside a \`${upstreamRepo}\` checkout that may be behind \`main\` — fetch first so every SHA below resolves locally:

    git fetch origin main

Then use \`git show <sha>\` / \`git log <sha>\` directly instead of \`gh api\`. Extract \`(#NNNN)\` from each breaking commit's message for the PR link: \`https://github.com/${upstreamRepo}/pull/NNNN\`.

## Deliverable

Per failing suite, one short section with:

1. **Attribution line** — pick exactly one shape based on what you found:
   - Case A (✓→✗ transition): \`This failure started from <sha> — "<commit msg>"\` + PR link + author + date.
   - Case B, same root cause as prev release: \`The prev release ${bound ? shortSha(bound.commitSha) : '(window boundary)'} was already failing with this same error.\`
   - Case B, pivot found mid-window: \`This specific failure started from <sha> — "<commit msg>"; before that the suite was failing for a different reason already at prev release ${bound ? shortSha(bound.commitSha) : '(window boundary)'}.\` Include PR link + author + date for the pivot commit.
2. **Root cause, 3–5 sentences.** Read the diff and the failure log; say plausibly what in that change broke the suite. Stay surface-level; it's OK to say "likely".
3. **Evidence**: the log URL(s) you actually read.

Keep it tight — I'm triaging, not writing a postmortem.
`;
}
