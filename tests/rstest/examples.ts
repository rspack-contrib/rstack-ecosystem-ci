import type { RunOptions } from '../../types';
import { $, runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'rstackjs/rstack-examples',
    branch: 'main',
    test: ['test:rstest'],
    beforeTest: async () => {
      await $`pnpm exec playwright install chromium --with-deps`;
    },
  });
}
