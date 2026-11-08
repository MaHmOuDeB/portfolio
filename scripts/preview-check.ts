// Checks a deployed copy of the site for what only the real platform can show (see
// docs/experiment/deployed-checks.md). Every result stays unverified until it has run against a real
// deployment.
//
//   VERCEL_AUTOMATION_BYPASS_SECRET=... npm run experiment:preview-check -- <deploymentUrl> [--only a,b]
//
// Checks (the default is split, isr and headers; spoof and pause are production checks and run only
// when named with --only):
// - split: 200 GETs of / with a desktop Chrome user agent reach both groups, the split passes the
//   sample-ratio check, no response sets a cookie or a Cache-Control a shared cache may store, and
//   no single group takes every cache hit.
// - isr: a direct /v/a is the 404 page; both groups are seen through / before the wait; after more
//   than 300 s, each group's page served through / is a copy of the ISR entry (x-vercel-cache HIT or
//   REVALIDATED) younger than 300 s (the proxy does not block its regeneration), and data.json's
//   readAt advances.
// - headers: the security headers, HSTS included, are on /.
// - spoof: 31 event batches from one client with a rotated fake address: the 31st is rate-limited.
// - pause: after the pause flag is set, the event route answers "paused" within a minute.
// The bypass secret is sent as x-vercel-protection-bypass, only over https or to a loopback host, and
// never printed; no request follows a redirect, so it never reaches another host. Exit code: 0 when every
// check passed, 1 when one failed, 2 for a usage error.
import { randomUUID } from 'node:crypto';
import { srmTest } from '../src/lib/stats/proportions.ts';

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SPLIT_REQUESTS = 200;
const ISR_WAIT_MS = 310_000;
const ISR_RETRIES = 6;
const ISR_PAGE_REQUESTS = 60;
const REVALIDATE_SECONDS = 300;
const RATE_LIMIT = 30;
const PAUSE_POLL_MS = 5_000;
const PAUSE_WITHIN_MS = 60_000;

const CHECKS = ['split', 'isr', 'headers', 'spoof', 'pause'] as const;
type Check = (typeof CHECKS)[number];
const DEFAULT_CHECKS: Check[] = ['split', 'isr', 'headers'];

export type CheckDeps = {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  fetch: typeof fetch;
};

type Result = { ok: boolean; detail: string };
type Get = (path: string, init?: RequestInit) => Promise<Response>;

const defaults: CheckDeps = {
  env: process.env,
  out: (line) => process.stdout.write(`${line}\n`),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  fetch: (...args) => fetch(...args),
};

async function split(get: Get): Promise<Result> {
  const n = { a: 0, b: 0 };
  const hits = { a: 0, b: 0 };
  const cacheControl = new Set<string>();
  const vary = new Set<string>();
  const problems: string[] = [];
  for (let i = 0; i < SPLIT_REQUESTS; i++) {
    const res = await get('/', { headers: { 'user-agent': CHROME } });
    await res.arrayBuffer();
    const arm = res.headers.get('x-arm');
    if (res.status !== 200) problems.push(`status ${res.status}`);
    if (shareable(res.headers.get('cache-control'))) problems.push('a shared cache may store / (one group for everyone behind it)');
    if (res.headers.get('set-cookie') !== null) problems.push('a response set a cookie');
    if (arm !== 'a' && arm !== 'b') {
      problems.push('a response had no x-arm');
      continue;
    }
    n[arm] += 1;
    if ((res.headers.get('x-vercel-cache') ?? '').toUpperCase() === 'HIT') hits[arm] += 1;
    cacheControl.add(res.headers.get('cache-control') ?? '(none)');
    vary.add(res.headers.get('vary') ?? '(none)');
  }
  const counts = `a ${n.a}, b ${n.b}; HIT a ${hits.a}, b ${hits.b}; cache-control ${[...cacheControl].join(' | ')}; vary ${[...vary].join(' | ')}`;
  if (problems.length > 0) return { ok: false, detail: `${[...new Set(problems)].join(', ')} (${counts})` };
  if (n.a === 0 || n.b === 0) return { ok: false, detail: `one group only (${counts})` };
  const srm = srmTest(n.a, n.b);
  if (srm.flagged) return { ok: false, detail: `sample-ratio mismatch, p ${srm.p.toPrecision(2)} (${counts})` };
  if (hits.a + hits.b > 0 && (hits.a === 0 || hits.b === 0)) return { ok: false, detail: `one group takes every cache HIT (${counts})` };
  return { ok: true, detail: `${counts}; srm p ${srm.p.toPrecision(2)}` };
}

