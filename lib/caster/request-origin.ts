const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isCasterRequestAtOrigin(request: Request, origin: string | null) {
  if (!origin) return false;
  const url = new URL(request.url);
  if (url.origin === origin) return true;

  // Local Next can reconstruct a 127.0.0.1 URL and Host as localhost during
  // internal routing. Require the original host and keep this alias local.
  const expected = new URL(origin);
  const host = request.headers.get("host");
  return !process.env.VERCEL && !process.env.VERCEL_ENV &&
    LOOPBACK_HOSTS.has(expected.hostname) && LOOPBACK_HOSTS.has(url.hostname) &&
    url.port === expected.port && url.protocol === expected.protocol &&
    (host === expected.host || (host === url.host && request.headers.get("x-forwarded-host") === expected.host));
}
