// The CV PDF is part of the site, and the page checks never see its text: this test reads it the way
// the checks read a page. `cvPdfText` takes the text pdftotext extracts and applies
//
// - the web CV checker in full mode (scripts/check-web-cv.py): the claim layout, each numeral bound
//   to its approval record in the same allow-list file the published PDF uses, the privacy and
//   wording lints, page-number footers and a significance threshold;
// - the site-wide claim rules (tests/e2e/site-claims.ts) on every parsed claim, with the facts its
//   records name, and on every bullet of every page joined across its wrapped lines: the number of
//   tests and the number of markets never in one claim, a count of teams always over my time
//   there, never two teams, and no significance threshold.
//
// The synthetic CVs below are fictional (an example person and employer). The last block reads the
// committed public/cv.pdf when there is one. A missing pdftotext, python3 or deny-list fails these
// tests; nothing here is skipped. The deny-list the CI PDF step holds is not available to the unit
// tests, so the committed PDF is read here with a stand-in list (the confidential list is checked in
// that CI step, never here).
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cvPdfEnv } from '@/lib/cv-pdf-file';
import { type Line, writePdf } from '../about/synthetic-pdf.ts';
import { LAYOUT, ROOT, bullets, cvPdfText, pdfText } from './cv-pdf-text.ts';
const COMMITTED = join(ROOT, 'public/cv.pdf');
/** A stand-in deny-list for the unit tests: two terms no CV holds. */
const STAND_IN_DENYLIST = 'synthetic deny term\nanother stand-in phrase';

const dirs: string[] = [];
const tmp = () => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'cv-pdf-text-')));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

// ───────────────────────────── a synthetic CV ─────────────────────────────

type Entry = { heading: string; date: string; sub: string; bullets: string[][] };
type Cv = { summary: string[]; entries: Entry[]; footer?: string };

const SUMMARY = 'Analyst with nearly 2 years at Example Co: worked on 25+ A/B tests across web and mobile and worked with 3 teams over my time there.';
const TOOL = 'Built a tool that cut setup from 20 to 3 minutes across 11 markets.';
const REPORTS = 'Wrote reports for the product team.';

const clean = (): Cv => ({
  summary: ['Analyst with nearly 2 years at Example Co: worked on 25+ A/B tests across web and mobile and', 'worked with 3 teams over my time there.'],
  entries: [
    {
      heading: 'Analyst',
      date: 'Jan 2020 – Dec 2021',
      sub: 'Example Co, Testville',
      bullets: [['Built a tool that cut setup from 20 to 3 minutes across 11', 'markets.'], [REPORTS]],
    },
  ],
});

function lines(cv: Cv): Line[][] {
  const out: Line[] = [];
  let y = 800;
  const put = (text: string, x = 72) => {
    out.push({ text, x, y });
    y -= 14;
  };
  put('Ada Example');
  put('Analyst, Berlin, Germany');
  y -= 14;
  put('Summary');
  for (const s of cv.summary) put(s);
  y -= 14;
  put('Experience');
  for (const e of cv.entries) {
    out.push({ text: e.date, x: 450, y });
    put(e.heading);
    put(e.sub);
    for (const b of e.bullets) {
      out.push({ text: '•', x: 72, y });
      b.forEach((t) => put(t, 82));
    }
    y -= 14;
  }
  put('Languages');
  out.push({ text: 'German B1', x: 250, y });
  put('English Fluent (C2)');
  if (cv.footer) out.push({ text: cv.footer, x: 290, y: 40 });
  return [out];
}

const manifest = (summary = SUMMARY) => ({
  version: 1,
  links: [] as string[],
  sections: [
    { sectionId: 'summary', heading: 'Summary' },
    {
      sectionId: 'experience',
      heading: 'Experience',
      entries: [
        {
          entryId: 'example-co',
          heading: 'Analyst Jan 2020 – Dec 2021',
          subject: 'Example Co',
          claims: [
            { claimId: 'example-co-tool', bulletMarker: '•', page: 1 },
            { claimId: 'example-co-reports', bulletMarker: '•', page: 1 },
          ],
        },
      ],
    },
    { sectionId: 'languages', heading: 'Languages' },
  ],
  summaryBindings: [{ bindingId: 'summary-intro', sectionId: 'summary', normalizedClaim: summary, subject: 'Example Co' }],
});

