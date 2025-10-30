import type { RunOptions } from '../../types';
import { cd, runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'web-infra-dev/rspack',
    branch: process.env.RSTEST ?? 'main',
    build: ['build:cli:release'],
    beforeTest: async () => {
      cd('./website');
    },
    test: ['build'],
  });
}
