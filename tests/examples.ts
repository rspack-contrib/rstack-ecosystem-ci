import type { RunOptions } from '../types';
import { runInRepo } from '../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'rspack-contrib/rspack-examples',
    branch: 'main',
    test: ['build:rsbuild'],
  });
}
