import type { RunOptions } from '../../types';
import { runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'rstackjs/rstack-cli',
    branch: process.env.RSTACK_CLI_REF ?? 'main',
    build: 'node --run build',
    beforeTest: 'pnpm --filter rstack build:native:ci',
    test: ['test'],
  });
}
