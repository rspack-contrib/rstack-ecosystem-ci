import type { RunOptions } from '../../types';
import { cd, runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'web-infra-dev/rstest',
    branch: process.env.RSTEST ?? 'main',
    build: 'node --run build',
    beforeTest: async () => {
      cd('./website');
    },
    test: ['build'],
  });
}
