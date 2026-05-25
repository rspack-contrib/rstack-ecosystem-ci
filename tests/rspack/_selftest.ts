import fs from 'node:fs';
import path from 'node:path';
import type { RunOptions } from '../../types';
import { runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  await runInRepo({
    ...options,
    repo: 'rstackjs/rstack-ecosystem-ci',
    build: async () => {
      const dir = path.resolve(options.workspace, 'rstack-ecosystem-ci');
      const pkgFile = path.join(dir, 'package.json');
      const pkg = JSON.parse(await fs.promises.readFile(pkgFile, 'utf-8'));
      if (pkg.name !== 'rstack-ecosystem-ci') {
        throw new Error(
          `invalid checkout, expected package.json with "name":"rstack-ecosystem-ci" in ${dir}`,
        );
      }
      pkg.scripts.selftestscript =
        "[ -d ../../rspack/packages/rspack/dist ] || (echo 'rspack build failed' && exit 1)";
      await fs.promises.writeFile(
        pkgFile,
        JSON.stringify(pkg, null, 2),
        'utf-8',
      );
    },
    test: 'pnpm run selftestscript',
    verify: false,
  });
}
