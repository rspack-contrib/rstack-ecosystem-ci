import type { RunOptions } from '../../types';
import { runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'web-infra-dev/rsdoctor',
    branch: process.env.RSDOCTOR ?? 'main',
    test: ['test'],
  });
}
