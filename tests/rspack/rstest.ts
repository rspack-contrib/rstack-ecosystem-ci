import type { RunOptions } from '../../types';
import { $, cd, runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'web-infra-dev/rstest',
    branch: process.env.RSTEST ?? 'main',
    build: 'node --run build',
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
      // Browser e2e still covers WebKit; Chromium uses GitHub's Chrome.
      await $`pnpm exec playwright install webkit --with-deps`;
    },
  });
}
