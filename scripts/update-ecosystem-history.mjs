#!/usr/bin/env node
/**
 * Update the ecosystem history JSON for a given stack by appending the latest commit record.
 *
 * This script is intended to run within GitHub Actions. It fetches the existing history
 * from the `data` branch, enriches the new record with metadata pulled from the originating
 * repository and current workflow run, and writes the merged result to an output directory.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * @typedef {Object} EcosystemSuiteResult
 * @property {string} name
 * @property {'success' | 'failure' | 'cancelled'} status
 * @property {number | undefined} [durationMs]
 * @property {string | undefined} [logUrl]
 * @property {string | undefined} [notes]
 */

/**
 * @typedef {Object} EcosystemCommitRecord
 * @property {string} commitSha
 * @property {string} commitTimestamp
 * @property {string} commitMessage
 * @property {{ name: string; email?: string; login?: string }} author
 * @property {{ fullName: string; name: string }} repository
 * @property {string} workflowRunUrl
 * @property {'success' | 'failure' | 'cancelled'} overallStatus
 * @property {EcosystemSuiteResult[]} suites
 */

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? 'data-artifacts';
const TOKEN = process.env.GITHUB_TOKEN;
const DEFAULT_REPOSITORY = process.env.GITHUB_REPOSITORY;
if (!TOKEN) throw new Error('GITHUB_TOKEN env variable is required');
if (!DEFAULT_REPOSITORY)
  throw new Error('GITHUB_REPOSITORY env variable is required');

const HISTORY_REPOSITORY =
  process.env.HISTORY_REPOSITORY && process.env.HISTORY_REPOSITORY !== ''
    ? process.env.HISTORY_REPOSITORY
    : DEFAULT_REPOSITORY;
const SUMMARY_MARKDOWN = process.env.SUMMARY_MARKDOWN ?? '';
const WORKFLOW_FILE = process.env.WORKFLOW_FILE ?? '';
const WORKFLOW_RUN_URL = process.env.WORKFLOW_RUN_URL ?? '';
const WORKFLOW_RUN_ID = process.env.WORKFLOW_RUN_ID ?? '';
const RESULTS_JSON = process.env.RESULTS_JSON ?? '';
const CLIENT_PAYLOAD_RAW = process.env.CLIENT_PAYLOAD ?? '{}';

/** @type {Record<string, unknown>} */
let CLIENT_PAYLOAD = {};
try {
  CLIENT_PAYLOAD =
    CLIENT_PAYLOAD_RAW && CLIENT_PAYLOAD_RAW.trim() !== ''
      ? JSON.parse(CLIENT_PAYLOAD_RAW)
      : {};
} catch (error) {
  throw new Error(
    `Failed to parse CLIENT_PAYLOAD env variable: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

/**
 * Derive stack name from workflow file name.
 * @param {string} workflowFile
 */
function inferStack(workflowFile) {
  if (!workflowFile) return undefined;
  const withoutExtension = workflowFile.replace(/\.(ya?ml)$/i, '');
  const [maybeStack] = withoutExtension.split('-');
  return maybeStack || undefined;
}

const STACK =
  process.env.STACK ??
  (typeof CLIENT_PAYLOAD.stack === 'string' ? CLIENT_PAYLOAD.stack : undefined) ??
  inferStack(WORKFLOW_FILE);
const SOURCE_REPO =
  process.env.SOURCE_REPO ??
  (typeof CLIENT_PAYLOAD.repo === 'string' ? CLIENT_PAYLOAD.repo : undefined);
const SOURCE_COMMIT =
  process.env.SOURCE_COMMIT ??
  (typeof CLIENT_PAYLOAD.commitSHA === 'string'
    ? CLIENT_PAYLOAD.commitSHA
    : typeof CLIENT_PAYLOAD.commitSha === 'string'
      ? CLIENT_PAYLOAD.commitSha
      : typeof CLIENT_PAYLOAD.sha === 'string'
        ? CLIENT_PAYLOAD.sha
        : undefined);

if (!STACK) throw new Error('Unable to determine stack name');
if (!SOURCE_REPO) throw new Error('Unable to determine source repository');
if (!SOURCE_COMMIT) throw new Error('Unable to determine source commit SHA');
if (
  (!SUMMARY_MARKDOWN || SUMMARY_MARKDOWN.trim() === '') &&
  (!RESULTS_JSON || RESULTS_JSON.trim() === '')
) {
  throw new Error(
    'Either SUMMARY_MARKDOWN or RESULTS_JSON env variable is required',
  );
}

const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${TOKEN}`,
  'User-Agent': 'rspack-contrib-rstack-ecosystem-ci',
};

/**
 * @param {string} url
 */
async function fetchJson(url) {
  const response = await fetch(url, { headers: API_HEADERS });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request to ${url} failed: ${response.status} ${text}`);
  }
  return response.json();
}

/**
 * @returns {Promise<EcosystemCommitRecord[]>}
 */
async function readExistingRecords() {
  const url = `https://raw.githubusercontent.com/${HISTORY_REPOSITORY}/data/${STACK}.json`;
  const result = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      'User-Agent': 'rspack-contrib-rstack-ecosystem-ci',
    },
  });

  if (result.status === 404) return [];
  if (!result.ok) {
    const text = await result.text();
    throw new Error(
      `Failed to read existing history (${result.status}): ${text}`,
    );
  }
  return result.json();
}

