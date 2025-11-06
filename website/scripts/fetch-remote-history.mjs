#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STACKS = ['rsbuild', 'rspack', 'rslib', 'rstest', 'rsdoctor', 'rspress'];
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
const outputDir = resolve(__dirname, '../src/data/remote');

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      console.warn(
        `[update-remote-history] ${url} not found (404), using empty array.`,
      );
      return [];
    }
    throw new Error(`Request failed (${response.status}): ${url}`);
  }
  return response.json();
}

async function main() {
  for (const stack of STACKS) {
    const url = `${DATA_BRANCH_URL}/${stack}.json`;
    try {
      const data = await fetchJson(url);
      const outputPath = resolve(outputDir, `${stack}.json`);
      await writeFile(outputPath, JSON.stringify(data, null, 2), 'utf8');
      console.log(
        `[update-remote-history] fetched ${stack} history (${data?.length ?? 0} entries).`,
      );
    } catch (error) {
      console.error(
        `[update-remote-history] failed to fetch ${stack} history: ${error}`,
      );
      throw error;
    }
  }

  console.log('[update-remote-history] remote history updated.');
}

main().catch((error) => {
  console.error('[update-remote-history] unexpected error:', error);
  process.exit(1);
});
