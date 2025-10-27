import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cac } from 'cac';

import type { CommandOptions, RunOptions } from './types';
import {
  bisectRsbuild,
  buildRsbuild,
  ignorePrecoded,
  parseMajorVersion,
  parseRsbuildMajor,
  setupEnvironment,
  setupRsbuildRepo,
} from './utils';

const cli = cac();
cli
  .command('[...suites]', 'build rsbuild and run selected suites')
  .option('--verify', 'verify checkouts by running tests', { default: false })
  .option('--repo <repo>', 'rsbuild repository to use', {
    default: 'web-infra-dev/rsbuild',
  })
  .option('--branch <branch>', 'rsbuild branch to use', { default: 'main' })
  .option('--tag <tag>', 'rsbuild tag to use')
  .option('--commit <commit>', 'rsbuild commit sha to use')
  .option('--release <version>', 'rsbuild release to use from npm registry')
  .option('--suite-precoded', 'use precoded suite options under tests dir')
  .option('--suite-branch <branch>', 'suite branch to use')
  .option('--suite-tag <tag>', 'suite tag to use')
  .option('--suite-commit <commit>', 'suite commit sha to use')
  .action(async (suites, options: CommandOptions) => {
    const { root, rsbuildPath, workspace } = await setupEnvironment();
    const suitesToRun = getSuitesToRun(suites, root);
    let rsbuildMajor: number;
    if (!options.release) {
      await setupRsbuildRepo(options);
      await buildRsbuild({ verify: options.verify });
      rsbuildMajor = parseRsbuildMajor(rsbuildPath);
    } else {
      rsbuildMajor = parseMajorVersion(options.release);
    }
    const runOptions: RunOptions = {
      root,
      rsbuildPath,
      rsbuildMajor,
      workspace,
      release: options.release,
      verify: options.verify,
      skipGit: false,
      suiteBranch: ignorePrecoded(options.suiteBranch),
      suiteTag: ignorePrecoded(options.suiteTag),
      suiteCommit: ignorePrecoded(options.suiteCommit),
    };
    for (const suite of suitesToRun) {
      await run(suite, runOptions);
    }
  });

cli
  .command('build-rsbuild', 'build rsbuild only')
  .option('--verify', 'verify rsbuild checkout by running tests', {
    default: false,
  })
  .option('--repo <repo>', 'rsbuild repository to use', {
    default: 'web-infra-dev/rsbuild',
  })
  .option('--branch <branch>', 'rsbuild branch to use', { default: 'main' })
  .option('--tag <tag>', 'rsbuild tag to use')
  .option('--commit <commit>', 'rsbuild commit sha to use')
  .action(async (options: CommandOptions) => {
    await setupEnvironment();
    await setupRsbuildRepo(options);
    await buildRsbuild({ verify: options.verify });
  });

cli
  .command('run-suites [...suites]', 'run single suite with pre-built rsbuild')
  .option(
    '--verify',
    'verify checkout by running tests before using local rsbuild',
    { default: false },
  )
  .option('--repo <repo>', 'rsbuild repository to use', {
    default: 'web-infra-dev/rsbuild',
  })
  .option('--release <version>', 'rsbuild release to use from npm registry')
  .option('--suite-precoded', 'use precoded suite options under tests dir')
  .option('--suite-branch <branch>', 'suite branch to use')
  .option('--suite-tag <tag>', 'suite tag to use')
  .option('--suite-commit <commit>', 'suite commit sha to use')
  .action(async (suites, options: CommandOptions) => {
    const { root, rsbuildPath, workspace } = await setupEnvironment();
    const suitesToRun = getSuitesToRun(suites, root);
    const runOptions: RunOptions = {
      ...options,
      root,
      rsbuildPath,
      rsbuildMajor: parseRsbuildMajor(rsbuildPath),
      workspace,
      suiteBranch: ignorePrecoded(options.suiteBranch),
      suiteTag: ignorePrecoded(options.suiteTag),
      suiteCommit: ignorePrecoded(options.suiteCommit),
    };
    for (const suite of suitesToRun) {
      await run(suite, runOptions);
    }
  });

cli
  .command(
    'bisect [...suites]',
    'use git bisect to find a commit in rsbuild that broke suites',
  )
  .option('--good <ref>', 'last known good ref, e.g. a previous tag. REQUIRED!')
  .option('--verify', 'verify checkouts by running tests', { default: false })
  .option('--repo <repo>', 'rsbuild repository to use', {
    default: 'web-infra-dev/rsbuild',
  })
  .option('--branch <branch>', 'rsbuild branch to use', { default: 'main' })
  .option('--tag <tag>', 'rsbuild tag to use')
  .option('--commit <commit>', 'rsbuild commit sha to use')
  .option('--suite-precoded', 'use precoded suite options under tests dir')
  .option('--suite-branch <branch>', 'suite branch to use')
  .option('--suite-tag <tag>', 'suite tag to use')
  .option('--suite-commit <commit>', 'suite commit sha to use')
  .action(async (suites, options: CommandOptions & { good: string }) => {
    if (!options.good) {
      console.log(
        'you have to specify a known good version with `--good <commit|tag>`',
      );
      process.exit(1);
    }
    const { root, rsbuildPath, workspace } = await setupEnvironment();
    const suitesToRun = getSuitesToRun(suites, root);
    let isFirstRun = true;
    const { verify } = options;
    const runSuite = async () => {
      try {
        await buildRsbuild({ verify: isFirstRun && verify });
        for (const suite of suitesToRun) {
          await run(suite, {
            verify: !!(isFirstRun && verify),
            skipGit: !isFirstRun,
            root,
            rsbuildPath,
            rsbuildMajor: parseRsbuildMajor(rsbuildPath),
            workspace,
            suiteBranch: ignorePrecoded(options.suiteBranch),
            suiteTag: ignorePrecoded(options.suiteTag),
            suiteCommit: ignorePrecoded(options.suiteCommit),
          });
        }
        isFirstRun = false;
        return null;
      } catch (e) {
        return e;
      }
    };
    await setupRsbuildRepo({ ...options, shallow: false });
    const initialError = await runSuite();
    if (initialError) {
      await bisectRsbuild(options.good, runSuite);
    } else {
      console.log('no errors for starting commit, cannot bisect');
    }
  });
cli.help();
cli.parse();

async function run(suite: string, options: RunOptions) {
  const { test } = await import(`./tests/${suite}.ts`);
  await test({
    ...options,
    workspace: path.resolve(options.workspace, suite),
  });
}

function getSuitesToRun(suites: string[], root: string) {
  let suitesToRun: string[] = suites;
  const availableSuites: string[] = fs
    .readdirSync(path.join(root, 'tests'))
    .filter((f: string) => !f.startsWith('_') && f.endsWith('.ts'))
    .map((f: string) => f.slice(0, -3));
  availableSuites.sort();
  if (suitesToRun.length === 0) {
    suitesToRun = availableSuites;
  } else {
    const invalidSuites = suitesToRun.filter(
      (x) => !x.startsWith('_') && !availableSuites.includes(x),
    );
    if (invalidSuites.length) {
      console.log(`invalid suite(s): ${invalidSuites.join(', ')}`);
      console.log(`available suites: ${availableSuites.join(', ')}`);
      process.exit(1);
    }
  }
  return suitesToRun;
}