async function fetchCommitInfo() {
  const url = `https://api.github.com/repos/${SOURCE_REPO}/commits/${SOURCE_COMMIT}`;
  const commit = await fetchJson(url);
  if (!commit) {
    throw new Error(`Commit ${SOURCE_COMMIT} not found in ${SOURCE_REPO}`);
  }

  const ghAuthor = commit.author ?? {};
  const commitAuthor = commit.commit?.author ?? {};
  const committer = commit.commit?.committer ?? {};
  return {
    commitSha: commit.sha,
    commitTimestamp:
      committer?.date ??
      commitAuthor?.date ??
      ghAuthor?.date ??
      new Date().toISOString(),
    commitMessage:
      commit.commit?.message?.split('\n')[0] ?? '(unknown message)',
    author: {
      name: commitAuthor?.name ?? ghAuthor?.login ?? '(unknown author)',
      email: commitAuthor?.email ?? ghAuthor?.email ?? undefined,
      login: ghAuthor?.login ?? undefined,
    },
    repository: {
      fullName: SOURCE_REPO,
      name: SOURCE_REPO.split('/')[1] ?? SOURCE_REPO,
    },
  };
}

/**
 * @param {string} statusText
 * @returns {'success' | 'failure' | 'cancelled'}
 */
function normalizeStatus(statusText) {
  const lower = statusText.trim().toLowerCase();
  if (lower.startsWith('success')) return 'success';
  if (
    lower.startsWith('cancelled') ||
    lower.startsWith('skipped') ||
    lower.startsWith('neutral')
  ) {
    return 'cancelled';
  }
  return 'failure';
}

/**
 * @param {string} summary
 * @returns {{ suites: EcosystemSuiteResult[]; runUrl?: string }}
 */
function parseSummary(summary) {
  if (!summary || summary.trim() === '') {
    return { suites: [], runUrl: undefined };
  }
  const lines = summary
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const runLinkMatch = lines
    .join(' ')
    .match(/\[Open\]\((?<url>https?:\/\/[^\s)]+)\)/);
  const runUrl = runLinkMatch?.groups?.url;

  /** @type {EcosystemSuiteResult[]} */
  const suites = [];
  const rowRegex =
    /^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*(?::[^\s:]+:\s*)?([^|]+?)\s*\|$/;

  for (const line of lines) {
    if (!line.startsWith('| [')) continue;
    const match = line.match(rowRegex);
    if (!match) continue;

    const [, name, url, statusText] = match;
    suites.push({
      name: name.trim(),
      status: normalizeStatus(statusText),
      logUrl: url.trim(),
    });
  }

  return { suites, runUrl };
}

