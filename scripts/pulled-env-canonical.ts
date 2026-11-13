// Gives the production build its canonical host from the owner's declared CANONICAL_HOST, right after
// `vercel pull --environment=production` and before the pulled environment is checked:
//
//   CANONICAL_HOST=<bare hostname> node scripts/pulled-env-canonical.ts .vercel/.env.production.local
//
// A production build takes its canonical origin from VERCEL_PROJECT_PRODUCTION_URL
// (src/lib/seo/metadata.ts canonicalOrigin), but the file the CLI pulls (CLI 62.2.0) does not carry
// that variable, at least before the project's first production deployment; Vercel sets it on its own
// build machines only. So:
// - CANONICAL_HOST must be a bare hostname (src/lib/seo/hostname.ts, the rule the build itself applies)
//   and not a .invalid test host;
// - when the pulled file has no VERCEL_PROJECT_PRODUCTION_URL, or an empty one, it appends
//   VERCEL_PROJECT_PRODUCTION_URL="<CANONICAL_HOST in lower case>" and leaves every existing byte as it
//   was (a newline is added first only when the file does not end with one);
// - when the file has one that differs from CANONICAL_HOST (letter case aside; spaces inside its
//   quotes count as a difference, because the build reads the value as it is), it fails and changes
//   nothing: Vercel and the owner disagree on the canonical host, so nothing is built or deployed;
// - after appending, it reads the file back and fails if the variable is still not the host (a file
//   that ends inside an unclosed quote would swallow the appended line).
// The file is read as dotenv reads it, with Node's util.parseEnv (as scripts/pulled-env-check.ts does).
// The CLI's build loads it with dotenv, where the last of two lines for one name wins, so an appended
// line overrides an empty one.
//
// It reads CANONICAL_HOST from the environment, never from an argument, and prints the variable names
// and what it did, never a value. Exits 0 when the file names the canonical host (filled or already
// equal), 1 on a missing or malformed CANONICAL_HOST, a missing file or a mismatch, 2 on bad arguments.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseEnv } from 'node:util';
import { bareHostname } from '../src/lib/seo/hostname.ts';

export const NAME = 'VERCEL_PROJECT_PRODUCTION_URL';

export type Decision =
  | { kind: 'fill'; append: string }
  | { kind: 'equal' }
  | { kind: 'mismatch' };

/**
 * What to do with a pulled dotenv file, given the canonical host (already a lower-case bare hostname):
 * append a line, leave it (the file already names that host), or refuse (it names another one).
 */
export function decide(text: string, host: string): Decision {
  const pulled = parseEnv(text)[NAME];
  if (pulled === undefined || pulled.trim() === '') {
    const separator = text === '' || text.endsWith('\n') ? '' : '\n';
    return { kind: 'fill', append: `${separator}${NAME}="${host}"\n` };
  }
  // No trim here: the build reads the value as it is, so a padded one is not the canonical host.
  return pulled.toLowerCase() === host ? { kind: 'equal' } : { kind: 'mismatch' };
}

type Out = { log: (line: string) => void; error: (line: string) => void };

export function main(argv: readonly string[], env: NodeJS.ProcessEnv = process.env, out: Out = console): number {
  if (argv.length !== 1) {
    out.error('usage: CANONICAL_HOST=<bare hostname> node scripts/pulled-env-canonical.ts <pulled env file, such as .vercel/.env.production.local>');
    return 2;
  }
  const raw = env.CANONICAL_HOST ?? '';
  if (raw === '') {
    out.error('::error::LAUNCHED is true but the repository variable CANONICAL_HOST is empty; nothing is deployed.');
    return 1;
  }
  const host = bareHostname(raw);
  if (host === undefined) {
    out.error(
      '::error::The repository variable CANONICAL_HOST is not a bare hostname: it must be two or more dot-separated labels of letters, digits and inner hyphens, with no scheme, slash, port, user or whitespace; nothing is deployed.',
    );
    return 1;
  }
  if (host.endsWith('.invalid')) {
    out.error('::error::The repository variable CANONICAL_HOST is a .invalid test host; nothing is deployed.');
    return 1;
  }
  const file = argv[0]!;
  if (!existsSync(file)) {
    out.error(`::error::The pulled environment file ${basename(file)} is missing; nothing is built or deployed.`);
    return 1;
  }
  const decision = decide(readFileSync(file, 'utf8'), host);
  if (decision.kind === 'mismatch') {
    out.error(
      `::error::The pulled ${NAME} differs from the repository variable CANONICAL_HOST; Vercel's production domain is not the declared canonical domain, so nothing is built or deployed.`,
    );
    return 1;
  }
  if (decision.kind === 'equal') {
    out.log(`${NAME}: already equal to CANONICAL_HOST, file unchanged`);
    return 0;
  }
  appendFileSync(file, decision.append);
  // Read it back as the build will: a file that ends inside an unclosed quote swallows the new line.
  if (parseEnv(readFileSync(file, 'utf8'))[NAME] !== host) {
    out.error(`::error::The pulled environment file ${basename(file)} could not take ${NAME} (it does not parse as a dotenv file); nothing is built or deployed.`);
    return 1;
  }
  out.log(`${NAME}: missing or empty in the pulled file, set from CANONICAL_HOST`);
  return 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
