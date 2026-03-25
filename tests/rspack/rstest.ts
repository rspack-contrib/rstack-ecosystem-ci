import type { RunOptions } from '../../types';
import { $, cd, runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'web-infra-dev/rstest',
    branch: process.env.RSTEST ?? 'main',
    // ignore snapshot changes
    test: [
      'test -u',
      'test:examples',
      async () => {
        cd('./e2e');
        await $`pnpm run test`;
        cd('..');
      },
    ],
    beforeTest: async () => {
      await $`npx playwright install chromium webkit --with-deps`;
    },
  });
}
