// The CV page and the CV PDF say the same things. The PDF's claims are read with the web CV checker
// (its --claims-out, after a passing check); the page's claims are the elements marked
// data-cv-claim. The PDF may be shorter than the page: it holds a subset of the page's claims, each
// word for word and once. It never holds a claim the page does not, so a figure the page leaves out
// never reaches the PDF either.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHECKER = join(import.meta.dirname, '../../../scripts/check-web-cv.py');

/** Whitespace collapsed, typographic apostrophes and quotes straightened. */
export const normalize = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The problems with a PDF against a page: an empty list when every PDF claim equals exactly one page
 * claim and no page claim is printed twice. Page claims the PDF leaves out are not problems.
 */
export function compareClaims(page: readonly { id: string; text: string }[], pdf: readonly string[]): string[] {
  const problems: string[] = [];
  const used = new Map<string, number>();
  pdf.map(normalize).forEach((t, i) => {
    const matches = page.filter((c) => normalize(c.text) === t);
    if (matches.length !== 1) {
      problems.push(`PDF claim ${i + 1}: matches ${matches.length === 0 ? 'no page claim' : `${matches.length} page claims`}`);
      return;
    }
    const id = matches[0]!.id;
    used.set(id, (used.get(id) ?? 0) + 1);
  });
  for (const [id, n] of used) if (n > 1) problems.push(`${id}: the PDF holds the page text ${n} times`);
  return problems;
}

export type CheckerRun = { status: number | null; stderr: string; claims: string[] };

/**
 * Runs the web CV checker on a PDF and returns the claims it parsed. The deny-list given here only
 * satisfies the checker's requirement; the real list is checked by the CI step that holds it.
 */
export function pdfClaims(pdf: string, o: { manifest?: string; records?: string; meta?: string; denylist: string }): CheckerRun {
  const dir = mkdtempSync(join(tmpdir(), 'cv-parity-'));
  try {
    const out = join(dir, 'claims.json');
    const args = ['-I', CHECKER, pdf, '--claims-out', out];
    if (o.manifest) args.push('--manifest', o.manifest);
    if (o.records) args.push('--records', o.records);
    if (o.meta) args.push('--meta', o.meta);
    const r = spawnSync('python3', args, {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, TRUTH_DENYLIST: o.denylist } as unknown as NodeJS.ProcessEnv,
    });
    let claims: string[] = [];
    if (r.status === 0) {
      const parsed = JSON.parse(readFileSync(out, 'utf8')) as { claims: { normalizedClaim: string }[] };
      claims = parsed.claims.map((c) => c.normalizedClaim);
    }
    return { status: r.status, stderr: r.stderr, claims };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
