// Checks the environment `vercel pull --environment=production` wrote, before the production build:
//
//   node scripts/pulled-env-check.ts .vercel/.env.production.local
//
// A production build takes its canonical origin from VERCEL_ENV and VERCEL_PROJECT_PRODUCTION_URL
// (src/lib/seo/metadata.ts canonicalOrigin). `vercel build` loads the build's variables only from
// this file and sets no VERCEL_ENV of its own, so a pull without VERCEL_ENV="production" would build
// with the test origin and ship it on every page. It passes only when VERCEL_ENV is exactly
// "production" and VERCEL_PROJECT_PRODUCTION_URL is not empty; whether that host is the right one is
// checked on the built pages (npm run seo:origin-check, against the repository variable
// CANONICAL_HOST). The file is read as dotenv reads it (the CLI's build uses dotenv), with Node's
// util.parseEnv.
//
// It prints each variable's NAME with pass or fail, never a value. Exits 0 when both pass, 1 when
// either fails or the file is missing, 2 on bad arguments.
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseEnv } from 'node:util';

export const REQUIRED = ['VERCEL_ENV', 'VERCEL_PROJECT_PRODUCTION_URL'] as const;
type Required = (typeof REQUIRED)[number];

const WHY: Record<Required, string> = {
  VERCEL_ENV: 'missing or not "production"',
  VERCEL_PROJECT_PRODUCTION_URL: 'missing or empty',
};

/** Whether each required variable passes, from the text of a pulled dotenv file. */
export function checkPulledEnv(text: string): Record<Required, boolean> {
  const env = parseEnv(text);
  return {
    VERCEL_ENV: env.VERCEL_ENV === 'production',
    VERCEL_PROJECT_PRODUCTION_URL: (env.VERCEL_PROJECT_PRODUCTION_URL ?? '').trim() !== '',
  };
}

type Out = { log: (line: string) => void; error: (line: string) => void };

export function main(argv: readonly string[], out: Out = console): number {
  if (argv.length !== 1) {
    out.error('usage: node scripts/pulled-env-check.ts <pulled env file, such as .vercel/.env.production.local>');
    return 2;
  }
  const file = argv[0]!;
  if (!existsSync(file)) {
    out.error(`::error::The pulled environment file ${basename(file)} is missing; nothing is built or deployed.`);
    return 1;
  }
  const result = checkPulledEnv(readFileSync(file, 'utf8'));
  const failed = REQUIRED.filter((name) => !result[name]);
  for (const name of REQUIRED) out.log(result[name] ? `${name}: pass` : `${name}: fail (${WHY[name]})`);
  if (failed.length > 0) {
    out.error(
      `::error::The pulled production environment fails ${failed.join(', ')}; the canonical origin would be wrong, so nothing is built or deployed.`,
    );
    return 1;
  }
  out.log('pulled environment: pass');
  return 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
