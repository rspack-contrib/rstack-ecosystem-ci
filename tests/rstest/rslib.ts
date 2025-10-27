import type { RunOptions } from '../../types';
import { runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'web-infra-dev/rslib',
    branch: process.env.RSLIB ?? 'main',
    test: ['test:unit', 'test:integration'],
  });
}