/**
 * True when a cache between the visitor and Vercel may store `/` and serve one group to everyone
 * behind it (RFC 9111): never with `private`, `no-store` or `no-cache`; otherwise `s-maxage`, a
 * `max-age` above 0 (with or without `public`), or `public` without `max-age` (heuristic freshness).
 * Vercel sends `public, max-age=0, must-revalidate`, which no shared cache may reuse without asking.
 */
export function shareable(cacheControl: string | null): boolean {
  const cc = (cacheControl ?? '').toLowerCase();
  const has = (directive: string) => new RegExp(`(^|[,\\s])${directive}($|[,\\s=])`).test(cc);
  if (has('private') || has('no-store') || has('no-cache')) return false;
  if (has('s-maxage')) return true;
  const maxAge = /(^|[,\s])max-age\s*=\s*(\d+)/.exec(cc);
  if (maxAge !== null) return Number(maxAge[2]) > 0;
  return has('public');
}

async function readAt(get: Get): Promise<{ readAt: string; cache: string }> {
  const res = await get('/experiment/data.json');
  if (res.status !== 200) throw new Error(`data.json status ${res.status}`);
  const body = (await res.json()) as { readAt?: unknown };
  if (typeof body.readAt !== 'string' || Number.isNaN(Date.parse(body.readAt))) throw new Error('data.json has no readAt');
  return { readAt: body.readAt, cache: res.headers.get('x-vercel-cache') ?? res.headers.get('x-nextjs-cache') ?? '(none)' };
}

type PageSeen = { status: number; age: number | null; cache: string };

/** A copy made from the ISR entry: only these cache statuses make its `age` the entry's age. */
const ISR_CACHE_STATUSES = ['HIT', 'REVALIDATED'];

/**
 * After the revalidation window, each group's page must regenerate. The proxy is what could stop it
 * (a revalidation request rewritten to the 404), so this reads the group pages through `/`, the way
 * visitors do: GETs of `/` until each group has been seen at least twice, every one a 200, and each
 * group with a response whose `age` is under the window and whose `x-vercel-cache` is HIT or
 * REVALIDATED (a copy of the ISR entry made after the wait). A MISS or PRERENDER copy can carry a
 * fresh age without the entry having regenerated, so it does not count. A stale copy that never
 * resets, or a 404, fails.
 */
async function pagesRegenerate(get: Get, deps: CheckDeps): Promise<Result> {
  const seen: Record<'a' | 'b', PageSeen[]> = { a: [], b: [] };
  const fresh = (arm: 'a' | 'b') =>
    seen[arm].some((p) => p.age !== null && p.age < REVALIDATE_SECONDS && ISR_CACHE_STATUSES.includes(p.cache.toUpperCase()));
  const done = () => (['a', 'b'] as const).every((arm) => seen[arm].length >= 2 && fresh(arm));
  for (let i = 0; i < ISR_PAGE_REQUESTS && !done(); i++) {
    const res = await get('/', { headers: { 'user-agent': CHROME } });
    await res.arrayBuffer();
    if (res.status !== 200) return { ok: false, detail: `/ answered ${res.status} after the wait (a group page may have been replaced by the 404)` };
    const arm = res.headers.get('x-arm');
    if (arm !== 'a' && arm !== 'b') return { ok: false, detail: 'a response of / had no x-arm' };
    const age = res.headers.get('age');
    seen[arm].push({ status: res.status, age: age !== null && /^\d+$/.test(age.trim()) ? Number(age) : null, cache: res.headers.get('x-vercel-cache') ?? '(none)' });
    if (i > 0 && i % 4 === 0) await deps.sleep(2_000);
  }
  const summary = (arm: 'a' | 'b') => `${arm}: ${seen[arm].map((p) => `${p.cache}/${p.age ?? '-'}`).join(' ') || 'never seen'}`;
  const detail = `cache/age ${summary('a')}; ${summary('b')}`;
  const stuck = (['a', 'b'] as const).filter((arm) => !fresh(arm) || seen[arm].length < 2);
  if (stuck.length > 0) {
    return { ok: false, detail: `group ${stuck.join(' and ')} never served a copy younger than ${REVALIDATE_SECONDS} s from the ISR cache (HIT or REVALIDATED): its page did not regenerate (is the proxy matching the revalidation request?) (${detail})` };
  }
  return { ok: true, detail };
}

/**
 * Before the wait, both group pages are requested through `/` at least once, so each has a cached
 * copy in this region whose regeneration the check can then see. Fails if a group never appears.
 */
