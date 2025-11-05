import type { RunOptions } from '../../types';
import { cd, runInRepo } from '../../utils';
import { MESSAGE, deployPreviewToNetlify } from './utils/_netlify';

const SITE_ID_ENV = 'RSPACK_NETLIFY_SITE_ID';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'web-infra-dev/rspack',
    branch: process.env.RSPACK ?? 'main',
    beforeTest: async () => {
      cd('./website');
    },
    test: [
      'pnpm run build',
      async () => {
        await deployPreviewToNetlify({
          message: MESSAGE,
          siteIdEnvVar: SITE_ID_ENV,
        });
      },
    ],
  });
}
