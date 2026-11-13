// The build metadata as the running site reads it: parsed from BUILD_META_JSON, which next.config.ts
// sets through `env` while the build loads its config, so Next writes the value into the build
// output and every regeneration of /experiment reuses it. Nothing here reads a file: on Vercel an
// ISR regeneration runs in a function where untraced public files may be missing. "null" (or no
// value) means the build had no metadata and no deploy signal, and the colophon says the results
// are added on deploy. Next documents `env` values as part of the JavaScript bundles, so only public
// metadata is ever embedded. Server only.
import 'server-only';
import { isBuildMeta, type BuildMeta } from './build-meta-shape';

export function readBuildMeta(): BuildMeta | null {
  // Written out in full so Next can replace it at build time.
  const raw = process.env.BUILD_META_JSON;
  if (raw === undefined || raw === '' || raw === 'null') return null;
  const value: unknown = JSON.parse(raw);
  if (!isBuildMeta(value)) throw new TypeError('the embedded build metadata is not valid');
  return value;
}
