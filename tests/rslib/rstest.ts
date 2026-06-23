import type { RunOptions } from '../../types';
import { $, runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'web-infra-dev/rstest',
    branch: process.env.RSTEST ?? 'main',
    build: 'node --run build',
    test: ['test', 'test:examples'],
    beforeTest: async () => {
      await $`pnpm exec playwright install chromium --with-deps`;
    },
  });
}
