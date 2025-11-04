import type { RunOptions } from '../../types';
import { cd, runInRepo } from '../../utils';
import { deployPreviewToNetlify } from './netlify';

const MESSAGE = 'rspress-rslib-preview';
const SITE_ID_ENV = 'RSPRESS_NETLIFY_SITE_ID_RSLIB';

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
