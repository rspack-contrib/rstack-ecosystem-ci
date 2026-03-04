import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import actionsCore from '@actions/core';
//eslint-disable-next-line n/no-unpublished-import
import { AGENTS, type Agent, detect, getCommand } from '@antfu/ni';
import { getPackages } from '@manypkg/get-packages';
import { type Options as ExecaOptions, execaCommand } from 'execa';
import yaml from 'yaml';
import type {
  EnvironmentData,
  Overrides,
  RepoOptions,
  RunOptions,
  Stack,
  Task,
} from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isGitHubActions = !!process.env.GITHUB_ACTIONS;

const STACK_WORKSPACE_DIR: Record<Stack, string> = {
  rsbuild: 'rsbuild',
  rspack: 'rspack',
  rstest: 'rstest',
  rslib: 'rslib',
  rsdoctor: 'rsdoctor',
  rspress: 'rspress',
};

const STACK_DEFAULT_REPO: Record<Stack, string> = {
  rsbuild: 'web-infra-dev/rsbuild',
  rspack: 'web-infra-dev/rspack',
  rstest: 'web-infra-dev/rstest',
  rslib: 'web-infra-dev/rslib',
  rsdoctor: 'web-infra-dev/rsdoctor',
  rspress: 'web-infra-dev/rspress',
};

let activeStack: Stack = 'rsbuild';
let stackPath: string;
let workspaceRoot: string;
let cwd: string;
let env: NodeJS.ProcessEnv;

const monorepoPackagesCache: Partial<
  Record<
    'rsbuild' | 'rstest' | 'rslib' | 'rsdoctor' | 'rspress',
    { name: string; directory: string }[]
  >
> = {};

interface RspackPackageInfo {
  name: string;
  directory: string;
}

interface RspackPackageData {
  npm: RspackPackageInfo[];
  binding: RspackPackageInfo[];
  packages: RspackPackageInfo[];
}

let rspackPackageData: RspackPackageData | null = null;

export function cd(dir: string) {
  cwd = path.resolve(cwd, dir);
}

export async function $(literals: TemplateStringsArray, ...values: unknown[]) {
  const cmd = literals.reduce(
    (result, current, i) =>
      result + current + (values?.[i] != null ? `${values[i]}` : ''),
    '',
  );

  const start = Date.now();
  if (isGitHubActions) {
    actionsCore.startGroup(`${cwd} $> ${cmd}`);
  } else {
    console.log(`${cwd} $> ${cmd}`);
  }

  const proc = execaCommand(cmd, {
    env,
    stdio: 'pipe',
    cwd,
    reject: false,
  });
  proc.stdin?.pipe(process.stdin);
  proc.stdout?.pipe(process.stdout);
  proc.stderr?.pipe(process.stderr);
  const result = await proc;

  if (result.failed) {
    const errorResult = result as unknown as {
      shortMessage?: string;
      message?: string;
    };
    throw new Error(
      errorResult.shortMessage ?? errorResult.message ?? 'Command failed',
    );
  }

  if (isGitHubActions) {
    actionsCore.endGroup();
    const cost = Math.ceil((Date.now() - start) / 1000);
    console.log(`Cost for \`${cmd}\`: ${cost} s`);
  }

  return result.stdout;
}

export const execa = async (cmd: string, options?: ExecaOptions) => {
  const start = Date.now();
  if (isGitHubActions) {
    actionsCore.startGroup(`${cwd} $> ${cmd}`);
  } else {
    console.log(`${cwd} $> ${cmd}`);
  }

  const proc = execaCommand(cmd, {
    env,
    cwd,
    stdio: 'pipe',
    ...options,
  });
  proc.stdin?.pipe(process.stdin);
  proc.stdout?.pipe(process.stdout);
  proc.stderr?.pipe(process.stderr);
  const result = await proc;

  if (isGitHubActions) {
    actionsCore.endGroup();
    const cost = Math.ceil((Date.now() - start) / 1000);
    console.log(`Cost for \`${cmd}\`: ${cost} s`);
  }

  return result.stdout;
};

