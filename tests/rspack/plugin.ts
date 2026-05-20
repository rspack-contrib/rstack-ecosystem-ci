import type { RunOptions } from '../../types';
import { runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'rstackjs/rspack-plugin-ci',
    branch: 'main',
    // Upstream's `pnpm-workspace.yaml` sets `allowBuilds: puppeteer: false`,
    // so pnpm 11 skips puppeteer's postinstall and Chrome is not downloaded.
    // Mirror upstream's own `test.yml` and install it explicitly here.
    // https://github.com/rstackjs/rspack-plugin-ci/blob/main/.github/workflows/test.yml
    beforeTest: 'pnpm exec puppeteer browsers install chrome',
    test: ['test'],
  });
}
