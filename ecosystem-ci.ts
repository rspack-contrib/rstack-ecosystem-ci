import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cac } from 'cac';

import type { CommandOptions, RunOptions, Stack } from './types';
import {
  bisectStack,
  buildStack,
  getDefaultRepository,
  ignorePrecoded,
  parseMajorVersion,
  parseStackMajor,
  setupEnvironment,
  setupStackRepo,
} from './utils';

const STACK_CHOICES: Stack[] = [
  'rsbuild',
  'rspack',
  'rstest',
  'rslib',
  'rsdoctor',
  'rslint',
];

const cli = cac();
cli
  .command('[...suites]', 'build selected stack and run suites')
  .option('--stack <stack>', `target stack (${STACK_CHOICES.join('|')})`)
  .option('--verify', 'verify checkouts by running tests', { default: false })
  .option('--repo <repo>', 'repository to use')
  .option('--branch <branch>', 'branch to use', { default: 'main' })
  .option('--tag <tag>', 'tag to use')
  .option('--commit <commit>', 'commit sha to use')
  .option('--release <version>', 'release to use from npm registry')
  .option('--suite-precoded', 'use precoded suite options under tests dir')
  .option('--suite-branch <branch>', 'suite branch to use')
  .option('--suite-tag <tag>', 'suite tag to use')
  .option('--suite-commit <commit>', 'suite commit sha to use')
  .action(async (suites, options: CommandOptions) => {
    const stack = resolveStack(options.stack);
    const envData = await setupEnvironment(stack);
    const suitesToRun = getSuitesToRun(stack, suites, envData.root);
    let stackMajor: number;
    if (!options.release) {
      await setupStackRepo({
        repo: options.repo ?? getDefaultRepository(stack),
        branch: options.branch,
        tag: options.tag,
        commit: options.commit,
      });
      await buildStack({ verify: options.verify });
      stackMajor = parseStackMajor(envData.stackPath);
    } else {
      stackMajor = parseMajorVersion(options.release);
    }
    const baseRunOptions = createRunOptions(
      stack,
      envData,
      stackMajor,
      options,
    );
    for (const suite of suitesToRun) {
      await runSuite(stack, suite, baseRunOptions);
    }
  });

cli
  .command('build', 'build selected stack only')
  .option('--stack <stack>', `target stack (${STACK_CHOICES.join('|')})`)
  .option('--verify', 'verify checkout by running tests', { default: false })
  .option('--repo <repo>', 'repository to use')
  .option('--branch <branch>', 'branch to use', { default: 'main' })
  .option('--tag <tag>', 'tag to use')
  .option('--commit <commit>', 'commit sha to use')
  .action(async (options: CommandOptions) => {
    const stack = resolveStack(options.stack);
    await handleBuild(stack, options);
  });

registerBuildAlias('build-rsbuild', 'rsbuild');
registerBuildAlias('build-rspack', 'rspack');
registerBuildAlias('build-rstest', 'rstest');
registerBuildAlias('build-rslib', 'rslib');
registerBuildAlias('build-rsdoctor', 'rsdoctor');
registerBuildAlias('build-rslint', 'rslint');

cli
  .command(
    'run-suites [...suites]',
    'run suites using a pre-built version of the selected stack',
  )
  .option('--stack <stack>', `target stack (${STACK_CHOICES.join('|')})`)
  .option(
    '--verify',
    'verify checkout by running tests before using local stack',
    { default: false },
  )
  .option('--repo <repo>', 'repository to use')
  .option('--release <version>', 'release to use from npm registry')
  .option('--suite-precoded', 'use precoded suite options under tests dir')
  .option('--suite-branch <branch>', 'suite branch to use')
  .option('--suite-tag <tag>', 'suite tag to use')
  .option('--suite-commit <commit>', 'suite commit sha to use')
  .action(async (suites, options: CommandOptions) => {
    const stack = resolveStack(options.stack);
    const envData = await setupEnvironment(stack);
    const suitesToRun = getSuitesToRun(stack, suites, envData.root);
    const stackMajor = options.release
      ? parseMajorVersion(options.release)
      : parseStackMajor(envData.stackPath);
    const baseRunOptions = createRunOptions(
      stack,
      envData,
      stackMajor,
      options,
    );
    for (const suite of suitesToRun) {
      await runSuite(stack, suite, baseRunOptions);
    }
  });

cli
  .command(
    'bisect [...suites]',
    'use git bisect to find a commit in the selected stack that broke suites',
  )
  .option('--stack <stack>', `target stack (${STACK_CHOICES.join('|')})`)
  .option('--good <ref>', 'last known good ref, e.g. a previous tag. REQUIRED!')
  .option('--verify', 'verify checkouts by running tests', { default: false })
  .option('--repo <repo>', 'repository to use')
  .option('--branch <branch>', 'branch to use', { default: 'main' })
  .option('--tag <tag>', 'tag to use')
  .option('--commit <commit>', 'commit sha to use')
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
    const stack = resolveStack(options.stack);
    const envData = await setupEnvironment(stack);
    const suitesToRun = getSuitesToRun(stack, suites, envData.root);
    let isFirstRun = true;
    const { verify } = options;
    const runSuiteForBisect = async (): Promise<Error | void> => {
      try {
        await buildStack({ verify: isFirstRun && verify });
        const stackMajor = parseStackMajor(envData.stackPath);
        for (const suite of suitesToRun) {
          await runSuite(
            stack,
            suite,
            createRunOptions(stack, envData, stackMajor, options, {
              verify: !!(isFirstRun && verify),
              skipGit: !isFirstRun,
            }),
          );
        }
        isFirstRun = false;
        return undefined;
      } catch (error) {
        return error as Error;
      }
    };
    await setupStackRepo({
      repo: options.repo ?? getDefaultRepository(stack),
      branch: options.branch,
      tag: options.tag,
      commit: options.commit,
      shallow: false,
    });
    const initialError = await runSuiteForBisect();
    if (initialError) {
      await bisectStack(options.good, runSuiteForBisect);
    } else {
      console.log('no errors for starting commit, cannot bisect');
    }
  });
