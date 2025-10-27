import type { RunOptions } from '../types';
import { runInRepo } from '../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'lynx-family/lynx-stack',
    branch: process.env.LYNX_STACK_REF ?? 'main',
    build: 'pnpm turbo build',
    // TODO(colinaaa): enable Lynx for Web tests
    test: 'test',
  });
}