/** A record for the n-th occurrence of token in claim (spans in code points). */
function rec(id: string, bindingId: string, claim: string, token: string, o: { claimId?: string; factId?: string; nth?: number } = {}) {
  let at = -1;
  for (let i = 0; i <= (o.nth ?? 0); i++) at = claim.indexOf(token, at + 1);
  if (at < 0) throw new Error(`token ${token} not in claim`);
  const start = [...claim.slice(0, at)].length;
  const rest: { claimId?: string; factId?: string; nth?: number } = { ...o };
  delete rest.nth;
  return { id, bindingId, token, span: { start, end: start + [...token].length }, normalizedClaim: claim, subject: 'Example Co', meaning: id, ...rest };
}

const records = (summary = SUMMARY, extra: ReturnType<typeof rec>[] = []) => ({
  entries: [
    rec('tenure', 'summary-intro', summary, '2'),
    rec('tests', 'summary-intro', summary, '25+', { factId: 'profile.audible.experiments' }),
    ...(summary.includes('3 teams') ? [rec('teams', 'summary-intro', summary, '3', { factId: 'profile.audible.teams' })] : []),
    rec('before', 'example-co', TOOL, '20', { claimId: 'example-co-tool', factId: 'profile.audible.setup_minutes_before' }),
    rec('after', 'example-co', TOOL, '3', { claimId: 'example-co-tool', factId: 'profile.audible.setup_minutes_after' }),
    rec('markets', 'example-co', TOOL, '11', { claimId: 'example-co-tool', factId: 'profile.audible.markets' }),
    ...extra,
  ],
});

/** Writes the CV and its layout and records, and runs cvPdfText over them. */
function run(cv: Cv | null, o: { summary?: string; extra?: ReturnType<typeof rec>[]; denylist?: string | undefined; pdf?: Buffer; path?: string } = {}): string[] {
  const dir = tmp();
  const pdf = join(dir, 'cv.pdf');
  if (o.pdf) writeFileSync(pdf, o.pdf);
  else if (cv) writeFileSync(pdf, writePdf({ pages: lines(cv) }));
  writeFileSync(join(dir, 'layout.json'), JSON.stringify(manifest(o.summary)));
  writeFileSync(join(dir, 'records.json'), JSON.stringify(records(o.summary, o.extra)));
  return cvPdfText(pdf, {
    manifest: join(dir, 'layout.json'),
    records: join(dir, 'records.json'),
    denylist: 'denylist' in o ? o.denylist : STAND_IN_DENYLIST,
    path: o.path,
  });
}
const rulesOf = (findings: string[]) => findings.filter((f) => !f.startsWith('checker:')).map((f) => f.split(': ').pop());

