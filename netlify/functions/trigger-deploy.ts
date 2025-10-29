const handler = async (_req: Request): Promise<Response> => {
  const hookUrl = process.env.NETLIFY_BUILD_HOOK_URL;

  if (!hookUrl) {
    return new Response(
      'Missing NETLIFY_BUILD_HOOK_URL environment variable.',
      {
        status: 500,
      },
    );
  }

  const response = await fetch(hookUrl, { method: 'POST' });

  if (!response.ok) {
    const message = await response.text();
    return new Response(`Failed to trigger Netlify build hook: ${message}`, {
      status: response.status,
    });
  }

  return new Response('Triggered Netlify deploy successfully.', {
    status: 200,
  });
};

export default handler;
