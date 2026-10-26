// The launch gate of the live experiment: it names every launch condition that is not met, and exits
// 1 while any is. It is NOT part of `npm run check` or CI (before launch it fails by design); run it
// by hand before the launch commit and before promoting the deployment that starts the experiment.
//
//   npm run build && npm run launch:check
//
// Conditions:
// - the calibration start (EXPERIMENT.calibration.startedOn) is set;
// - every provider fact the privacy page states is verified (content/privacy.ts, LAUNCH_FACTS), and
//   no built page carries a launch placeholder;
// - the deployed checks (docs/experiment/deployed-checks.md, the log table) are recorded as PASS;
// - the secrets exist, by name: in Vercel's production environment and in the GitHub repository;
// - the prereg-v1 tag exists and its pre-registration hash is the design's current hash.
//
// It reads secret NAMES only: the Vercel CLI is never asked for JSON (which would include values),
// and no command output is printed. It needs `npx vercel login` and `gh auth login` on this machine.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LAUNCH_FACTS, type LaunchFact } from '../content/privacy.ts';
import { EXPERIMENT, type ExperimentConfig } from '../src/experiment.values.ts';
import { preregHash } from '../src/lib/experiment/prereg-hash.ts';
import { builtPages, findPlaceholders } from './launch-placeholders.ts';

export const VERCEL_SCOPE = 'mahmoud-s-team';
export const VERCEL_PROJECT = 'portfolio';
export const GITHUB_REPO = 'MaHmOuDeB/portfolio';

/** Set in Vercel, Production only. The store and Edge Config ones come with their integrations. */
export const VERCEL_SECRETS = [
  'INTERNAL_TRAFFIC_SECRET',
  'EXCLUDE_TOKEN',
  'RATELIMIT_HMAC_KEY',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'KV_REST_API_READ_ONLY_TOKEN',
  'GLOBAL_CONFIG',
] as const;
/** Repository secrets the CI and deploy workflows use for the experiment. */
export const GITHUB_SECRETS = ['INTERNAL_TRAFFIC_SECRET', 'VERCEL_AUTOMATION_BYPASS_SECRET'] as const;
/** Rows of the deployed-checks log that must read PASS before launch. */
export const REQUIRED_LOG_CHECKS = ['split', 'isr', 'headers', 'firewall', 'domains'] as const;
const PREREG_TAG = EXPERIMENT.prereg.tag;

export type RunResult = { status: number | null; stdout: string };
export type LaunchDeps = {
  root: string;
  out: (line: string) => void;
  run: (cmd: string, args: string[]) => RunResult;
  config: ExperimentConfig;
  facts: readonly LaunchFact[];
  /** The text of docs/experiment/deployed-checks.md. */
  deployedChecksLog: string;
  preregHash: () => string;
};

function defaults(): LaunchDeps {
  const root = process.cwd();
  return {
    root,
    out: (l) => process.stdout.write(`${l}\n`),
    run: (cmd, args) => {
      const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120_000 });
      return { status: r.status, stdout: r.stdout ?? '' };
    },
    config: EXPERIMENT,
    facts: LAUNCH_FACTS,
    deployedChecksLog: readFileSync(join(root, 'docs/experiment/deployed-checks.md'), 'utf8'),
    preregHash: () => preregHash(),
  };
}

/** The checks recorded as PASS in the log table (Date | Deployment | Check | Result | Notes). */
export function passedChecks(log: string): Set<string> {
  const passed = new Set<string>();
  const at = log.indexOf('## Log');
  for (const line of (at === -1 ? '' : log.slice(at)).split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    // ['', date, deployment, check, result, notes, '']
    if (cells.length < 6) continue;
    const [, date, , check, result] = cells;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') && result?.toUpperCase() === 'PASS' && check) passed.add(check.replace(/`/g, '').toLowerCase());
  }
  return passed;
}

/** Upper-case variable names at the start of a table row. */
function names(stdout: string): Set<string> {
  return new Set([...stdout.matchAll(/^\s*([A-Z][A-Z0-9_]{2,})\b/gm)].map((m) => m[1]!));
}

export function main(_argv: string[], partial: Partial<LaunchDeps> = {}): number {
  const d: LaunchDeps = { ...defaults(), ...partial };
  const unmet: string[] = [];

  // The start.
  if (d.config.calibration.startedOn === null) unmet.push('the calibration start is not set (EXPERIMENT.calibration.startedOn in src/experiment.values.ts)');

  // The privacy page.
  for (const f of d.facts.filter((x) => x.verified === null)) unmet.push(`privacy fact not verified: ${f.id} (${f.question})`);
  const pages = builtPages(d.root);
  if (pages.length === 0) unmet.push('no built pages to scan for launch placeholders (run npm run build first)');
  for (const p of findPlaceholders(pages)) unmet.push(`launch placeholder in ${p.file.slice(d.root.length + 1)}: ${p.text}`);

  // The deployed checks.
  const passed = passedChecks(d.deployedChecksLog);
  for (const check of REQUIRED_LOG_CHECKS) {
    if (!passed.has(check)) unmet.push(`deployed check not recorded as passed: ${check} (docs/experiment/deployed-checks.md, Log)`);
  }

  // The secrets, by name.
  const vercel = d.run('npx', ['--no-install', 'vercel', 'env', 'ls', 'production', '--project', VERCEL_PROJECT, '--scope', VERCEL_SCOPE]);
  if (vercel.status !== 0) {
    unmet.push('could not list the Vercel production variables (run npx vercel login, then try again)');
  } else {
    const have = names(vercel.stdout);
    for (const name of VERCEL_SECRETS) if (!have.has(name)) unmet.push(`secret missing in Vercel production: ${name}`);
  }
  const github = d.run('gh', ['secret', 'list', '--repo', GITHUB_REPO]);
  if (github.status !== 0) {
    unmet.push('could not list the GitHub secrets (run gh auth login, then try again)');
  } else {
    const have = names(github.stdout);
    for (const name of GITHUB_SECRETS) if (!have.has(name)) unmet.push(`secret missing in GitHub: ${name}`);
  }

  // The pre-registration tag.
  const tag = d.run('git', ['rev-parse', '-q', '--verify', `refs/tags/${PREREG_TAG}`]);
  if (tag.status !== 0) {
    unmet.push(`the ${PREREG_TAG} tag does not exist (tag the merge commit that carries docs/experiment/prereg.md)`);
  } else {
    const tagged = d.run('git', ['show', `${PREREG_TAG}:docs/experiment/prereg.md`]);
    const hash = /Pre-registration hash: ([0-9a-f]{64})/.exec(tagged.stdout)?.[1];
    if (tagged.status !== 0 || hash === undefined) unmet.push(`${PREREG_TAG} has no pre-registration hash in docs/experiment/prereg.md`);
    else if (hash !== d.preregHash()) unmet.push(`the design changed since ${PREREG_TAG}: its hash is not the current one (a new version and tag are needed)`);
  }

  for (const line of unmet) d.out(`unmet: ${line}`);
  if (unmet.length > 0) {
    d.out(`launch:check: ${unmet.length} launch condition${unmet.length === 1 ? '' : 's'} not met`);
    return 1;
  }
  d.out('launch:check: all launch conditions met');
  return 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
