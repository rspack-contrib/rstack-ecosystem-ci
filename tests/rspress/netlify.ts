import { $ } from '../../utils';

interface DeployOptions {
  alias?: string;
  message: string;
  outputDir?: string;
  siteIdEnvVar?: string;
}

const DEFAULT_OUTPUT_DIR = 'dist';
const DEFAULT_NETLIFY_CLI = 'netlify-cli@17.38.1';
const DEFAULT_ALIAS = process.env.RSPRESS_NETLIFY_ALIAS ?? 'ecosystem-ci';

export async function deployPreviewToNetlify(options: DeployOptions) {
  const { message, outputDir = DEFAULT_OUTPUT_DIR, siteIdEnvVar } = options;
  const alias = options.alias ?? DEFAULT_ALIAS;
  const authToken = process.env.NETLIFY_AUTH_TOKEN;
  const siteId = siteIdEnvVar ? process.env[siteIdEnvVar] : undefined;

  if (!authToken || !siteId) {
    const siteHint = siteIdEnvVar
      ? `${siteIdEnvVar} or NETLIFY_SITE_ID`
      : 'NETLIFY_SITE_ID';
    console.log(
      `[rspress][netlify] Missing NETLIFY_AUTH_TOKEN or ${siteHint}, skip deploying alias ${alias}`,
    );
    return;
  }

  const cliSpecifier = process.env.RSPRESS_NETLIFY_CLI ?? DEFAULT_NETLIFY_CLI;
  const result =
    await $`pnpm dlx ${cliSpecifier} deploy --dir=${outputDir} --alias=${alias} --message=${message} --site=${siteId} --confirm --json`;

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