export async function setupEnvironment(stack: Stack): Promise<EnvironmentData> {
  // @ts-expect-error import.meta
  const root = dirnameFrom(import.meta.url);
  workspaceRoot = path.resolve(root, 'workspace');
  stackPath = path.resolve(workspaceRoot, STACK_WORKSPACE_DIR[stack]);
  activeStack = stack;
  cwd = process.cwd();
  env = {
    ...process.env,
    CI: 'true',
    TURBO_FORCE: 'true', // disable turbo caching, ecosystem-ci modifies things and we don't want replays
    YARN_ENABLE_IMMUTABLE_INSTALLS: 'false', // to avoid errors with mutated lockfile due to overrides
    NODE_OPTIONS: '--max-old-space-size=6144', // GITHUB CI has 7GB max, stay below
    ECOSYSTEM_CI: 'true', // flag for tests, can be used to conditionally skip irrelevant tests.
  };
  initWorkspace(workspaceRoot);
  fs.mkdirSync(stackPath, { recursive: true });
  if (stack === 'rspack') {
    rspackPackageData = null;
  }
  const data: EnvironmentData = {
    stack,
    root,
    workspace: workspaceRoot,
    stackPath,
    projectPath: stackPath,
    cwd,
    env,
  };
  if (stack === 'rsbuild') {
    data.rsbuildPath = stackPath;
  } else if (stack === 'rspack') {
    data.rspackPath = stackPath;
  } else if (stack === 'rstest') {
    data.rstestPath = stackPath;
  } else if (stack === 'rslib') {
    data.rslibPath = stackPath;
  } else if (stack === 'rsdoctor') {
    data.rsdoctorPath = stackPath;
  } else if (stack === 'rspress') {
    data.rspressPath = stackPath;
  }
  return data;
}

export function getDefaultRepository(stack: Stack) {
  return STACK_DEFAULT_REPO[stack];
}

function initWorkspace(workspace: string) {
  if (!fs.existsSync(workspace)) {
    fs.mkdirSync(workspace, { recursive: true });
  }
  const eslintrc = path.join(workspace, '.eslintrc.json');
  if (!fs.existsSync(eslintrc)) {
    fs.writeFileSync(eslintrc, '{"root":true}\n', 'utf-8');
  }
  const editorconfig = path.join(workspace, '.editorconfig');
  if (!fs.existsSync(editorconfig)) {
    fs.writeFileSync(editorconfig, 'root = true\n', 'utf-8');
  }
}

