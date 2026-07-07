import type { RunOptions } from '../../types';
import { runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'web-infra-dev/rsbuild',
    branch: process.env.RSBUILD ?? 'main',
    build: 'node --run build',
    test: ['test', 'e2e'],
  });
}
