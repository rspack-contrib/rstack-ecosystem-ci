import type { RunOptions } from '../../types';
import { runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'rstackjs/rstack-examples',
    branch: 'main',
    skipPackageOverrides: [
      // TODO: Remove after @rsbuild/plugin-solid v2 has a stable release.
      '@rsbuild/plugin-solid',
    ],
    test: ['build:rsbuild'],
  });
}
