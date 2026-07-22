import type { RunOptions } from '../../types';
import { runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'rstackjs/rstack-examples',
    branch: 'main',
    test: [
      'build:rspack:eco-ci',
      'test:rspack:eco-ci',
      'build:rsbuild',
      'build:rsdoctor',
      'build:rspress',
      'build:rslib',
    ],
  });
}
