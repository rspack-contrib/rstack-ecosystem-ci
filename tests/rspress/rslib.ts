import type { RunOptions } from '../../types';
import { cd, runInRepo } from '../../utils';
import { MESSAGE, deployPreviewToNetlify } from './utils/_netlify';

const SITE_ID_ENV = 'RSLIB_NETLIFY_SITE_ID';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'web-infra-dev/rslib',
    branch: process.env.RSLIB ?? 'main',
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
