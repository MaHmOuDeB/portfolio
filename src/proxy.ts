// Cookieless assignment. Every request for / is rewritten to one group's static page, /v/a or /v/b,
// drawn afresh for that request: nothing is stored or read about the visitor (no cookie, no hash),
// and `x-arm` names the group. ?variant= forces a group (the beacon reports it as forced), and a bot
// user agent always gets group a. The rewrite keeps the address bar at / and the search params.
//
// - In production, / on any host other than the canonical one (VERCEL_PROJECT_PRODUCTION_URL) is
//   redirected there with a 308, so every counted view comes from the origin the event route allows.
// - A direct request for /v/* is rewritten to /v/_, a group that does not exist; with dynamicParams
//   off, that is the site's own 404 page. ISR revalidation requests carry x-prerender-revalidate and
//   skip the proxy (the matcher's `missing`), so the static pages still regenerate. The condition is
//   only that the header exists, so any client that sends it gets the group page directly. That
//   view cannot count: the beacon counts only a document whose first load was /.
// - It logs nothing and sets no cookie.
import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from './lib/env.ts';
import { assignArm } from './lib/experiment/assign.ts';

export const config = {
  matcher: [{ source: '/' }, { source: '/v/:path*', missing: [{ type: 'header', key: 'x-prerender-revalidate' }] }],
};

/** A uniform draw in [0, 1) from the platform's cryptographic generator. */
function random(): number {
  const word = new Uint32Array(1);
  crypto.getRandomValues(word);
  return word[0]! / 2 ** 32;
}

export function proxy(request: NextRequest): NextResponse {
  const url = request.nextUrl;
  if (url.pathname !== '/') return NextResponse.rewrite(new URL('/v/_', request.url));

  const env = serverEnv();
  const canonical = env.productionHost?.toLowerCase();
  if (env.vercelEnv === 'production' && canonical !== undefined && url.host.toLowerCase() !== canonical) {
    return NextResponse.redirect(new URL(`/${url.search}`, `https://${canonical}`), 308);
  }

  const { arm } = assignArm({ search: url.searchParams, userAgent: request.headers.get('user-agent'), random });
  const target = new URL(`/v/${arm}`, request.url);
  target.search = url.search;
  const response = NextResponse.rewrite(target);
  response.headers.set('x-arm', arm);
  return response;
}
