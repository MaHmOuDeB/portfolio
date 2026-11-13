// The CV PDF text check (used by tests/unit/remaining/cv-pdf-text.test.ts): pdftotext's text, its
// bullets joined across wrapped lines, and `cvPdfText`, which runs the web CV checker in full mode and
// the site-wide claim rules over one PDF. A module of its own so that a later CI step can import it
// without registering the test suites.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimFindings } from '../../e2e/site-claims.ts';

export const ROOT = join(import.meta.dirname, '../../..');
const CHECKER = join(ROOT, 'scripts/check-web-cv.py');
export const LAYOUT = join(ROOT, 'scripts/cv/claim-layout.json');
export const ALLOW_LIST = join(ROOT, 'scripts/cv/numeral-allowlist.json');

// ───────────────────────────── cvPdfText ─────────────────────────────

/** The text pdftotext extracts, in layout mode; throws when the tool is missing or fails. */
export function pdfText(pdf: string, env: NodeJS.ProcessEnv = process.env): string {
  const r = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8', env });
  if (r.error) throw new Error(`pdftotext could not run: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`pdftotext failed on the PDF (exit ${r.status})`);
  return r.stdout;
}

type Records = { entries: { bindingId: string; claimId?: string; factId?: string }[] };
type Options = { manifest?: string; records?: string; denylist?: string | undefined; path?: string };

/** The bullets of a page's text, each joined across its wrapped lines. */
export function bullets(text: string): { page: number; line: number; text: string }[] {
  const out: { page: number; line: number; text: string }[] = [];
  text.split('\f').forEach((page, pi) => {
    let cur: { page: number; line: number; text: string; indent: number } | null = null;
    page.split('\n').forEach((raw, li) => {
      const m = /^(\s*)[•◦▪●‣∙]\s+(.*)$/.exec(raw);
      if (m) {
        if (cur) out.push(cur);
        cur = { page: pi + 1, line: li + 1, text: m[2]!, indent: m[1]!.length };
      } else if (cur && raw.trim() && raw.length - raw.trimStart().length > cur.indent) {
        cur.text += ` ${raw.trim()}`;
      } else {
        if (cur) out.push(cur);
        cur = null;
      }
    });
    if (cur) out.push(cur);
  });
  return out;
}

/**
 * Every finding over one CV PDF: the checker's (by rule and place, never the matched text), then
 * the claim rules on each parsed claim and each bullet (by rule and place). Empty when it passes.
 * Throws when a tool is missing (pdftotext or python3); a PDF pdftotext cannot read is a finding.
 */
export function cvPdfText(pdf: string, o: Options = {}): string[] {
  const env: NodeJS.ProcessEnv = { PATH: o.path ?? process.env.PATH, ...(o.denylist === undefined ? {} : { TRUTH_DENYLIST: o.denylist }) } as unknown as NodeJS.ProcessEnv;
  const findings: string[] = [];
  let text = '';
  if (existsSync(pdf)) {
    try {
      text = pdfText(pdf, env);
    } catch (e) {
      if (/could not run/.test((e as Error).message)) throw e;
      findings.push(`pdftotext: ${(e as Error).message}`);
    }
  }
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cv-pdf-claims-')));
  const claimsOut = join(dir, 'claims.json');
  const manifest = o.manifest ?? LAYOUT;
  const records = o.records ?? ALLOW_LIST;
  const r = spawnSync('python3', ['-I', CHECKER, pdf, '--manifest', manifest, '--records', records, '--claims-out', claimsOut], {
    encoding: 'utf8',
    env,
    cwd: ROOT,
  });
  if (r.error) throw new Error(`python3 could not run: ${r.error.message}`);
  if (r.status !== 0) findings.push(`checker: exit ${r.status}`, ...r.stderr.split('\n').filter(Boolean).map((l) => `checker: ${l}`));
  const facts = (id: string) =>
    (JSON.parse(readFileSync(records, 'utf8')) as Records).entries.filter((e) => e.claimId === id || (!e.claimId && e.bindingId === id)).flatMap((e) => (e.factId ? [e.factId] : []));
  if (existsSync(claimsOut)) {
    const parsed = JSON.parse(readFileSync(claimsOut, 'utf8')) as { claims: { id: string; normalizedClaim: string }[] };
    for (const c of parsed.claims) for (const f of claimFindings(c.normalizedClaim, `claim ${c.id}`, facts(c.id))) findings.push(`${f.where}: ${f.rule}`);
  }
  for (const b of bullets(text)) for (const f of claimFindings(b.text, `page ${b.page} line ${b.line}`)) findings.push(`${f.where}: ${f.rule}`);
  rmSync(dir, { recursive: true, force: true });
  return [...new Set(findings)];
}
