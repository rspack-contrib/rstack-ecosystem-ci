import type { RunOptions } from '../../types';
import { cd, runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'rstackjs/rstack-cli',
    branch: process.env.RSTACK_CLI_REF ?? 'main',
    build: 'node --run build',
    beforeTest: async () => {
      cd('./website');
    },
    test: ['build'],
  });
}
