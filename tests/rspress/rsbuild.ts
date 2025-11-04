import type { RunOptions } from '../../types';
import { cd, runInRepo } from '../../utils';
import { deployPreviewToNetlify } from './netlify';

const MESSAGE = 'rspress-rsbuild-preview';
const SITE_ID_ENV = 'RSPRESS_NETLIFY_SITE_ID_RSBUILD';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'web-infra-dev/rsbuild',
    branch: process.env.RSBUILD ?? 'main',
    beforeTest: async () => {
      cd('./website');
    },
    test: [
      'build',
      async () => {
        await deployPreviewToNetlify({
          message: MESSAGE,
          siteIdEnvVar: SITE_ID_ENV,
        });
      },
    ],
  });
}
