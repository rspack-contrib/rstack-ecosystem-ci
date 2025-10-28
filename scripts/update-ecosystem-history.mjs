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

const STACK = process.env.STACK;
const SOURCE_REPO = process.env.SOURCE_REPO;
const SOURCE_COMMIT = process.env.SOURCE_COMMIT;
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? 'data-artifacts';
const TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_RUN_ID = process.env.GITHUB_RUN_ID;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;

if (!STACK) throw new Error('STACK env variable is required');
if (!SOURCE_REPO) throw new Error('SOURCE_REPO env variable is required');
if (!SOURCE_COMMIT) throw new Error('SOURCE_COMMIT env variable is required');
if (!GITHUB_RUN_ID) throw new Error('GITHUB_RUN_ID env variable is required');
if (!GITHUB_REPOSITORY)
  throw new Error('GITHUB_REPOSITORY env variable is required');
if (!TOKEN) throw new Error('GITHUB_TOKEN env variable is required');

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
  const url = `https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/data/${STACK}.json`;
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

async function fetchSuiteResults() {
  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/jobs?per_page=100`;
  const payload = await fetchJson(url);
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];

  /** @type {EcosystemSuiteResult[]} */
  const suites = jobs
    .filter((job) => job?.name?.startsWith('execute-all '))
    .map((job) => {
      const suiteName = job.name
        .replace(/^execute-all\s*\(?/, '')
        .replace(/\)?$/, '');
      let status = 'failure';
      switch (job.conclusion) {
        case 'success':
          status = 'success';
          break;
        case 'cancelled':
        case 'skipped':
        case 'neutral':
          status = 'cancelled';
          break;
        default:
          status = 'failure';
      }

      const started = job.started_at
        ? new Date(job.started_at).getTime()
        : undefined;
      const completed = job.completed_at
        ? new Date(job.completed_at).getTime()
        : undefined;
      const durationMs = started && completed ? completed - started : undefined;

      return {
        name: suiteName.trim(),
        status,
        durationMs,
        logUrl: job.html_url ?? undefined,
      };
    });

  return suites;
}

async function main() {
  const [commitInfo, existingRecords, suites] = await Promise.all([
    fetchCommitInfo(),
    readExistingRecords(),
    fetchSuiteResults(),
  ]);

  if (!suites.length) {
    throw new Error('No suite results found for execute-all jobs');
  }

  const overallStatus = suites.some((suite) => suite.status === 'failure')
    ? 'failure'
    : suites.some((suite) => suite.status === 'cancelled')
      ? 'cancelled'
      : 'success';

  /** @type {EcosystemCommitRecord} */
  const newRecord = {
    ...commitInfo,
    workflowRunUrl: `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`,
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
