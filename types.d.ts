// eslint-disable-next-line n/no-unpublished-import
import type { Agent } from '@antfu/ni';

export type Stack =
  | 'rsbuild'
  | 'rspack'
  | 'rstest'
  | 'rslib'
  | 'rsdoctor'
  | 'rslint'
  | 'rspress';

export interface EnvironmentData {
  stack: Stack;
  root: string;
  workspace: string;
  stackPath: string;
  projectPath: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  rsbuildPath?: string;
  rspackPath?: string;
  rstestPath?: string;
  rslibPath?: string;
  rsdoctorPath?: string;
  rslintPath?: string;
  rspressPath?: string;
}

export interface RunOptions {
  stack: Stack;
  workspace: string;
  root: string;
  stackPath: string;
  projectPath: string;
  stackMajor: number;
  projectMajor: number;
  rsbuildPath?: string;
  rspackPath?: string;
  rstestPath?: string;
  rslibPath?: string;
  rsdoctorPath?: string;
  rslintPath?: string;
  rspressPath?: string;
  rsbuildMajor?: number;
  rspackMajor?: number;
  rstestMajor?: number;
  rslibMajor?: number;
  rsdoctorMajor?: number;
  rslintMajor?: number;
  rspressMajor?: number;
  verify?: boolean;
  skipGit?: boolean;
  release?: string;
  agent?: Agent;
  build?: Task | Task[];
  test?: Task | Task[];
  beforeInstall?: Task | Task[];
  afterInstall?: Task | Task[];
  beforeBuild?: Task | Task[];
  beforeTest?: Task | Task[];
  suiteBranch?: string;
  suiteTag?: string;
  suiteCommit?: string;
}

export type Task = string | (() => Promise<any>);

export interface CommandOptions {
  stack?: Stack;
  repo?: string;
  branch?: string;
  tag?: string;
  commit?: string;
  release?: string;
  verify?: boolean;
  skipGit?: boolean;
  suiteBranch?: string;
  suiteTag?: string;
  suiteCommit?: string;
}

export interface RepoOptions {
  repo: string;
  dir?: string;
  branch?: string;
  tag?: string;
  commit?: string;
  shallow?: boolean;
  overrides?: Overrides;
}

export interface Overrides {
  [key: string]: string | boolean;
}
