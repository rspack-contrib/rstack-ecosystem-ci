import type { RunOptions } from '../types';
import { $, cd, runInRepo } from '../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'web-infra-dev/rslib',
    branch: process.env.RSLIB ?? 'main',
    beforeTest: async () => {
      cd('./tests');
      await $`pnpm playwright install --with-deps`;
      cd('..');
    },
    test: ['test'],
  });
}
