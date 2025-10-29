import type { EcosystemCommitHistory } from '@/types';

import rsbuild from './rsbuild.json';
import rsdoctor from './rsdoctor.json';
import rslib from './rslib.json';
import rslint from './rslint.json';
import rspack from './rspack.json';
import rstest from './rstest.json';

const mockHistory = {
  rsbuild: rsbuild as EcosystemCommitHistory,
  rsdoctor: rsdoctor as EcosystemCommitHistory,
  rspack: rspack as EcosystemCommitHistory,
  rslib: rslib as EcosystemCommitHistory,
  rstest: rstest as EcosystemCommitHistory,
  rslint: rslint as EcosystemCommitHistory,
} satisfies Record<string, EcosystemCommitHistory>;

export default mockHistory;
