import fs from 'node:fs';
import path from 'node:path';
import type { RunOptions } from '../../types';
import { $, runInRepo } from '../../utils';

export async function test(options: RunOptions) {
  const errors: Array<{
    repo: string;
    err: Error;
  }> = [];

  const plugins = [
    'rstackjs/rsbuild-plugin-umd',
    'rstackjs/rsbuild-plugin-eslint',
    'rstackjs/rsbuild-plugin-mdx',
    'rstackjs/rsbuild-plugin-google-analytics',
    'rstackjs/rsbuild-plugin-html-minifier-terser',
    'rstackjs/rsbuild-plugin-open-graph',
    'rstackjs/rsbuild-plugin-image-compress',
    'rstackjs/rsbuild-plugin-css-minimizer',
    'rstackjs/rsbuild-plugin-typed-css-modules',
    'rstackjs/rsbuild-plugin-pug',
    'rstackjs/rsbuild-plugin-toml',
    'rstackjs/rsbuild-plugin-template',
    'rstackjs/rsbuild-plugin-styled-components',
    'rstackjs/rsbuild-plugin-rem',
    'rstackjs/rsbuild-plugin-vue2',
    'rstackjs/rsbuild-plugin-yaml',
    'rstackjs/rsbuild-plugin-vue2-jsx',
    'rstackjs/rsbuild-plugin-type-check',
    'rstackjs/rsbuild-plugin-source-build',
    'rstackjs/rsbuild-plugin-node-polyfill',
    'rstackjs/rsbuild-plugin-ejs',
    'rstackjs/rsbuild-plugin-check-syntax',
    'rstackjs/rsbuild-plugin-basic-ssl',
    'rstackjs/rsbuild-plugin-vue-jsx',
    'rstackjs/rsbuild-plugin-assets-retry',
    'rstackjs/rsbuild-plugin-tailwindcss',
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
