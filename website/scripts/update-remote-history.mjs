#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STACKS = ['rsbuild', 'rspack', 'rslib', 'rstest'];
const DATA_REPO = 'rspack-contrib/rstack-ecosystem-ci';
const DATA_BRANCH_URL = `https://raw.githubusercontent.com/${DATA_REPO}/data`;

const isMockMode = process.env.RSBUILD_PUBLIC_DATA_SOURCE === 'mock';

if (isMockMode) {
  console.log(
    '[update-remote-history] mock mode detected; skipping remote fetch.',
  );
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, '../src/data/remote-history.ts');

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${url}`);
  }
  return response.json();
}

async function main() {
  const history = {};

  for (const stack of STACKS) {
    const url = `${DATA_BRANCH_URL}/${stack}.json`;
    try {
      history[stack] = await fetchJson(url);
      console.log(
        `[update-remote-history] fetched ${stack} history (${history[stack]?.length ?? 0} entries).`,
      );
    } catch (error) {
      console.warn(
        `[update-remote-history] failed to fetch ${stack} history: ${error}`,
      );
      console.warn(
        '[update-remote-history] keeping existing remote history file.',
      );
      return;
    }
  }

  const fileContents = `import type { EcosystemCommitHistory } from '@/types';

const remoteHistory = ${JSON.stringify(history, null, 2)} satisfies Record<string, EcosystemCommitHistory>;

export default remoteHistory;
`;

  await writeFile(outputPath, fileContents, 'utf8');
  console.log('[update-remote-history] remote history updated.');
}

main().catch((error) => {
  console.error('[update-remote-history] unexpected error:', error);
  process.exit(1);
});