export async function setupRepo(options: RepoOptions) {
  if (options.branch == null) {
    options.branch = 'main';
  }
  if (options.shallow == null) {
    options.shallow = true;
  }

  let { repo, commit, branch, tag, dir, shallow } = options;
  if (!dir) {
    throw new Error('setupRepo must be called with options.dir');
  }
  if (!repo.includes(':')) {
    repo = `https://github.com/${repo}.git`;
  }

  let needClone = true;
  if (fs.existsSync(dir)) {
    const _cwd = cwd;
    cd(dir);
    let currentClonedRepo: string | undefined;
    try {
      currentClonedRepo = await $`git ls-remote --get-url`;
    } catch {
      // when not a git repo
    }
    cd(_cwd);

    if (repo === currentClonedRepo) {
      needClone = false;
    } else {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  if (needClone) {
    await $`git -c advice.detachedHead=false clone ${
      shallow ? '--depth=1 --no-tags' : ''
    } --branch ${tag || branch} ${repo} ${dir}`;
  }
  cd(dir);
  await $`git clean -fdxq`;
  await $`git fetch ${shallow ? '--depth=1 --no-tags' : '--tags'} origin ${
    tag ? `tag ${tag}` : `${commit || branch}`
  }`;
  if (shallow) {
    await $`git -c advice.detachedHead=false checkout ${
      tag ? `tags/${tag}` : `${commit || branch}`
    }`;
  } else {
    await $`git checkout ${branch}`;
    await $`git merge FETCH_HEAD`;
    if (tag || commit) {
      await $`git reset --hard ${tag || commit}`;
    }
  }
  await $`git log -1 --format='%H'`;
}

function toCommand(
  task: Task | Task[] | void,
  agent: Agent,
): ((scripts: any) => Promise<any>) | void {
  return async (scripts: any) => {
    const tasks = Array.isArray(task) ? task : [task];
    for (const task of tasks) {
      if (task == null || task === '') {
        continue;
      }
      if (typeof task === 'string') {
        const scriptOrBin = task.trim().split(/\s+/)[0];
        if (scripts?.[scriptOrBin] != null) {
          const runTaskWithAgent = getCommand(agent, 'run', [task]);
          await $`${runTaskWithAgent}`;
        } else {
          await $`${task}`;
        }
      } else if (typeof task === 'function') {
        await task();
      } else {
        throw new Error(
          `invalid task, expected string or function but got ${typeof task}: ${task}`,
        );
      }
    }
  };
}

async function getMonorepoPackages(
  stack: 'rsbuild' | 'rstest' | 'rslib' | 'rsdoctor' | 'rspress',
) {
  const cached = monorepoPackagesCache[stack];
  if (cached) {
    return cached;
  }
  const packages = await getPackages(stackPath);
  const packageList = packages.packages.map((pkg) => ({
    name: pkg.packageJson.name,
    directory: pkg.dir,
  }));
  monorepoPackagesCache[stack] = packageList;
  return packageList;
}

async function getRspackPackageData(): Promise<RspackPackageData> {
  if (rspackPackageData) {
    return rspackPackageData;
  }
  const {
    default: { npm, binding, packages },
  } = await import('./rspack-package.json');
  const optionalKey = `${process.platform}-${process.arch}` as
    | 'darwin-arm64'
    | 'darwin-x64'
    | 'linux-x64'
    | 'win32-x64';
  assert(
    Object.keys(npm).includes(optionalKey),
    `${optionalKey} is not supported`,
  );
  const normalize = (pkg: RspackPackageInfo) => ({
    name: pkg.name,
    directory: path.join(stackPath, pkg.directory),
  });
  rspackPackageData = {
    npm: npm[
      optionalKey as 'darwin-arm64' | 'darwin-x64' | 'linux-x64' | 'win32-x64'
    ].map(normalize),
    binding: binding.map(normalize),
    packages: packages.map(normalize),
  };
  return rspackPackageData;
}

export async function runInRepo(options: RunOptions & RepoOptions) {
  if (options.verify == null) {
    options.verify = true;
  }
  if (options.skipGit == null) {
    options.skipGit = false;
  }
  if (options.branch == null) {
    options.branch = 'main';
  }

  const {
    build,
    test,
    repo,
    branch,
    tag,
    commit,
    skipGit,
    verify,
    beforeInstall,
    afterInstall,
    beforeBuild,
    beforeTest,
  } = options;

  const dir = path.resolve(
    options.workspace,
    options.dir || repo.substring(repo.lastIndexOf('/') + 1),
  );

  if (!skipGit) {
    await setupRepo({
      repo,
      dir,
      branch: options.suiteBranch ?? branch,
      tag: options.suiteTag ?? tag,
      commit: options.suiteCommit ?? commit,
    });
  } else {
    cd(dir);
  }
  const workspaceFile = path.resolve(__dirname, 'pnpm-workspace.yaml');
  const tempWorkspaceFile = path.resolve(__dirname, '_pnpm-workspace.yaml');
  const isFileNotFoundError = (error: unknown) =>
    Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT',
    );
  let workspaceRenamed = false;
  // weird, is the pnpm-workspace.yaml exists in the root dir, some package installation will fail.
  // e.g. `pnpm test --stack rsbuild plugins`
  try {
    await fs.promises.rename(workspaceFile, tempWorkspaceFile);
    workspaceRenamed = true;
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  const runWorkflow = async () => {
    if (options.agent == null) {
      const detectedAgent = await detect({ cwd: dir, autoInstall: false });
      if (detectedAgent == null) {
        throw new Error(`Failed to detect packagemanager in ${dir}`);
      }
      options.agent = detectedAgent;
    }
    if (!AGENTS[options.agent]) {
      throw new Error(
        `Invalid agent ${options.agent}. Allowed values: ${Object.keys(
          AGENTS,
        ).join(', ')}`,
      );
    }
    const agent = options.agent;
    const beforeInstallCommand = toCommand(beforeInstall, agent);
    const afterInstallCommand = toCommand(afterInstall, agent);
    const beforeBuildCommand = toCommand(beforeBuild, agent);
    const beforeTestCommand = toCommand(beforeTest, agent);
    const buildCommand = toCommand(build, agent);
    const testCommand = toCommand(test, agent);

    const pkgFile = path.join(dir, 'package.json');
    const pkg = JSON.parse(await fs.promises.readFile(pkgFile, 'utf-8'));

    if (verify && test) {
      const frozenInstall = getCommand(agent, 'frozen');
      await $`${frozenInstall}`;
      await beforeBuildCommand?.(pkg.scripts);
      await buildCommand?.(pkg.scripts);
      await beforeTestCommand?.(pkg.scripts);
      await testCommand?.(pkg.scripts);
    }
    const overrides: Overrides = { ...(options.overrides || {}) };

    if (
      activeStack === 'rsbuild' ||
      activeStack === 'rstest' ||
      activeStack === 'rslib' ||
      activeStack === 'rsdoctor' ||
      activeStack === 'rspress'
    ) {
      const packages = await getMonorepoPackages(activeStack);
      if (options.release) {
        for (const pkgInfo of packages) {
          if (
            overrides[pkgInfo.name] &&
            overrides[pkgInfo.name] !== options.release
          ) {
            throw new Error(
              `conflicting overrides[${pkgInfo.name}]=${overrides[pkgInfo.name]} and --release=${options.release} config. Use either one or the other`,
            );
          }
          overrides[pkgInfo.name] = options.release;
        }
      } else {
        for (const pkgInfo of packages) {
          overrides[pkgInfo.name] ||= pkgInfo.directory;
        }
      }
      await applyPackageOverrides({
        dir,
        pkg,
        overrides,
        agent,
        beforeInstallCommand,
        installArgs: {
          pnpm: [
            '--prefer-frozen-lockfile',
            '--prefer-offline',
            '--strict-peer-dependencies',
            'false',
          ],
        },
        devDependencyStrategy: 'local',
      });
    } else {
      const { npm, binding, packages } = await getRspackPackageData();
      const packageList = [
        ...(options.release ? [] : npm),
        ...binding,
        ...packages,
      ];
      if (options.release) {
        for (const pkgInfo of packageList) {
          if (
            overrides[pkgInfo.name] &&
            overrides[pkgInfo.name] !== options.release
          ) {
            throw new Error(
              `conflicting overrides[${pkgInfo.name}]=${overrides[pkgInfo.name]} and --release=${options.release} config. Use either one or the other`,
            );
          }
          overrides[pkgInfo.name] = options.release;
        }
      } else {
        await patchBindingPackageJson(binding);
        for (const pkgInfo of packageList) {
          overrides[pkgInfo.name] ||= pkgInfo.directory;
        }
      }
      await applyPackageOverrides({
        dir,
        pkg,
        overrides,
        agent,
        beforeInstallCommand,
        installArgs: {
          pnpm: [
            '--prefer-frozen-lockfile',
            '--prefer-offline',
            '--no-strict-peer-dependencies',
          ],
        },
        devDependencyStrategy: 'all',
      });
    }
    await afterInstallCommand?.(pkg.scripts);
    await beforeBuildCommand?.(pkg.scripts);
    await buildCommand?.(pkg.scripts);
    if (test) {
      await beforeTestCommand?.(pkg.scripts);
      await testCommand?.(pkg.scripts);
    }
    return { dir };
  };

  try {
    return await runWorkflow();
  } finally {
    if (workspaceRenamed) {
      try {
        await fs.promises.rename(tempWorkspaceFile, workspaceFile);
      } catch (error) {
        if (!isFileNotFoundError(error)) {
          // biome-ignore lint/correctness/noUnsafeFinally: <explanation>
          throw error;
        }
      }
    }
  }
}

export async function setupStackRepo(options: Partial<RepoOptions> = {}) {
  const repo = options.repo ?? STACK_DEFAULT_REPO[activeStack];
  await setupRepo({
    repo,
    dir: stackPath,
    branch: 'main',
    shallow: true,
    ...options,
  });
  if (
    activeStack === 'rsbuild' ||
    activeStack === 'rstest' ||
    activeStack === 'rslib' ||
    activeStack === 'rsdoctor' ||
    activeStack === 'rspress'
  ) {
    delete monorepoPackagesCache[activeStack];
  } else if (activeStack === 'rspack') {
    rspackPackageData = null;
  }
}

export async function getPermanentRef() {
  cd(stackPath);
  try {
    const ref = await $`git log -1 --pretty=format:%h`;
    return ref;
  } catch (e) {
    console.warn(`Failed to obtain perm ref. ${e}`);
    return undefined;
  }
}

export async function buildStack({ verify = false }: { verify?: boolean }) {
  cd(stackPath);
  if (activeStack === 'rspack') {
    const frozenInstall = getCommand('pnpm', 'frozen');
    const runBuildBinding = getCommand('pnpm', 'run', [
      'build:binding:release',
    ]);
    const runMoveBinding = getCommand('pnpm', 'run', [
      '--filter @rspack/binding move-binding',
    ]);
    const runBuildJs = getCommand('pnpm', 'run', ['build:js']);
    await $`${frozenInstall}`;
    await $`cargo codegen`;
    await $`${runBuildBinding}`;
    await $`${runMoveBinding}`;
    await $`${runBuildJs}`;
    if (verify) {
      const runTest = getCommand('pnpm', 'run', ['test:js']);
      await $`${runTest}`;
    }
  } else {
    const frozenInstall = getCommand('pnpm', 'frozen');
    const runBuild = getCommand('pnpm', 'run', ['build']);
    await $`${frozenInstall}`;
    await $`${runBuild}`;
    if (verify) {
      const runTest = getCommand('pnpm', 'run', ['test']);
      await $`${runTest}`;
    }
  }
}

export async function bisectStack(
  good: string,
  runSuite: () => Promise<Error | void>,
) {
  const resetChanges = async () => $`git reset --hard HEAD`;

  try {
    cd(stackPath);
    await resetChanges();
    await $`git bisect start`;
    await $`git bisect bad`;
    await $`git bisect good ${good}`;
    let bisecting = true;
    while (bisecting) {
      const commitMsg = await $`git log -1 --format=%s`;
      const isNonCodeCommit = commitMsg.match(/^(?:release|docs)[:(]/);
      if (isNonCodeCommit) {
        await $`git bisect skip`;
        continue;
      }
      const error = await runSuite();
      cd(stackPath);
      await resetChanges();
      const bisectOut = await $`git bisect ${error ? 'bad' : 'good'}`;
      bisecting = bisectOut.substring(0, 10).toLowerCase() === 'bisecting:';
    }
  } catch (e) {
    console.log('error while bisecting', e);
  } finally {
    try {
      cd(stackPath);
      await $`git bisect reset`;
    } catch (e) {
      console.log('Error while resetting bisect', e);
    }
  }
}

function isLocalOverride(v: string): boolean {
  if (!v.includes('/') || v.startsWith('@')) {
    return false;
  }
  try {
    return !!fs.lstatSync(v)?.isDirectory();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw e;
    }
    return false;
  }
}

async function patchBindingPackageJson(infos: RspackPackageInfo[]) {
  for (const bindingInfo of infos) {
    const pkgJsonPath = path.join(bindingInfo.directory, 'package.json');
    const pkgJson = JSON.parse(
      await fs.promises.readFile(pkgJsonPath, 'utf-8'),
    );
    pkgJson.optionalDependencies = undefined;
    await fs.promises.writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2));
  }
}

