import { $ } from '../../../utils';

interface DeployOptions {
  alias?: string;
  message: string;
  outputDir?: string;
  siteIdEnvVar?: string;
}

const DEFAULT_OUTPUT_DIR = './website/doc_build';
const DEFAULT_NETLIFY_CLI = 'netlify-cli@23.10.0';
const DEFAULT_ALIAS = process.env.RSPRESS_NETLIFY_ALIAS ?? 'ecosystem-ci';
export const MESSAGE = `${process.env.ECOSYSTEM_CI_TYPE}:${process.env.ECOSYSTEM_CI_REF}`;

export async function deployPreviewToNetlify(options: DeployOptions) {
  const { message, outputDir = DEFAULT_OUTPUT_DIR, siteIdEnvVar } = options;
  const defaultAlias =
    process.env.ECOSYSTEM_CI_TYPE === 'commit'
      ? DEFAULT_ALIAS
      : (process.env.ECOSYSTEM_CI_REF ?? DEFAULT_ALIAS);
  const alias = options.alias ?? defaultAlias;
  const authToken = process.env.NETLIFY_AUTH_TOKEN;
  const siteId = siteIdEnvVar ? process.env[siteIdEnvVar] : undefined;
  const missingVars: string[] = [];
  if (!authToken) {
    missingVars.push('NETLIFY_AUTH_TOKEN');
  }
  if (!siteId) {
    missingVars.push(siteIdEnvVar || 'site ID');
  }

  if (missingVars.length > 0) {
    console.log(
      `[rspress][netlify] Missing ${missingVars.join(', ')}, skip deploying alias ${alias}`,
    );
    return;
  }

  console.log(`[rspress][netlify] Deploying with alias: ${alias}`);

  const cliSpecifier = process.env.RSPRESS_NETLIFY_CLI ?? DEFAULT_NETLIFY_CLI;
  const result =
    await $`pnpm --package=${cliSpecifier} dlx netlify deploy --dir=${outputDir} --alias=${alias} --message=${message} --site=${siteId} --auth=${authToken} --json`;

  try {
    const parsed = JSON.parse(result);
    const previewUrl =
      parsed?.deploy?.deploy_ssl_url ?? parsed?.deploy?.deploy_url;
    if (previewUrl) {
      console.log(
        `[rspress][netlify] Alias ${alias} preview url: ${previewUrl}`,
      );
    }
  } catch (error) {
    console.log(
      `[rspress][netlify] Unable to parse deploy response JSON: ${(error as Error).message}`,
    );
  }
}
