// Operational checks of the live experiment. Neither mode writes anything, and neither prints a
// secret, a host or a stored value.
//
//   npm run experiment:check -- --url https://<site>
//     Reads <site>/experiment/data.json (public, no credential) and prints the phase, the funnel's
//     exclusions, the split checks, the calibration check, the decision and whether the analysis is
//     closed.
//
//   node --env-file=.env.production.local --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/experiment-check.ts --storage
//     Reads KV_REST_API_URL, KV_REST_API_READ_ONLY_TOKEN and GLOBAL_CONFIG from the environment and
//     prints only "redis: ok (<n> fields in exp:<ns>)" and "edge config: ok (item experiment:
//     missing|valid|malformed)". It proves the read-only token and the Edge Config connection string
//     work. A failure prints a category, never the cause (which can carry the URL or a token).
//
// Exit code: 0 when it could read everything, 1 when a read failed or a variable is missing, 2 for a
// usage error.
import { createClient } from '@vercel/edge-config';
import { EXPERIMENT } from '../src/experiment.values.ts';
import { parseFlags } from '../src/lib/experiment/flags.ts';
import { keys } from '../src/lib/experiment/keys.ts';
import { createRedisRest } from '../src/lib/experiment/redis-rest.ts';

export type ExperimentCheckDeps = {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  /** Used for every request; the Edge Config SDK reads the global fetch, so it is swapped in for its call. */
  fetch?: typeof fetch;
};

type Cell = number | string;
type Srm = { chi2: number | null; flagged: boolean } | null;
type Data = {
  configPhase?: string;
  status?: string;
  source?: string;
  unavailable?: string | null;
  funnel?: { excluded?: Record<string, Cell> };
  srm?: { assignment?: Srm; analysed?: Srm; firstFlaggedOn?: string | null };
  calibration?: { days: number; srmPassed: boolean; intervalContainsZero: boolean; ready: boolean; failed: boolean } | null;
  decision?: string | null;
  decidedOn?: string | null;
  frozenAt?: string | null;
  held?: { reason: string; on: string } | null;
  ceilingDays?: string[];
};

const yes = (b: boolean) => (b ? 'yes' : 'no');

function srmLine(name: string, s: Srm | undefined): string {
  if (s === null || s === undefined) return `${name} not yet`;
  return `${name} ${s.flagged ? 'flagged' : 'passed'} (chi2 ${s.chi2 === null ? 'withheld' : s.chi2})`;
}

/** The published data, summarised; every line names its field. */
export function summarise(d: Data): string[] {
  const placeholder = d.unavailable ? `, ${d.unavailable}` : '';
  const excluded = Object.entries(d.funnel?.excluded ?? {})
    .map(([reason, n]) => `${reason} ${n}`)
    .join(', ');
  const c = d.calibration;
  const closedBy = [d.frozenAt ? `frozen at ${d.frozenAt}` : 'not frozen', d.held ? `held since ${d.held.on} (${d.held.reason})` : 'not held'];
  const closed = d.frozenAt !== null && d.frozenAt !== undefined;
  return [
    `phase: ${d.configPhase} (status ${d.status}, source ${d.source}${placeholder})`,
    `funnel excluded: ${excluded || 'none'}`,
    `srm: ${srmLine('assignment', d.srm?.assignment)}, ${srmLine('analysed', d.srm?.analysed)}, first flagged on ${d.srm?.firstFlaggedOn ?? 'none'}`,
    c === null || c === undefined
      ? 'calibration: none yet'
      : `calibration: ${c.ready ? 'ready' : 'not ready'}, days ${c.days}, srm passed ${yes(c.srmPassed)}, interval contains 0 ${yes(c.intervalContainsZero)}, failed ${yes(c.failed)}`,
    `decision: ${d.decision ?? 'none'}${d.decidedOn ? ` (on ${d.decidedOn})` : ''}`,
    `closed: ${closed ? 'yes' : 'no'} (${closedBy.join(', ')}, ceiling days ${d.ceilingDays?.length ? d.ceilingDays.join(' ') : 'none'})`,
  ];
}

async function checkUrl(origin: string, deps: ExperimentCheckDeps): Promise<number> {
  const f = deps.fetch ?? fetch;
  let res: Response;
  try {
    res = await f(new URL('/experiment/data.json', origin), { redirect: 'error' });
  } catch {
    deps.out('data.json: failed (network)');
    return 1;
  }
  if (res.status !== 200) {
    deps.out(`data.json: failed (status ${res.status})`);
    return 1;
  }
  let data: Data;
  try {
    data = (await res.json()) as Data;
  } catch {
    deps.out('data.json: failed (not JSON)');
    return 1;
  }
  for (const line of summarise(data)) deps.out(line);
  return 0;
}

async function withGlobalFetch<T>(f: typeof fetch | undefined, run: () => Promise<T>): Promise<T> {
  if (f === undefined) return run();
  const original = globalThis.fetch;
  globalThis.fetch = f;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

async function checkStorage(deps: ExperimentCheckDeps): Promise<number> {
  const required = ['KV_REST_API_URL', 'KV_REST_API_READ_ONLY_TOKEN', 'GLOBAL_CONFIG'];
  const missing = required.filter((name) => !deps.env[name]);
  if (missing.length > 0) {
    deps.out(`storage: missing ${missing.join(', ')}`);
    return 1;
  }
  let failed = false;
  const ns = EXPERIMENT.namespace;
  try {
    const redis = createRedisRest({ url: deps.env.KV_REST_API_URL!, token: deps.env.KV_REST_API_READ_ONLY_TOKEN!, fetch: deps.fetch });
    const fields = await redis.command(['HLEN', keys.counters(ns)]);
    deps.out(`redis: ok (${typeof fields === 'number' ? fields : '?'} fields in ${keys.counters(ns)})`);
  } catch {
    deps.out('redis: failed (could not read with the read-only token)');
    failed = true;
  }
  try {
    const item = await withGlobalFetch(deps.fetch, () => createClient(deps.env.GLOBAL_CONFIG!).get('experiment'));
    const state = item === undefined ? 'missing' : parseFlags(item).malformed ? 'malformed' : 'valid';
    deps.out(`edge config: ok (item experiment: ${state})`);
  } catch {
    deps.out('edge config: failed (could not read with the connection string)');
    failed = true;
  }
  return failed ? 1 : 0;
}

function usage(out: (line: string) => void): number {
  out('usage: experiment-check --url <origin> | --storage');
  return 2;
}

export async function main(argv: string[], partial: Partial<ExperimentCheckDeps> = {}): Promise<number> {
  const deps: ExperimentCheckDeps = { env: process.env, out: (l) => process.stdout.write(`${l}\n`), ...partial };
  const [mode, value] = argv;
  if (mode === '--url') {
    if (value === undefined) return usage(deps.out);
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return usage(deps.out);
    } catch {
      return usage(deps.out);
    }
    return checkUrl(value, deps);
  }
  if (mode === '--storage') return checkStorage(deps);
  return usage(deps.out);
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    () => process.exit(1),
  );
}
