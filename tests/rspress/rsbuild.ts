import type { RunOptions } from '../../types';
import { cd, runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'web-infra-dev/rsbuild',
    branch: process.env.RSBUILD ?? 'main',
    beforeTest: async () => {
      cd('./website');
    },
    test: ['build'],
  });
}
