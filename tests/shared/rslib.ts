import type { RunOptions } from '../../types';
import { runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'web-infra-dev/rslib',
    branch: process.env.RSLIB ?? 'main',
    // TODO: Remove after @rsbuild/plugin-solid v2 has a stable release.
    skipPackageOverrides:
      options.stack === 'rsbuild' ? ['@rsbuild/plugin-solid'] : undefined,
    build: 'node --run build',
    // ignore snapshot changes
    test: ['testu', 'test:e2e'],
  });
}