cli.help();
cli.parse();

async function handleBuild(stack: Stack, options: CommandOptions) {
  await setupEnvironment(stack);
  await setupStackRepo({
    repo: options.repo ?? getDefaultRepository(stack),
    branch: options.branch,
    tag: options.tag,
    commit: options.commit,
  });
  await buildStack({ verify: options.verify });
}

function registerBuildAlias(commandName: string, stack: Stack) {
  cli
    .command(commandName, `build ${stack} only`)
    .option('--verify', `verify ${stack} checkout by running tests`, {
      default: false,
    })
    .option('--repo <repo>', `${stack} repository to use`)
    .option('--branch <branch>', `${stack} branch to use`, { default: 'main' })
    .option('--tag <tag>', `${stack} tag to use`)
    .option('--commit <commit>', `${stack} commit sha to use`)
    .action(async (options: CommandOptions) => {
      await handleBuild(stack, options);
    });
}

function resolveStack(value: string | undefined): Stack {
  if (!value) {
    console.log(
      `missing required --stack option. Available stacks: ${STACK_CHOICES.join(', ')}`,
    );
    process.exit(1);
  }
  const normalized = value.toLowerCase() as Stack;
  if (!STACK_CHOICES.includes(normalized)) {
    console.log(
      `invalid stack: ${value}. Available stacks: ${STACK_CHOICES.join(', ')}`,
    );
    process.exit(1);
  }
  return normalized;
}

function createRunOptions(
  stack: Stack,
  envData: Awaited<ReturnType<typeof setupEnvironment>>,
  stackMajor: number,
  options: CommandOptions,
  overrides: Partial<RunOptions> = {},
): RunOptions {
  const runOptions: RunOptions = {
    stack,
    root: envData.root,
    workspace: envData.workspace,
    stackPath: envData.stackPath,
    projectPath: envData.projectPath,
    stackMajor,
    projectMajor: stackMajor,
    release: options.release,
    verify: options.verify,
    skipGit: false,
    suiteBranch: ignorePrecoded(options.suiteBranch),
    suiteTag: ignorePrecoded(options.suiteTag),
    suiteCommit: ignorePrecoded(options.suiteCommit),
  };
  assignStackAliases(runOptions, stack, envData.stackPath, stackMajor);
  return { ...runOptions, ...overrides };
}

async function runSuite(stack: Stack, suite: string, options: RunOptions) {
  const { test } = await import(`./tests/${stack}/${suite}.ts`);
  await test({
    ...options,
    workspace: path.resolve(options.workspace, suite),
  });
}

function getSuitesToRun(stack: Stack, suites: string[], root: string) {
  const stackDir = path.join(root, 'tests', stack);
  if (!fs.existsSync(stackDir)) {
    console.log(`invalid stack "${stack}", expected suites under ${stackDir}`);
    process.exit(1);
  }
  let suitesToRun: string[] = suites;
  const availableSuites: string[] = fs
    .readdirSync(stackDir)
    .filter((f: string) => !f.startsWith('_') && f.endsWith('.ts'))
    .map((f: string) => f.slice(0, -3));
  availableSuites.sort();
  if (suitesToRun.length === 0) {
    suitesToRun = availableSuites;
  } else {
    const invalidSuites = suitesToRun.filter(
      (name) => !name.startsWith('_') && !availableSuites.includes(name),
    );
    if (invalidSuites.length) {
      console.log(
        `invalid suite(s): ${invalidSuites.join(', ')} for stack ${stack}`,
      );
      console.log(`available suites: ${availableSuites.join(', ')}`);
      process.exit(1);
    }
  }
  return suitesToRun;
}

function assignStackAliases(
  runOptions: RunOptions,
  stack: Stack,
  stackPath: string,
  stackMajor: number,
) {
  if (stack === 'rsbuild') {
    runOptions.rsbuildPath = stackPath;
    runOptions.rsbuildMajor = stackMajor;
  } else if (stack === 'rspack') {
    runOptions.rspackPath = stackPath;
    runOptions.rspackMajor = stackMajor;
  } else if (stack === 'rstest') {
    runOptions.rstestPath = stackPath;
    runOptions.rstestMajor = stackMajor;
  } else if (stack === 'rslib') {
    runOptions.rslibPath = stackPath;
    runOptions.rslibMajor = stackMajor;
  } else if (stack === 'rsdoctor') {
    runOptions.rsdoctorPath = stackPath;
    runOptions.rsdoctorMajor = stackMajor;
  } else if (stack === 'rslint') {
    runOptions.rslintPath = stackPath;
    runOptions.rslintMajor = stackMajor;
  }
}
