// The site's Content Security Policy and the other baseline security headers. Imported by
// next.config.ts and by the tests, so it uses relative imports only and has no server-only code.
//
// There are no nonces: a nonce is generated per request, which forces every page to render
// dynamically (Next's CSP guide), and this site is static. 'unsafe-inline' is what Next's own inline
// bootstrap script and the style tags need. The policy still blocks every request to another site:
// connect-src and every fetch directive fall back to 'self', so a script cannot send anything to a
// third party, and no third-party script, frame or font can load.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/**
 * The rules for next.config.ts `headers()`. Production builds only: development needs 'unsafe-eval'
 * and a hot-reload socket that this policy would block. A later matching rule overrides an earlier
 * one for the same key, so the /exclude rule comes last.
 */
export function securityHeaders(nodeEnv: string | undefined): HeaderRule[] {
  if (nodeEnv !== 'production') return [];
  return [
    {
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: CSP },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    },
    {
      // The owner's private link: nothing about it goes to another site or into a cache.
      source: '/exclude',
      headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Cache-Control', value: 'no-store' },
      ],
    },
  ];
}
