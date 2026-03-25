import type { RunOptions } from '../../types';
import { $, cd, runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'web-infra-dev/rsdoctor',
    branch: process.env.RSDOCTOR ?? 'main',
    beforeTest: async () => {
      cd('./e2e');
      await $`pnpm exec playwright install --with-deps`;
      cd('..');
    },
    test: ['test:all'],
  });
}
