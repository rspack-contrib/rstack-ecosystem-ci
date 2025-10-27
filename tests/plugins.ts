import fs from 'node:fs';
import path from 'node:path';
import type { RunOptions } from '../types';
import { $, runInRepo } from '../utils';

export async function test(options: RunOptions) {
  const errors: Array<{
    repo: string;
    err: Error;
  }> = [];

  const plugins = [
    'rspack-contrib/rsbuild-plugin-umd',
    'rspack-contrib/rsbuild-plugin-eslint',
    'rspack-contrib/rsbuild-plugin-mdx',
    'rspack-contrib/rsbuild-plugin-google-analytics',
    'rspack-contrib/rsbuild-plugin-html-minifier-terser',
    'rspack-contrib/rsbuild-plugin-open-graph',
    'rspack-contrib/rsbuild-plugin-image-compress',
    'rspack-contrib/rsbuild-plugin-css-minimizer',
    'rspack-contrib/rsbuild-plugin-typed-css-modules',
    'rspack-contrib/rsbuild-plugin-pug',
    'rspack-contrib/rsbuild-plugin-toml',
    'rspack-contrib/rsbuild-plugin-template',
    'rspack-contrib/rsbuild-plugin-styled-components',
    'rspack-contrib/rsbuild-plugin-rem',
    'rspack-contrib/rsbuild-plugin-vue2',
    'rspack-contrib/rsbuild-plugin-yaml',
    'rspack-contrib/rsbuild-plugin-vue2-jsx',
    'rspack-contrib/rsbuild-plugin-type-check',
    'rspack-contrib/rsbuild-plugin-source-build',
    'rspack-contrib/rsbuild-plugin-node-polyfill',
    'rspack-contrib/rsbuild-plugin-ejs',
    'rspack-contrib/rsbuild-plugin-check-syntax',
    'rspack-contrib/rsbuild-plugin-basic-ssl',
    'rspack-contrib/rsbuild-plugin-vue-jsx',
    'rspack-contrib/rsbuild-plugin-assets-retry',
    'rspack-contrib/rsbuild-plugin-tailwindcss',
  ];

  const { workspace } = options;

  const checkTest = (repo: string) => {
    const name = repo.split('/')[1];
    const pkgFolder = path.join(workspace, name);
    const pkgPath = path.join(pkgFolder, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkgStr = fs.readFileSync(pkgPath, 'utf-8');
      const { scripts, devDependencies } = JSON.parse(pkgStr);

      const hasPlaywright =
        Boolean(devDependencies.playwright) ||
        Boolean(scripts.test?.includes('playwright'));

      return {
        hasTest: Boolean(scripts.test),
        playwright: hasPlaywright,
      };
    }

    console.warn(`not found package.json in ${pkgFolder}`);

    return {
      hasTest: false,
    };
  };

  for (const repo of plugins) {
    let hasTestScript = false;
    await runInRepo({
      ...options,
      repo,
      branch: 'main',
      beforeTest: async () => {
        const { hasTest, playwright } = checkTest(repo);

        hasTestScript = hasTest;

        if (playwright) {
          await $`pnpm exec playwright install --with-deps`;
        }
      },
      overrides: {
        // not override rslib's rsbuild version
        '@rslib/core>@rsbuild/core': 'latest',
      },
      test: [
        'build',
        async () => {
          if (hasTestScript) {
            await $`pnpm run test`;
          } else {
            console.warn(`not found test script in ${repo}`);
          }
        },
      ],
    }).catch((err) => {
      errors.push({
        repo,
        err,
      });
    });
  }

  errors.map((err) => {
    console.error(`${err.repo} test failed:`, err.err.message);
  });

  if (errors.length) {
    throw new Error(
      `plugins test succeed ${plugins.length - errors.length}, failed ${
        errors.length
      } (${errors.map((e) => e.repo).join(',')})`,
    );
  }

  console.info('plugins test all passed!');
}