async function readPnpmWorkspaceYaml(
  dir: string,
): Promise<{ exists: boolean; content: any; filePath: string }> {
  const filePath = path.join(dir, 'pnpm-workspace.yaml');
  if (!fs.existsSync(filePath)) {
    return { exists: false, content: null, filePath };
  }
  const content = await fs.promises.readFile(filePath, 'utf-8');
  const parsed = yaml.parse(content);
  return { exists: true, content: parsed || {}, filePath };
}

async function writePnpmWorkspaceYaml(
  filePath: string,
  content: any,
): Promise<void> {
  const yamlContent = yaml.stringify(content);
  await fs.promises.writeFile(filePath, yamlContent, 'utf-8');
}

async function applyPackageOverrides({
  dir,
  pkg,
  overrides = {},
  agent,
  beforeInstallCommand,
  installArgs,
  devDependencyStrategy = 'local',
}: {
  dir: string;
  pkg: any;
  overrides: Overrides;
  agent: Agent;
  beforeInstallCommand: ((scripts: any) => Promise<any>) | void;
  installArgs?: {
    pnpm?: string[];
    yarn?: string[];
    npm?: string[];
  };
  devDependencyStrategy?: 'all' | 'local';
}) {
  const useFileProtocol = (v: string) =>
    isLocalOverride(v) ? `file:${path.resolve(v)}` : v;
  const normalizedOverrides = Object.fromEntries(
    Object.entries(overrides)
      .filter(([_key, value]) => typeof value === 'string')
      .map(([key, value]) => [key, useFileProtocol(value as string)]),
  );

  const devOverrides =
    devDependencyStrategy === 'all'
      ? normalizedOverrides
      : Object.fromEntries(
          Object.entries(normalizedOverrides).filter(([_key, value]) =>
            (value as string).startsWith('file:'),
          ),
        );

  await $`git clean -fdxq`;

  const pm = agent.split('@')[0];

  if (pm === 'pnpm') {
    if (!pkg.devDependencies) {
      pkg.devDependencies = {};
    }
    pkg.devDependencies = {
      ...pkg.devDependencies,
      ...devOverrides,
    };

    // Check for overrides location: pnpm-workspace.yaml or package.json
    const workspace = await readPnpmWorkspaceYaml(dir);
    const hasWorkspaceOverrides =
      workspace.exists && workspace.content.overrides;
    const hasPackageOverrides = pkg.pnpm?.overrides;

    // Conflict check: overrides cannot exist in both locations
    if (hasWorkspaceOverrides && hasPackageOverrides) {
      throw new Error(
        'Conflicting overrides detected: both pnpm-workspace.yaml and package.json contain pnpm overrides. ' +
          'Please use only one location for overrides configuration.',
      );
    }

    // Apply overrides to the appropriate location
    if (hasWorkspaceOverrides) {
      // Write to pnpm-workspace.yaml
      workspace.content.overrides = {
        ...workspace.content.overrides,
        ...normalizedOverrides,
      };
      await writePnpmWorkspaceYaml(workspace.filePath, workspace.content);
    } else {
      // Write to package.json (default)
      if (!pkg.pnpm) {
        pkg.pnpm = {};
      }
      pkg.pnpm.overrides = {
        ...pkg.pnpm.overrides,
        ...normalizedOverrides,
      };
    }
  } else if (pm === 'yarn') {
    if (!pkg.devDependencies) {
      pkg.devDependencies = {};
    }
    pkg.devDependencies = {
      ...pkg.devDependencies,
      ...devOverrides,
    };
    pkg.resolutions = {
      ...pkg.resolutions,
      ...normalizedOverrides,
    };
  } else if (pm === 'npm') {
    pkg.overrides = {
      ...pkg.overrides,
      ...normalizedOverrides,
    };
    for (const [name, version] of Object.entries(normalizedOverrides)) {
      if (pkg.dependencies?.[name]) {
        pkg.dependencies[name] = version;
      }
      if (pkg.devDependencies?.[name]) {
        pkg.devDependencies[name] = version;
      }
    }
  } else {
    throw new Error(`unsupported package manager detected: ${pm}`);
  }
  const pkgFile = path.join(dir, 'package.json');
  await fs.promises.writeFile(pkgFile, JSON.stringify(pkg, null, 2), 'utf-8');

  await beforeInstallCommand?.(pkg.scripts);

  if (pm === 'pnpm') {
    const pnpmArgs = installArgs?.pnpm ?? [];
    const command = ['pnpm', 'install', ...pnpmArgs].join(' ');
    await $`${command}`;
  } else if (pm === 'yarn') {
    const yarnArgs = installArgs?.yarn ?? [];
    const command = ['yarn', 'install', ...yarnArgs].join(' ');
    await $`${command}`;
  } else if (pm === 'npm') {
    const npmArgs = installArgs?.npm ?? [];
    const command = ['npm', 'install', ...npmArgs].join(' ');
    await $`${command}`;
  }
}

export function dirnameFrom(url: string) {
  return path.dirname(fileURLToPath(url));
}

export function parseStackMajor(projectPath: string): number {
  if (activeStack === 'rspack') {
    const content = fs.readFileSync(
      path.join(projectPath, 'packages', 'rspack', 'package.json'),
      'utf-8',
    );
    const pkg = JSON.parse(content);
    return parseMajorVersion(pkg.version);
  }
  const packageJsonPath = path.join(
    projectPath,
    'packages',
    'core',
    'package.json',
  );
  const content = fs.readFileSync(packageJsonPath, 'utf-8');
  const pkg = JSON.parse(content);
  return parseMajorVersion(pkg.version);
}

export function parseMajorVersion(version: string) {
  return Number.parseInt(version.split('.', 1)[0], 10);
}

function ignoreString(str: string | undefined, ignored: string) {
  return str !== ignored ? str : undefined;
}

export function ignorePrecoded(str: string | undefined) {
  return ignoreString(str, 'precoded');
}