async function bothGroupsSeen(get: Get): Promise<Result> {
  const seen = { a: 0, b: 0 };
  for (let i = 0; i < ISR_PAGE_REQUESTS && (seen.a === 0 || seen.b === 0); i++) {
    const res = await get('/', { headers: { 'user-agent': CHROME } });
    await res.arrayBuffer();
    const arm = res.headers.get('x-arm');
    if (arm === 'a' || arm === 'b') seen[arm] += 1;
  }
  const missing = (['a', 'b'] as const).filter((arm) => seen[arm] === 0);
  if (missing.length > 0) return { ok: false, detail: `before the wait, group ${missing.join(' and ')} never appeared in ${ISR_PAGE_REQUESTS} requests of / (a 50/50 draw should show both)` };
  return { ok: true, detail: `before the wait: a ${seen.a}, b ${seen.b}` };
}

async function isr(get: Get, deps: CheckDeps): Promise<Result> {
  const direct = await get('/v/a');
  await direct.arrayBuffer();
  if (direct.status !== 404) return { ok: false, detail: `a direct /v/a answered ${direct.status}, not 404` };
  const warm = await bothGroupsSeen(get);
  if (!warm.ok) return warm;
  const first = await readAt(get);
  deps.out(`isr: waiting ${ISR_WAIT_MS / 1000} s for the 300 s revalidation window`);
  await deps.sleep(ISR_WAIT_MS);
  const pages = await pagesRegenerate(get, deps);
  if (!pages.ok) return pages;
  // A second signal: data.json, which the proxy never matches, regenerates too. The first read after
  // the window serves the stale file and starts the regeneration.
  await readAt(get);
  for (let attempt = 0; attempt < ISR_RETRIES; attempt++) {
    const next = await readAt(get);
    if (Date.parse(next.readAt) > Date.parse(first.readAt)) {
      return { ok: true, detail: `pages ${pages.detail}; data.json readAt ${first.readAt} then ${next.readAt} (cache ${next.cache}); /v/a is 404` };
    }
    await deps.sleep(5_000);
  }
  return { ok: false, detail: `data.json readAt stayed at ${first.readAt}: its regeneration did not run (pages ${pages.detail})` };
}

// The policy itself is checked for its two key directives below.
const SECURITY_HEADERS: [string, RegExp][] = [
  ['x-content-type-options', /^nosniff$/],
  ['referrer-policy', /^strict-origin-when-cross-origin$/],
  ['permissions-policy', /geolocation=\(\)/],
  ['cross-origin-opener-policy', /^same-origin$/],
  ['strict-transport-security', /max-age=[1-9]\d*/],
];

async function headers(get: Get): Promise<Result> {
  const res = await get('/', { headers: { 'user-agent': CHROME } });
  await res.arrayBuffer();
  const missing = SECURITY_HEADERS.filter(([name, pattern]) => !pattern.test(res.headers.get(name) ?? '')).map(([name]) => name);
  const csp = res.headers.get('content-security-policy') ?? '';
  if (!csp.includes("connect-src 'self'") || !csp.includes("frame-ancestors 'none'")) missing.push('content-security-policy');
  const where = res.headers.get('x-vercel-id');
  const region = where === null ? '' : `; x-vercel-id region ${where.split('::').slice(0, -1).join('::') || where}`;
  if (missing.length > 0) return { ok: false, detail: `missing or wrong: ${[...new Set(missing)].join(', ')}${region}` };
  return { ok: true, detail: `all present${region}` };
}

/** One event batch that can never count: a later item of a view with no entry. */
async function orphanBatch(get: Get, origin: string, ns: string, address?: string): Promise<Response> {
  const body = JSON.stringify({ v: 1, ns, pv: randomUUID(), arm: 'a', events: [{ type: 'inview' }] });
  const extra: Record<string, string> = address === undefined ? {} : { 'x-forwarded-for': address, 'x-real-ip': address };
  return get('/api/e', { method: 'POST', body, headers: { 'content-type': 'text/plain', origin, 'user-agent': CHROME, ...extra } });
}

async function namespace(get: Get): Promise<string> {
  const body = (await (await get('/experiment/data.json')).json()) as { namespace?: unknown };
  if (typeof body.namespace !== 'string') throw new Error('data.json has no namespace');
  return body.namespace;
}

