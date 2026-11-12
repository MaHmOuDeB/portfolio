// What next.config.ts embeds as BUILD_META_JSON while the build loads its config. Pure: the caller
// passes the environment and a file reader.
//
// - public/build-meta.json present and valid: its JSON.
// - present but empty, malformed or not build metadata: throw, so the build fails.
// - absent, with no deploy signal (neither VERCEL nor VERCEL_ENV set): "null". Every local, CI and
//   e2e `next build` is this case, and the colophon then says the results are added on deploy.
// - absent on a deploy build (VERCEL or VERCEL_ENV set, as `vercel build` sets them): throw. The
//   deploy writes the file with `npm run build:meta` before `vercel build`, so its absence there is
//   a broken deploy, never a reason to print nothing.
import { isBuildMeta } from '../src/lib/live-page/build-meta-shape.ts';

export const BUILD_META_PATH = 'public/build-meta.json';

type Env = Readonly<Record<string, string | undefined>>;
type ReadFile = (path: string, encoding: 'utf8') => string;

const set = (v: string | undefined) => v !== undefined && v !== '';

export function embeddedBuildMeta(env: Env, readFile: ReadFile): string {
  let raw: string;
  try {
    raw = readFile(BUILD_META_PATH, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException | null)?.code !== 'ENOENT') throw e;
    if (set(env.VERCEL) || set(env.VERCEL_ENV)) {
      throw new Error(`build-meta: ${BUILD_META_PATH} is missing on a deploy build; run npm run build:meta first`);
    }
    return 'null';
  }
  if (raw.trim() === '') throw new Error(`build-meta: ${BUILD_META_PATH} is empty`);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`build-meta: ${BUILD_META_PATH} is not valid JSON`);
  }
  if (!isBuildMeta(value)) throw new Error(`build-meta: ${BUILD_META_PATH} is not valid build metadata`);
  return JSON.stringify(value);
}
