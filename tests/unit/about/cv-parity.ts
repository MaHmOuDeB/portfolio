// The CV page and the CV PDF say the same things. The PDF's claims are read with the web CV checker
// (its --claims-out, after a passing check); the page's claims are the elements marked
// data-cv-claim. Each page claim must equal exactly one PDF claim. The only differences allowed are
// figures the page leaves out because the site has no sourced fact for them; each is listed, with
// the PDF sentence it comes from and the exact fragments the page drops.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHECKER = join(import.meta.dirname, '../../../scripts/check-web-cv.py');

/** A PDF claim the page prints without a figure, or leaves out whole. */
export type Omission = {
  id: string;
  /** The PDF's sentence, figure included. */
  pdf: string;
  /** The fragments the page drops, each holding a figure; 'whole claim' when the page has no element for it. */
  omitted: readonly string[] | 'whole claim';
};

/** Whitespace collapsed, typographic apostrophes and quotes straightened. */
export const normalize = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const NUMERAL = /\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|hundred|thousand)\b/i;

/** The page text of an omission: the PDF sentence without its dropped fragments. */
export function withoutFigures(o: Omission): string | null {
  if (o.omitted === 'whole claim') return null;
  let s = normalize(o.pdf);
  for (const f of o.omitted) {
    const at = s.indexOf(f);
    if (at < 0) throw new Error(`cv-parity: "${f}" is not in the PDF text of ${o.id}`);
    s = s.slice(0, at) + s.slice(at + f.length);
  }
  return normalize(s);
}

/**
 * The problems with a page against a PDF: an empty list when every page claim equals exactly one PDF
 * claim, directly or through its listed omission, and every listed omission is in the PDF once.
 */
export function compareClaims(
  page: readonly { id: string; text: string }[],
  pdf: readonly string[],
  omissions: readonly Omission[],
): string[] {
  const problems: string[] = [];
  const pdfTexts = pdf.map(normalize);
  const count = (t: string) => pdfTexts.filter((p) => p === t).length;
  for (const o of omissions) {
    // A rate can drop in two pieces ("3+ ... per working day"); at least one of them holds the figure.
    if (o.omitted !== 'whole claim' && !o.omitted.some((f) => NUMERAL.test(f))) {
      problems.push(`${o.id}: no omitted fragment holds a figure`);
    }
    if (o.omitted === 'whole claim' && !NUMERAL.test(o.pdf)) problems.push(`${o.id}: the omitted claim holds no figure`);
  }
  const byId = new Map(omissions.map((o) => [o.id, o]));
  for (const c of page) {
    const text = normalize(c.text);
    const o = byId.get(c.id);
    if (o) {
      if (o.omitted === 'whole claim') problems.push(`${c.id}: listed as left out whole, but the page prints it`);
      else if (withoutFigures(o) !== text) problems.push(`${c.id}: the page text is not the PDF text without its listed figures`);
      else if (count(normalize(o.pdf)) !== 1) problems.push(`${c.id}: the PDF holds its sentence ${count(normalize(o.pdf))} times`);
    } else if (count(text) !== 1) {
      problems.push(`${c.id}: the PDF holds the page text ${count(text)} times`);
    }
  }
  for (const o of omissions) {
    if (o.omitted === 'whole claim' && count(normalize(o.pdf)) !== 1) {
      problems.push(`${o.id}: the PDF holds the left-out claim ${count(normalize(o.pdf))} times`);
    }
  }
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
