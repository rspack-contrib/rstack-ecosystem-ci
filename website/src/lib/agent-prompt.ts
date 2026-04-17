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
  window: EcosystemCommitHistory;
  bound: EcosystemCommitRecord | null;
}

/**
 * Returns the slice of history starting AT the target commit and extending
 * backward to (not including) the most recent release commit older than the
 * target. Capped at WINDOW_CAP entries when no release commit is found.
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
    if (i > startIdx && isReleaseCommit(entry.commitMessage)) {
      bound = entry;
      break;
    }
    windowEntries.push(entry);
    if (windowEntries.length >= WINDOW_CAP) {
      break;
    }
  }

  return { window: windowEntries, bound };
}

function buildSuiteTable(
  suiteName: string,
  window: EcosystemCommitHistory,
): string {
  const rows: string[] = [];
  let seenSuccess = false;
  let sawSuite = false;

  for (const entry of window) {
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
    rows.push(`| ${shortSha(entry.commitSha)} | ${msg} | ${statusCell} |`);
  }

  const header =
    '| Commit | Message | Status / Log |\n|--------|---------|--------------|';

  const body =
    rows.length > 0
      ? rows.join('\n')
      : '| — | (suite not present in window) | — |';

  const note =
    sawSuite && !seenSuccess
      ? '\n\n_Note: this suite has been ✗ for the entire window — there is no ✓→✗ transition. Treat the oldest ✗ row as the bisect starting point and inspect every commit after it._'
      : '';

  return `${header}\n${body}${note}`;
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
    ? `bounded by the most recent release commit (\`${shortSha(bound.commitSha)}\` — "${bound.commitMessage}")`
    : `capped at the ${window.length} most recent commits (no release commit found within that range)`;

  const perSuiteSections = failingSuites
    .map(
      (suite) => `### ${suite.name}\n\n${buildSuiteTable(suite.name, window)}`,
    )
    .join('\n\n');

  const failingSuiteList = failingSuites.map((s) => `\`${s.name}\``).join(', ');

  const suiteListSentence = suiteNames.length
    ? `Each "suite" is one downstream project (${suiteNames.map((n) => `\`${n}\``).join(', ')}) running its own test/build command against the ${stackId} under test.`
    : `Each "suite" is one downstream project running its own test/build command against the ${stackId} under test.`;

  return `I'm a maintainer of ${stackId}. Please help me investigate why the rstack-ecosystem-ci pipeline is failing on a recent commit to ${stackId} \`main\`.

## What is rstack-ecosystem-ci?

rstack-ecosystem-ci (https://github.com/rstackjs/rstack-ecosystem-ci) is an integration CI pipeline for the Rstack ecosystem. On every push to ${stackId} \`main\` it runs a matrix of downstream ecosystem projects against the freshly built ${stackId} artifact to catch ecosystem-level regressions before release. ${suiteListSentence} A suite failure means that ${stackId} commit broke something downstream, even if ${stackId}'s own tests still pass.

## Failing run

- Commit: \`${entry.commitSha}\` — "${entry.commitMessage}"
  - ${commitUrl}${prLink ? `\n  - PR: ${prLink}` : ''}
- Eco-CI workflow run: ${entry.workflowRunUrl}
- Failing suites: ${failingSuiteList}

## Per-suite history (current commit → previous release)

Tables below are pre-filtered eco-ci history for each failing suite, ${boundDescription}. Each row is one eco-ci run against a ${stackId} \`main\` commit (newest → oldest, top-to-bottom). The first ✓→✗ transition reading *bottom-up* (i.e. forward in time) marks the candidate breaking commit.

${perSuiteSections}

## What I need you to do

For each failing suite:

1. **Find the breaking commit.** The first commit in the table where status went ✓ → ✗ (reading bottom-up, i.e. forward in time) is the candidate. Fetch \`--log-failed\` for the current commit *and* the candidate:

   \`\`\`
   gh run view <job-id> --repo rstackjs/rstack-ecosystem-ci --log-failed
   \`\`\`

   (job id = last path segment of the log URL). Confirm both logs share the same error signature — same exception class, same file / symbol, same assertion. If they diverge, the current failure is a *different* regression; report the commit where the current signature first appears instead.

2. **Link the PR.** Extract \`(#NNNN)\` from the breaking commit's message → \`https://github.com/${upstreamRepo}/pull/NNNN\`. Include author and date.

3. **Brief root-cause analysis** (3–5 sentences per suite). Read the breaking commit's diff plus the failure log and say *plausibly* what in the change broke the suite. Stay surface-level.

## Notes

- You are likely inside a \`${upstreamRepo}\` checkout. Always pass \`--repo rstackjs/rstack-ecosystem-ci\` to \`gh run view\` / \`gh api\` calls — otherwise they resolve to the wrong repo.
- Don't clone the eco-ci repo. Read via \`gh\` only.
- If a log is long, grep the first \`error|FAIL|panic|✖\` to locate the failure.
`;
}
