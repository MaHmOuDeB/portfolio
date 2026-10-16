import { readFileSync } from 'node:fs';

// Reads the deployment target out of `vercel inspect` output: the second whitespace-separated
// token of the first line whose first token is exactly `target` (e.g. "    target<TAB>preview").
// Returns null when there is no such line or it has no value, so callers can fail closed.
export function parseTarget(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const [key, value] = line.trim().split(/\s+/);
    if (key === 'target') return value ?? null;
  }
  return null;
}

function main(): void {
  process.stdout.write(`${parseTarget(readFileSync(0, 'utf8')) ?? ''}\n`);
}

if (import.meta.main) main();