/**
 * @param {unknown} raw
 * @returns {EcosystemSuiteResult[]}
 */
function normalizeSuites(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return undefined;
      const candidate = /** @type {Record<string, unknown>} */ (item);
      const suiteName =
        typeof candidate.suite === 'string'
          ? candidate.suite
          : typeof candidate.name === 'string'
            ? candidate.name
            : '';
      if (!suiteName) return undefined;
      const conclusion =
        typeof candidate.conclusion === 'string'
          ? candidate.conclusion
          : typeof candidate.status === 'string'
            ? candidate.status
            : '';
      const link =
        typeof candidate.link === 'string'
          ? candidate.link
          : typeof candidate.logUrl === 'string'
            ? candidate.logUrl
            : undefined;
      return {
        name: suiteName.trim(),
        status: normalizeStatus(conclusion),
        logUrl: link,
      };
    })
    .filter((suite) => Boolean(suite));
}

/**
 * @param {string | undefined} url
 * @returns {string | undefined}
 */
function normalizeRunUrl(url) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'api.github.com') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length >= 6 && segments[0] === 'repos') {
        const owner = segments[1];
        const repo = segments[2];
        const runId = segments[5];
        return `https://github.com/${owner}/${repo}/actions/runs/${runId}`;
      }
    }
  } catch {
    // ignore parse errors and fall through to returning original url
  }
  return url;
}

async function main() {
  let parsedResults = {};
  if (RESULTS_JSON && RESULTS_JSON.trim() !== '') {
    try {
      const raw = JSON.parse(RESULTS_JSON);
      if (raw && typeof raw === 'object') {
        parsedResults = raw;
      }
    } catch (error) {
      throw new Error(
        `Failed to parse RESULTS_JSON env variable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const parsedResultsRecord =
    parsedResults && typeof parsedResults === 'object'
      ? /** @type {Record<string, unknown>} */ (parsedResults)
      : {};

  const suitesFromResults = normalizeSuites(parsedResultsRecord.suites);
  const { suites: suitesFromSummary, runUrl: summaryRunUrl } =
    parseSummary(SUMMARY_MARKDOWN);
  const suites =
    suitesFromResults.length > 0 ? suitesFromResults : suitesFromSummary;

  if (!suites.length) {
    throw new Error('No suite results available to record');
  }

  const [commitInfo, existingRecords] = await Promise.all([
    fetchCommitInfo(),
    readExistingRecords(),
  ]);

  const workflowUrlFromResults =
    typeof parsedResultsRecord.workflowUrl === 'string'
      ? parsedResultsRecord.workflowUrl
      : '';
  const workflowRunIdFromResults =
    typeof parsedResultsRecord.workflowRunId === 'string'
      ? parsedResultsRecord.workflowRunId
      : '';

  const normalizedRunUrl =
    normalizeRunUrl(workflowUrlFromResults) ??
    normalizeRunUrl(WORKFLOW_RUN_URL) ??
    normalizeRunUrl(summaryRunUrl) ??
    (workflowRunIdFromResults || WORKFLOW_RUN_ID
      ? `https://github.com/${HISTORY_REPOSITORY}/actions/runs/${workflowRunIdFromResults || WORKFLOW_RUN_ID}`
      : undefined);

  const overallStatus = suites.some((suite) => suite.status === 'failure')
    ? 'failure'
    : suites.some((suite) => suite.status === 'cancelled')
      ? 'cancelled'
      : 'success';

  /** @type {EcosystemCommitRecord} */
  const newRecord = {
    ...commitInfo,
    workflowRunUrl: normalizedRunUrl ?? '',
    overallStatus,
    suites,
  };

  const filtered = existingRecords.filter(
    (record) => record.commitSha !== newRecord.commitSha,
  );
  filtered.unshift(newRecord);
  filtered.sort(
    (a, b) =>
      new Date(b.commitTimestamp).getTime() -
      new Date(a.commitTimestamp).getTime(),
  );

  const outputPath = join(OUTPUT_DIR, `${STACK}.json`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(filtered, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${filtered.length} records to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
