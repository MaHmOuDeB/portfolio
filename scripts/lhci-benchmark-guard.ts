import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The benchmark guard of the self-hosted Lighthouse run (scripts/lhci-calibrated.sh). Lighthouse's
// simulated throttling multiplies every main-thread task it measured by the CPU multiplier, so the
// multiplier only reproduces GitHub's hosted runner while this machine is as fast as when it was
// calibrated: benchmark index 837.5 (Lighthouse's own speed score, median of 5 runs in the capped
// lhci job container). A run whose median index is more than 20% away from that measured on a
// busier (or idler) machine than the calibration, and its scores do not compare.
//
//   node scripts/lhci-benchmark-guard.ts <folder of lhr-*.json>
//
// prints the median benchmark index ("none" without results) and exits 0 inside the band, 1
// outside it, 2 without results.
export const REFERENCE_BENCHMARK_INDEX = 837.5;
export const TOLERANCE = 0.2;
export const BENCHMARK_BAND: readonly [number, number] = [
  Math.round(REFERENCE_BENCHMARK_INDEX * (1 - TOLERANCE)),
  Math.round(REFERENCE_BENCHMARK_INDEX * (1 + TOLERANCE)),
];

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The benchmark index of every Lighthouse result (lhr-*.json) in a folder. */
export function benchmarkIndexes(dir: string): number[] {
  return readdirSync(dir)
    .filter((f) => /^lhr-.*\.json$/.test(f))
    .map((f) => (JSON.parse(readFileSync(join(dir, f), 'utf8')) as { environment?: { benchmarkIndex?: unknown } }).environment?.benchmarkIndex)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

export function verdict(dir: string): { median: number | null; inBand: boolean } {
  const m = median(benchmarkIndexes(dir));
  return { median: m, inBand: m !== null && m >= BENCHMARK_BAND[0] && m <= BENCHMARK_BAND[1] };
}

function main(): number {
  const v = verdict(process.argv[2] ?? '.lighthouseci');
  process.stdout.write(`${v.median ?? 'none'}\n`);
  if (v.median === null) return 2;
  return v.inBand ? 0 : 1;
}

if (import.meta.main) process.exitCode = main();
