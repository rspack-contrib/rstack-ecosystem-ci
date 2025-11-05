import type { RunOptions } from '../../types';
import { cd, runInRepo } from '../../utils';
import { MESSAGE, deployPreviewToNetlify } from './utils/_netlify';

const SITE_ID_ENV = 'RSBUILD_NETLIFY_SITE_ID';

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
