// Prints the SHA-256 of the pre-registered design: the experiment configuration (without the two
// `startedOn` dates, which are facts set at launch and at the A/B switch), the mixing variances
// and the treatment headlines, as canonical JSON (sorted keys, no whitespace).
// Run it with `npm run prereg:hash`; docs/experiment/prereg.md carries the value.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { HEADLINES } from '../content/experiment/headlines.ts';
import { EXPERIMENT, TAU2 } from '../src/experiment.config.ts';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** JSON with object keys sorted at every depth and no whitespace. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

type Design = { experiment: unknown; tau2: unknown; headlines: unknown };

function withoutStartDates(experiment: unknown): Json {
  const copy = structuredClone(experiment) as { calibration: Record<string, Json>; ab: Record<string, Json> } & Json;
  delete copy.calibration.startedOn;
  delete copy.ab.startedOn;
  return copy;
}

/** The hash of the design. The argument exists so tests can hash a modified copy. */
export function preregHash(design: Design = { experiment: EXPERIMENT, tau2: TAU2, headlines: HEADLINES }): string {
  const canonical = canonicalJson({
    EXPERIMENT: withoutStartDates(design.experiment),
    TAU2: design.tau2,
    HEADLINES: design.headlines,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(preregHash());
}
