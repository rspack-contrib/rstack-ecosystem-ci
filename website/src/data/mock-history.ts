import type { EcosystemCommitHistory } from '@/types';

import rsbuild from './mock/rsbuild.json';
import rslib from './mock/rslib.json';
import rspack from './mock/rspack.json';
import rstest from './mock/rstest.json';

const mockHistory = {
  rsbuild,
  rspack,
  rslib,
  rstest,
} satisfies Record<string, EcosystemCommitHistory>;

export default mockHistory;
