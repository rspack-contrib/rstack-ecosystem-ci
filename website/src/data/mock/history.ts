import type { EcosystemCommitHistory } from '@/types';

import rsbuild from './rsbuild.json';
import rslib from './rslib.json';
import rspack from './rspack.json';
import rstest from './rstest.json';

const mockHistory = {
  rsbuild,
  rspack,
  rslib,
  rstest,
} satisfies Record<string, EcosystemCommitHistory>;

export default mockHistory;