describe('cvPdfText on synthetic CVs', () => {
  it('passes the clean CV: the checker and every claim rule', () => {
    expect(run(clean())).toEqual([]);
  });

  it('fails the tests and the markets in one claim, even when each number has its approval record', () => {
    const summary = 'Analyst with nearly 2 years at Example Co: worked on 25+ A/B tests across 11 markets and worked with 3 teams over my time there.';
    const cv = clean();
    cv.summary = ['Analyst with nearly 2 years at Example Co: worked on 25+ A/B tests across 11 markets and', 'worked with 3 teams over my time there.'];
    const findings = run(cv, { summary, extra: [rec('summary-markets', 'summary-intro', summary, '11', { factId: 'profile.audible.markets' })] });
    expect(findings.filter((f) => f.startsWith('checker:'))).toEqual([]);
    expect(findings).toContain('claim summary-intro: experiments-with-markets');
  });

  it('fails a count of teams without "over my time there", and two teams always', () => {
    const summary = 'Analyst with nearly 2 years at Example Co: worked on 25+ A/B tests across web and mobile and worked with 3 teams.';
    const cv = clean();
    cv.summary = ['Analyst with nearly 2 years at Example Co: worked on 25+ A/B tests across web and mobile and', 'worked with 3 teams.'];
    expect(rulesOf(run(cv, { summary }))).toContain('teams-without-tenure');

    const two = clean();
    two.entries[0]!.bullets[1] = ['Evaluated experiments for 2 teams over my time there.'];
    const found = run(two);
    expect(found.some((f) => f.startsWith('checker:') && /numeral at \d+-\d+ has no approval record/.test(f))).toBe(true);
    expect(rulesOf(found)).toContain('two-teams');
  });

  it('fails a significance threshold and a page-number footer', () => {
    const threshold = clean();
    threshold.entries[0]!.bullets[1] = ['Wrote reports for the product team at p < 0.05.'];
    const t = run(threshold);
    expect(t.some((f) => /checker: .*significance/.test(f))).toBe(true);
    expect(rulesOf(t)).toContain('significance-threshold');

    const footer = clean();
    footer.footer = 'Page 1 of 1';
    expect(run(footer).some((f) => /checker: .*page-footer/.test(f))).toBe(true);
  });

  it('passes the identical approved bullet only under its own heading: not under another, none or a repeated one', () => {
    expect(run(clean())).toEqual([]);
    const wrong = clean();
    wrong.entries[0]!.heading = 'Consultant';
    expect(run(wrong).some((f) => /checker: .*entry example-co not found/.test(f))).toBe(true);
    const none = clean();
    none.entries[0]!.heading = '';
    expect(run(none).some((f) => f.startsWith('checker:'))).toBe(true);
    const twice = clean();
    twice.entries.push({ ...twice.entries[0]!, bullets: [] });
    expect(run(twice).some((f) => /checker: .*heading repeats/.test(f))).toBe(true);
  });

  it('reads a claim across its wrapped lines, in the parsed claims and in the bullets of the page', () => {
    const cv = clean();
    cv.entries[0]!.bullets[1] = ['Contributed to 25+ A/B tests for the', 'product team across 11 markets.'];
    const found = run(cv);
    expect(found.some((f) => /^page 1 line \d+: experiments-with-markets$/.test(f))).toBe(true);
    const pdf = join(tmp(), 'cv.pdf');
    writeFileSync(pdf, writePdf({ pages: lines(cv) }));
    const page = bullets(pdfText(pdf));
    expect(page.map((b) => b.text)).toContain('Contributed to 25+ A/B tests for the product team across 11 markets.');
  });
});

describe('cvPdfText fails closed', () => {
  it('on an absent PDF', () => {
    expect(run(null)).toEqual(expect.arrayContaining([expect.stringMatching(/^checker: exit [12]$/)]));
  });

  it('on a PDF with no deny-list', () => {
    const found = run(clean(), { denylist: undefined });
    expect(found).toEqual(expect.arrayContaining([expect.stringMatching(/^checker: exit 1$/), expect.stringMatching(/TRUTH_DENYLIST/)]));
  });

  it('on an invalid PDF', () => {
    const found = run(null, { pdf: Buffer.from('%PDF-1.4\nnot a pdf\n') });
    expect(found.some((f) => f.startsWith('pdftotext: '))).toBe(true);
    expect(found.some((f) => f.startsWith('checker: exit'))).toBe(true);
  });

  it('when pdftotext is missing', () => {
    const dir = tmp();
    const pdf = join(dir, 'cv.pdf');
    writeFileSync(pdf, writePdf({ pages: lines(clean()) }));
    expect(() => cvPdfText(pdf, { denylist: STAND_IN_DENYLIST, path: join(dir, 'no-tools') })).toThrow(/pdftotext could not run/);
  });
});

// ───────────────────────────── the committed PDF ─────────────────────────────

describe('the committed public/cv.pdf', () => {
  if (existsSync(COMMITTED)) {
    it('passes cvPdfText with the published layout and allow-list (the confidential deny-list is checked in the CI PDF step)', () => {
      expect(cvPdfText(COMMITTED, { denylist: STAND_IN_DENYLIST })).toEqual([]);
    });
  } else {
    it('is not in the tree: the build offers no PDF, so no page links one', () => {
      expect(existsSync(COMMITTED)).toBe(false);
      expect(cvPdfEnv(ROOT)).toBe('');
      // The published layout ships empty until the reviewed PDF arrives with it, so any PDF dropped
      // in without its reviewed layout fails the checker.
      expect((JSON.parse(readFileSync(LAYOUT, 'utf8')) as { sections: unknown[] }).sections).toEqual([]);
    });
  }
});