async function spoof(get: Get, origin: string, deps: CheckDeps): Promise<Result> {
  const ns = await namespace(get);
  // All 31 inside one rate-limit minute.
  const second = Math.floor(deps.now() / 1000) % 60;
  if (second > 40) await deps.sleep((60 - second + 1) * 1000);
  const statuses: number[] = [];
  for (let i = 0; i <= RATE_LIMIT; i++) {
    const res = await orphanBatch(get, origin, ns, `203.0.113.${(i % 250) + 1}`);
    await res.arrayBuffer();
    statuses.push(res.status);
  }
  const limitedEarly = statuses.slice(0, RATE_LIMIT).filter((s) => s === 429).length;
  const last = statuses[RATE_LIMIT];
  const detail = `statuses ${[...new Set(statuses)].join(', ')}; 429 among the first 30: ${limitedEarly}; the 31st: ${last}`;
  if (last !== 429) return { ok: false, detail: `${detail} (a rotated x-real-ip or x-forwarded-for escaped the limit, or the route refused before it)` };
  return { ok: true, detail };
}

async function pause(get: Get, origin: string, deps: CheckDeps): Promise<Result> {
  const ns = await namespace(get);
  for (let waited = 0; waited <= PAUSE_WITHIN_MS; waited += PAUSE_POLL_MS) {
    const res = await orphanBatch(get, origin, ns);
    const body = (res.headers.get('content-type') ?? '').includes('json') ? ((await res.json()) as { ok?: boolean; reason?: string }) : null;
    if (body?.ok === false && body.reason === 'paused') return { ok: true, detail: `paused after about ${waited / 1000} s` };
    await deps.sleep(PAUSE_POLL_MS);
  }
  return { ok: false, detail: `not paused within ${PAUSE_WITHIN_MS / 1000} s (is the flag set?)` };
}

function usage(out: (line: string) => void, message: string): number {
  out(`preview-check: ${message}`);
  out('usage: npm run experiment:preview-check -- <deploymentUrl> [--only split,isr,headers,spoof,pause]');
  return 2;
}

export async function main(argv: string[], partial: Partial<CheckDeps> = {}): Promise<number> {
  const deps: CheckDeps = { ...defaults, ...partial };
  const [target, flag, list] = argv;
  let base: URL;
  try {
    base = new URL(target ?? '');
  } catch {
    return usage(deps.out, 'a deployment URL is required');
  }
  if (base.protocol !== 'https:' && base.protocol !== 'http:') return usage(deps.out, 'the URL must be http or https');
  let checks = DEFAULT_CHECKS;
  if (flag !== undefined) {
    if (flag !== '--only' || list === undefined) return usage(deps.out, `unknown argument ${flag}`);
    const named = list.split(',');
    if (!named.every((c): c is Check => (CHECKS as readonly string[]).includes(c))) return usage(deps.out, 'unknown check name');
    checks = named as Check[];
  }

  const given = deps.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  // The secret goes only over https, or to this machine (the tests' fake server is plain http).
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  const safeChannel = base.protocol === 'https:' || loopback;
  if (given === undefined || given === '') deps.out('preview-check: VERCEL_AUTOMATION_BYPASS_SECRET is not set; a protected deployment will answer 401');
  else if (!safeChannel) deps.out('preview-check: not sending the bypass secret over plain http to another host; use the https URL');
  const secret = safeChannel ? given : undefined;
  // Never follows a redirect: fetch keeps custom headers on a redirect to another host, and the
  // bypass secret must reach only the deployment. A redirect is a failure of the check.
  const get: Get = async (path, init = {}) => {
    const h = new Headers(init.headers);
    if (secret) h.set('x-vercel-protection-bypass', secret);
    const res = await deps.fetch(new URL(path, base), { ...init, headers: h, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      await res.arrayBuffer().catch(() => {});
      throw new Error(`${path} redirected (${res.status}); run the check against the URL it points to`);
    }
    return res;
  };

  let failed = false;
  for (const check of checks) {
    let result: Result;
    try {
      result =
        check === 'split'
          ? await split(get)
          : check === 'isr'
            ? await isr(get, deps)
            : check === 'headers'
              ? await headers(get)
              : check === 'spoof'
                ? await spoof(get, base.origin, deps)
                : await pause(get, base.origin, deps);
    } catch (e) {
      // A message from fetch can name the host but never the secret, which is only a header value.
      result = { ok: false, detail: e instanceof Error ? e.message : 'error' };
    }
    const line = `${check}: ${result.ok ? 'PASS' : 'FAIL'} (${result.detail})`;
    deps.out(given ? line.split(given).join('[secret]') : line);
    failed ||= !result.ok;
  }
  return failed ? 1 : 0;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    () => process.exit(1),
  );
}
