/** Verifies a Cloudflare Turnstile token server-side. Resolves false on any failure. */
export type CaptchaVerifier = (token: string) => Promise<boolean>;

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * The client IP is deliberately not sent (`remoteip` is optional): IPs never leave our servers.
 * The token and the response body are never logged.
 */
export function createTurnstileVerifier(secret: string, doFetch: typeof fetch = fetch): CaptchaVerifier {
  return async (token) => {
    try {
      const res = await doFetch(SITEVERIFY, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token }).toString(),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        return false;
      }
      const json = (await res.json()) as { success?: unknown };
      return json.success === true;
    } catch {
      return false;
    }
  };
}
