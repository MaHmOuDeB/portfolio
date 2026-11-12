import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Line, type Link, type PdfSpec, writePdf } from './synthetic-pdf.ts';

// The web CV checker (scripts/check-web-cv.py) and the render wrapper (scripts/cv-sync.sh), on
// synthetic PDFs only: a fictional person, a fictional employer and fictional numbers. Every PDF is
// written by synthetic-pdf.ts and read back through the real pdftotext and pdfinfo, which CI
// installs before the unit tests; a missing tool fails these tests, it never skips them.
const ROOT = join(import.meta.dirname, '../../..');
const CHECKER = join(ROOT, 'scripts/check-web-cv.py');
const SYNC = join(ROOT, 'scripts/cv-sync.sh');
const DENY = 'synthetic deny term\nanother secret phrase';
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

const dirs: string[] = [];
function tmp(): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'cv-privacy-')));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

// ───────────────────────────── the synthetic CV ─────────────────────────────
type Bullet = { text: string[]; marker?: string };
type Entry = { heading: string; date?: string; sub?: string; bullets: Bullet[]; meta?: string };
type Cv = { header: string[]; summary: string[]; experience: Entry[]; projects: Entry[]; languages: string; extraPage?: Line[] };

function base(): Cv {
  return {
    header: ['Ada Example', 'Analyst, Berlin, Germany'],
    summary: ['Analyst with nearly 2 years at Example Co: worked on 25+ A/B tests', 'across web and mobile.'],
    experience: [
      {
        heading: 'Analyst',
        date: 'Jan 2020 – Dec 2021',
        sub: 'Example Co, Testville',
        bullets: [
          { text: ['Built a tool that cut setup from 20 to 3 minutes (85%) across 11', 'markets.'] },
          { text: ['Wrote reports for the product team.'] },
        ],
      },
    ],
    projects: [
      {
        heading: 'Retention Study',
        date: '2026',
        bullets: [{ text: ['Analysed a public dataset: 23% of customers made 71% of spend.'] }],
        meta: 'Technologies Python, SQL',
      },
    ],
    languages: 'English Fluent (C2)',
  };
}

function lines(cv: Cv): Line[] {
  const out: Line[] = [];
  let y = 800;
  const put = (text: string, x = 72) => {
    out.push({ text, x, y });
    y -= 14;
  };
  for (const h of cv.header) put(h);
  y -= 14;
  put('Summary');
  for (const s of cv.summary) put(s);
  y -= 14;
  const entries = (heading: string, list: Entry[]) => {
    put(heading);
    for (const e of list) {
      if (e.date) out.push({ text: e.date, x: 450, y });
      put(e.heading);
      if (e.sub) put(e.sub);
      for (const b of e.bullets) {
        out.push({ text: b.marker ?? '•', x: 72, y });
        b.text.forEach((t) => put(t, 82));
      }
      if (e.meta) put(e.meta);
      y -= 14;
    }
  };
  entries('Experience', cv.experience);
  entries('Projects', cv.projects);
  put('Languages');
  out.push({ text: 'German B1', x: 250, y });
  put(cv.languages);
  return out;
}

const MANIFEST = () => ({
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
    {
      sectionId: 'projects',
      heading: 'Projects',
      entries: [
        {
          entryId: 'retention-study',
          heading: 'Retention Study 2026',
          subject: 'Retention Study',
          claims: [{ claimId: 'retention-share', bulletMarker: '•', page: 1 }],
        },
      ],
    },
    { sectionId: 'languages', heading: 'Languages' },
  ],
  summaryBindings: [
    {
      bindingId: 'summary-intro',
      sectionId: 'summary',
      normalizedClaim: 'Analyst with nearly 2 years at Example Co: worked on 25+ A/B tests across web and mobile.',
      subject: 'Example Co',
    },
  ],
});

type Rec = {
  id: string;
  bindingId: string;
  claimId?: string;
  token: string;
  span: { start: number; end: number };
  normalizedClaim: string;
  subject: string;
  meaning: string;
  factId?: string;
};

/** A record for the n-th occurrence of token in claim. */
function rec(id: string, bindingId: string, claim: string, token: string, o: Partial<Rec> & { nth?: number } = {}): Rec {
  let at = -1;
  for (let i = 0; i <= (o.nth ?? 0); i++) at = claim.indexOf(token, at + 1);
  if (at < 0) throw new Error(`token ${token} not in claim`);
  const start = [...claim.slice(0, at)].length;
  const { nth: _nth, ...rest } = o;
  return { id, bindingId, token, span: { start, end: start + [...token].length }, normalizedClaim: claim, subject: 'Example Co', meaning: id, ...rest };
}

const SUMMARY = 'Analyst with nearly 2 years at Example Co: worked on 25+ A/B tests across web and mobile.';
const TOOL = 'Built a tool that cut setup from 20 to 3 minutes (85%) across 11 markets.';
const SHARE = 'Analysed a public dataset: 23% of customers made 71% of spend.';
const RECORDS = (): Rec[] => [
  rec('tenure', 'summary-intro', SUMMARY, '2'),
  rec('tests', 'summary-intro', SUMMARY, '25+', { factId: 'profile.audible.experiments' }),
  rec('before', 'example-co', TOOL, '20', { claimId: 'example-co-tool', factId: 'profile.audible.setup_minutes_before' }),
  rec('after', 'example-co', TOOL, '3', { claimId: 'example-co-tool', factId: 'profile.audible.setup_minutes_after' }),
  rec('cut', 'example-co', TOOL, '85%', { claimId: 'example-co-tool', factId: 'profile.audible.setup_time_cut' }),
  rec('markets', 'example-co', TOOL, '11', { claimId: 'example-co-tool', factId: 'profile.audible.markets' }),
  rec('top-share', 'retention-study', SHARE, '23%', { claimId: 'retention-share', subject: 'Retention Study' }),
  rec('spend-share', 'retention-study', SHARE, '71%', { claimId: 'retention-share', subject: 'Retention Study' }),
];

type Run = { status: number | null; stdout: string; stderr: string; dir: string };
type CheckOptions = {
  pdf?: Buffer | null;
  manifest?: unknown;
  records?: unknown;
  env?: Record<string, string | undefined>;
  args?: string[];
  python?: string;
};

function check(spec: PdfSpec | Cv | null, o: CheckOptions = {}): Run {
  const dir = tmp();
  const pdf = join(dir, 'cv.pdf');
  if (o.pdf) writeFileSync(pdf, o.pdf);
  else if (spec) writeFileSync(pdf, writePdf('pages' in spec ? spec : { pages: [lines(spec)] }));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(o.manifest ?? MANIFEST()));
  writeFileSync(join(dir, 'records.json'), JSON.stringify(o.records ?? { entries: RECORDS() }));
  const env = { PATH: process.env.PATH, TRUTH_DENYLIST: DENY, ...o.env };
  const r = spawnSync(
    o.python ?? 'python3',
    ['-I', CHECKER, pdf, '--manifest', join(dir, 'manifest.json'), '--records', join(dir, 'records.json'), ...(o.args ?? [])],
    { encoding: 'utf8', env: env as unknown as NodeJS.ProcessEnv, cwd: dir },
  );
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, dir };
}

function failsWith(r: Run, ...patterns: (string | RegExp)[]) {
  expect(r.status, r.stdout + r.stderr).toBe(1);
  for (const p of patterns) expect(r.stderr).toMatch(typeof p === 'string' ? new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : p);
}

function passes(r: Run) {
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
}

/** The CV with one extra plain line in the employer entry (after the company line). */
function withSub(sub: string): Cv {
  const cv = base();
  cv.experience[0]!.sub = sub;
  return cv;
}

function withBullet(text: string): Cv {
  const cv = base();
  cv.experience[0]!.bullets[1] = { text: [text] };
  return cv;
}

// ───────────────────────────── modes and inputs ─────────────────────────────
describe('check-web-cv: inputs and modes', () => {
  it('passes the clean synthetic CV and prints its SHA-256', () => {
    const r = check(base());
    passes(r);
    expect(r.stdout).toBe(`check-web-cv: PASS sha256 ${sha256(readFileSync(join(r.dir, 'cv.pdf')))}\n`);
  });

  it('passes with no PDF only in checker-only mode (--if-present)', () => {
    const r = check(null, { args: ['--if-present'] });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('checker-only mode, nothing checked');
    failsWith(check(null), 'the PDF does not exist');
  });

  it('fails closed when a PDF is present but TRUTH_DENYLIST is missing or empty', () => {
    failsWith(check(base(), { env: { TRUTH_DENYLIST: undefined } }), 'TRUTH_DENYLIST is missing or empty');
    failsWith(check(base(), { env: { TRUTH_DENYLIST: ' \n ' } }), 'TRUTH_DENYLIST is missing or empty');
  });

  it('fails closed on an invalid, empty or truncated PDF', () => {
    failsWith(check(null, { pdf: Buffer.from('not a pdf') }), /FAIL/);
    failsWith(check(null, { pdf: Buffer.alloc(0) }), /FAIL/);
    const good = writePdf({ pages: [lines(base())] });
    failsWith(check(null, { pdf: good.subarray(0, 200) }), /FAIL/);
  });

  it('fails closed when pdftotext is missing', () => {
    const dir = tmp();
    const python = realpathSync(spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).stdout.trim());
    mkdirSync(join(dir, 'bin'));
    symlinkSync(python, join(dir, 'bin', 'python3'));
    failsWith(check(base(), { env: { PATH: join(dir, 'bin') }, python: join(dir, 'bin', 'python3') }), 'not found (install poppler-utils)');
  });

  it('rejects wrong usage with exit code 2', () => {
    expect(check(base(), { args: ['--unknown'] }).status).toBe(2);
    expect(check(base(), { args: ['--lint-only', '--claims-out', '/tmp/x.json'] }).status).toBe(2);
  });

  it('writes the parsed claims to --claims-out, outside the repository only', () => {
    const out = join(tmp(), 'claims.json');
    passes(check(base(), { args: ['--claims-out', out] }));
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({
      claims: [
        { id: 'summary-intro', normalizedClaim: SUMMARY },
        { id: 'example-co-tool', normalizedClaim: TOOL },
        { id: 'example-co-reports', normalizedClaim: 'Wrote reports for the product team.' },
        { id: 'retention-share', normalizedClaim: SHARE },
      ],
    });
    const inside = join(ROOT, 'reports', `claims-${process.pid}.json`);
    failsWith(check(base(), { args: ['--claims-out', inside] }), 'must lie outside this repository');
    expect(existsSync(inside)).toBe(false);
  });

  it('checks the PDF hash and the metadata file', () => {
    const pdf = writePdf({ pages: [lines(base())] });
    passes(check(null, { pdf, args: ['--expect-sha256', sha256(pdf)] }));
    failsWith(check(null, { pdf, args: ['--expect-sha256', sha256('other')] }), 'not the expected one');
    const meta = (m: unknown) => {
      const p = join(tmp(), 'cv.meta.json');
      writeFileSync(p, JSON.stringify(m));
      return ['--meta', p];
    };
    passes(check(null, { pdf, args: meta({ sha256: sha256(pdf), renderedAt: '2026-11-12T10:00:00Z', web: true }) }));
    failsWith(check(null, { pdf, args: meta({ sha256: sha256('x'), renderedAt: '2026-11-12T10:00:00Z', web: true }) }), 'names another PDF');
    failsWith(check(null, { pdf, args: meta({ sha256: sha256(pdf), renderedAt: '2026-11-12T10:00:00Z', web: false }) }), 'web: true');
    failsWith(
      check(null, { pdf, args: meta({ sha256: sha256(pdf), renderedAt: '2026-11-12T10:00:00Z', web: true, source: '/Users/x/private/cv.docx' }) }),
      'exactly sha256, renderedAt and web',
    );
  });

  it('checks text, metadata and links but no layout in --lint-only mode', () => {
    const r = check({ pages: [[{ text: 'Free text with 7 numbers and no manifest.' }]] }, { args: ['--lint-only'], manifest: { broken: true } });
    passes(r);
    failsWith(check({ pages: [[{ text: 'Call +44 20 7946 0000 today.' }]] }, { args: ['--lint-only'] }), 'phone');
  });
});

// ───────────────────────────── privacy and wording ─────────────────────────────
describe('check-web-cv: privacy and wording lints', () => {
  const cases: [string, string, string][] = [
    ['an international phone number', 'Phone +44 20 7946 0000', 'phone'],
    ['a phone number in national form', 'Phone 030 1234 5678', 'phone'],
    ['a street with a house number', 'Musterstraße 12', 'street-address'],
    ['a separate street word with a house number', 'Example Allee 5', 'street-address'],
    ['an English street address', '221 Baker Street', 'street-address'],
    ['a postcode with a city', '10115 Berlin', 'postcode-city'],
    ['a work permit', 'Holds a work permit', 'residence-term'],
    ['the residence act', 'Permit under AufenthG', 'residence-term'],
    ['a residence title', 'Aufenthaltstitel granted', 'residence-term'],
    ['a Blue Card', 'EU Blue Card holder', 'residence-term'],
    ['authorised to work', 'Authorised to work in Germany', 'residence-term'],
    ['authorized to work', 'Authorized to work in Germany', 'residence-term'],
    ['a visa', 'Visa status: none', 'residence-term'],
    ['AI-powered', 'An AI-powered analyst', 'banned-phrase'],
    ['passionate', 'A passionate analyst', 'banned-phrase'],
    ['rockstar', 'A rockstar analyst', 'banned-phrase'],
    ['a p-value threshold', 'Tested at (p < 0.05)', 'significance-threshold'],
    ['a compact p-value threshold', 'Tested at p<0.02', 'significance-threshold'],
    ['a significance threshold in words', 'Used a significance threshold', 'significance-threshold'],
    ['German above B1', 'German C1', 'german-above-b1'],
    ['fluent German', 'Speaks fluent German', 'german-above-b1'],
    ['a page footer in words', 'Page 2 of 3', 'page-footer'],
  ];
  it.each(cases)('fails on %s, naming the rule and never the text', (_name, text, rule) => {
    const r = check(withSub(text));
    failsWith(r, `: ${rule}`);
    expect(r.stdout + r.stderr).not.toContain(text);
  });

  it('fails on a deny-list term by index only, whatever its case and spacing', () => {
    const r = check(withSub('Some Another   SECRET phrase here'));
    failsWith(r, 'denylist #2');
    expect(r.stderr.toLowerCase()).not.toContain('secret');
  });

  it('accepts German at B1 and the other CEFR levels beside their languages', () => {
    passes(check(base()));
  });

  it('fails on a page-number footer at the foot of a page', () => {
    const cv = lines(base());
    cv.push({ text: 'Ada Example · 1/3', x: 400, y: 40 });
    failsWith(check({ pages: [cv] }), 'page-footer');
  });
});

// ───────────────────────────── links, actions and metadata ─────────────────────────────
describe('check-web-cv: links, actions and metadata', () => {
  const withLinks = (links: Link[], extra: Partial<PdfSpec> = {}): PdfSpec => ({ pages: [lines(base())], links, ...extra });
  const listed = (...urls: string[]) => ({ ...MANIFEST(), links: urls });

  it('passes a link the manifest lists', () => {
    passes(check(withLinks([{ page: 1, uri: 'https://example.org/ada' }]), { manifest: listed('https://example.org/ada') }));
  });

  it('fails on a link the manifest does not list, even behind innocuous text', () => {
    failsWith(check(withLinks([{ page: 1, uri: 'https://example.org/other' }]), { manifest: listed('https://example.org/ada') }), 'link not listed');
  });

  it('fails on a tel: link and on a link whose target holds a phone number', () => {
    failsWith(check(withLinks([{ page: 1, uri: 'tel:+442079460000' }])), 'link scheme not allowed');
    const url = 'https://example.org/call/442079460000';
    failsWith(check(withLinks([{ page: 1, uri: url }]), { manifest: listed(url) }), 'link target: phone');
  });

  it('finds a hidden link in a hex string, behind an escaped name and inside a compressed object stream', () => {
    failsWith(check(withLinks([{ page: 1, uri: 'https://example.org/hex', hex: true }])), 'link not listed');
    failsWith(check(withLinks([{ page: 1, uri: 'https://example.org/esc', obfuscateName: true }])), 'link not listed');
    failsWith(check(withLinks([{ page: 1, uri: 'https://example.org/objstm', rect: [0, 0, 0, 0] }], { objectStream: true })), 'link not listed');
    passes(check(withLinks([{ page: 1, uri: 'https://example.org/objstm' }], { objectStream: true }), { manifest: listed('https://example.org/objstm') }));
  });

  it('fails on JavaScript and on a note annotation', () => {
    failsWith(check(withLinks([], { javascript: true })), 'active or hidden content');
    failsWith(check(withLinks([], { note: 'hidden note' })), 'annotation type not allowed (Text)');
  });

  it('lints the document metadata', () => {
    failsWith(check(withLinks([], { info: { Author: 'Ada +44 20 7946 0000' } })), 'metadata: phone');
    failsWith(check(withLinks([], { info: { Title: 'synthetic deny term' } })), 'metadata: denylist #1');
    failsWith(check(withLinks([], { info: { Keywords: 'visa' } })), 'metadata: residence-term');
    passes(check(withLinks([], { info: { Title: 'Ada Example CV', Producer: 'Skia/PDF m130' } })));
  });
});

// ───────────────────────────── numerals ─────────────────────────────
describe('check-web-cv: the numeral rule', () => {
  it('passes "nearly 2 years" and "25+ A/B tests across web and mobile" under their records', () => {
    passes(check(base()));
  });

  it('fails on an unknown numeral', () => {
    failsWith(check(withBullet('Built 7 dashboards for the team.')), 'claim example-co-reports: numeral at 6-7 has no approval record');
  });

  it('fails on a numeral written as a word', () => {
    failsWith(check(withBullet('Worked with two teams.')), 'claim example-co-reports: numeral at 12-15 has no approval record');
  });

  it('fails on "2 teams" with the shipped allow-list', () => {
    const shipped = JSON.parse(readFileSync(join(ROOT, 'scripts/cv/numeral-allowlist.json'), 'utf8'));
    const r = check(withBullet('Evaluated experiments for 2 teams with mirrored metric setups.'), { records: shipped });
    failsWith(r, 'claim example-co-reports: numeral at 26-27 has no approval record');
  });

  it('fails on the old Summary sentence that joins tests, teams and markets', () => {
    const cv = base();
    cv.summary = ['Analyst with nearly 2 years at Example Co: ran 25+ A/B experiments (20+', 'recommendations adopted) with 3 cross-functional teams across 11 markets.'];
    failsWith(check(cv), 'summary paragraph matches no single summary binding', 'summary binding summary-intro not found');
  });

  it('fails when an approved figure moves to another meaning ("11 teams", "25+ markets")', () => {
    const cv = base();
    cv.experience[0]!.bullets[0] = { text: ['Built a tool that cut setup from 20 to 3 minutes (85%) across 11', 'teams.'] };
    failsWith(check(cv), 'claim example-co-tool: the claim text differs from its approved records');
    const cv2 = base();
    cv2.summary = ['Analyst with nearly 2 years at Example Co: worked on 25+ A/B tests', 'across web and mobile markets.'];
    failsWith(check(cv2), 'summary binding summary-intro not found');
  });

  it('fails on "25+ experiments in 11 markets" although both are fact displays', () => {
    failsWith(check(withBullet('Ran 25+ experiments in 11 markets.')), 'numeral at 4-7 has no approval record', 'numeral at 23-25 has no approval record');
  });

  it('passes a source fact in its approved claim and fails it under another subject or meaning', () => {
    const claim = 'Designed a 7-event taxonomy.';
    const record = rec('events', 'retention-study', claim, '7', { claimId: 'retention-share', subject: 'Retention Study', factId: 'pulse.events.count' });
    const cv = base();
    cv.projects[0]!.bullets[0] = { text: [claim] };
    passes(check(cv, { records: { entries: [...RECORDS().slice(0, 6), record] } }));
    const moved = withBullet('Cut revenue by 7% for the team.');
    failsWith(check(moved), 'claim example-co-reports: numeral at 15-17 has no approval record');
    failsWith(check(cv, { records: { entries: [...RECORDS().slice(0, 6), { ...record, subject: 'Example Co' }] } }), 'subject does not match its entry');
  });

  it('fails a record whose token is not its fact display, and swapped fact ids', () => {
    const r = RECORDS();
    r[1] = { ...r[1]!, factId: 'profile.audible.markets' };
    failsWith(check(base(), { records: { entries: r } }), 'token is not the display of its fact');
    const s = RECORDS();
    s[2] = { ...s[2]!, factId: 'profile.audible.setup_minutes_after' };
    s[3] = { ...s[3]!, factId: 'profile.audible.setup_minutes_before' };
    failsWith(check(base(), { records: { entries: s } }), 'token is not the display of its fact');
  });

  it('passes two differently interpreted numerals in one claim and fails swapped spans', () => {
    passes(check(base()));
    const r = RECORDS();
    r[2] = { ...r[2]!, span: r[3]!.span };
    failsWith(check(base(), { records: { entries: r } }), 'span does not hold its token');
  });

  it('needs one record per occurrence of a repeated token, with distinct spans', () => {
    const claim = 'Wrote 3 guides and 3 videos.';
    const one = rec('guides', 'example-co', claim, '3', { claimId: 'example-co-reports' });
    const two = rec('videos', 'example-co', claim, '3', { claimId: 'example-co-reports', nth: 1 });
    passes(check(withBullet(claim), { records: { entries: [...RECORDS(), one, two] } }));
    failsWith(check(withBullet(claim), { records: { entries: [...RECORDS(), one] } }), 'numeral at 19-20 has no approval record');
    failsWith(check(withBullet(claim), { records: { entries: [...RECORDS(), one, { ...one, id: 'dup' }] } }), 'overlaps record guides');
  });

  it('counts spans in Unicode code points', () => {
    const claim = 'Café study – with 12 rows.';
    const good = rec('rows', 'example-co', claim, '12', { claimId: 'example-co-reports' });
    passes(check(withBullet(claim), { records: { entries: [...RECORDS(), good] } }));
    const bytes = Buffer.byteLength(claim.slice(0, claim.indexOf('12')));
    const shifted = { ...good, span: { start: bytes, end: bytes + 2 } };
    failsWith(check(withBullet(claim), { records: { entries: [...RECORDS(), shifted] } }), 'span does not hold its token');
  });

  it('exempts dates, years and CEFR levels only in their context', () => {
    passes(check(withBullet('Rebuilt in 2026 as a web app, Apr 2023 – Nov 2025, 08/2023.')));
    failsWith(check(withBullet('Shipped 2024 orders.')), 'numeral at 8-12 has no approval record');
    failsWith(check(withBullet('Graded C2 by the team.')), 'numeral at 8-9 has no approval record');
  });

  it('fails on a numeral outside any claim', () => {
    failsWith(check(withSub('Example Co, 20 h/week')), 'numeral at column 12 outside any approved claim');
  });
});

// ───────────────────────────── layout and bindings ─────────────────────────────
describe('check-web-cv: layout and bindings', () => {
  it('joins a wrapped bullet within its claim and keeps punctuation', () => {
    const out = join(tmp(), 'claims.json');
    passes(check(base(), { args: ['--claims-out', out] }));
    expect(readFileSync(out, 'utf8')).toContain(TOOL);
  });

  it('fails when an approved bullet moves under another heading, or under none', () => {
    const cv = base();
    const tool = cv.experience[0]!.bullets.shift()!;
    cv.projects[0]!.bullets.unshift(tool);
    failsWith(check(cv), /claim retention-share: the claim text differs|bullet not in the manifest/);
    const none = base();
    none.experience[0]!.heading = 'Senior Analyst';
    failsWith(check(none), 'entry example-co not found');
  });

  it('fails on a duplicate heading', () => {
    const cv = base();
    cv.projects.push({ heading: 'Retention Study', date: '2026', bullets: [] });
    failsWith(check(cv), 'heading repeats');
  });

  it('fails on a manifest with duplicate or conflicting ids and headings', () => {
    const m = MANIFEST();
    m.sections[2]!.entries![0]!.entryId = 'example-co';
    failsWith(check(base(), { manifest: m }), 'duplicate id in the manifest');
    const h = MANIFEST();
    h.sections[2]!.entries![0]!.heading = 'Analyst Jan 2020 – Dec 2021';
    failsWith(check(base(), { manifest: h }), 'duplicate heading in the manifest');
    const b = MANIFEST();
    b.summaryBindings.push({ ...b.summaryBindings[0]!, bindingId: 'summary-again' });
    failsWith(check(base(), { manifest: b }), "duplicates another binding's claim");
  });

  it('fails on an unmanifested bullet, a missing bullet, the wrong marker and the wrong page', () => {
    const extra = base();
    extra.experience[0]!.bullets.push({ text: ['One more claim.'] });
    failsWith(check(extra), 'bullet not in the manifest');
    const missing = base();
    missing.experience[0]!.bullets.pop();
    failsWith(check(missing), 'entry example-co: 1 manifest claim(s) not found');
    const marker = base();
    marker.experience[0]!.bullets[1]!.marker = '–';
    failsWith(check(marker), 'claim example-co-reports has the wrong bullet marker');
    const m = MANIFEST();
    m.sections[1]!.entries![0]!.claims[1]!.page = 2;
    failsWith(check(base(), { manifest: m }), 'claim example-co-reports is not on page 2');
  });

  it('fails on records bound to the wrong claim, an unknown binding or the wrong section', () => {
    const wrongClaim = RECORDS();
    wrongClaim[6] = { ...wrongClaim[6]!, bindingId: 'example-co', claimId: 'example-co-reports', subject: 'Example Co' };
    failsWith(check(base(), { records: { entries: wrongClaim } }), /the claim text differs|names no numeral|has no approval record/);
    const unknown = RECORDS();
    unknown[0] = { ...unknown[0]!, bindingId: 'nowhere' };
    failsWith(check(base(), { records: { entries: unknown } }), 'resolves to no entry or summary binding');
    const crossEntry = RECORDS();
    crossEntry[6] = { ...crossEntry[6]!, claimId: 'example-co-tool' };
    failsWith(check(base(), { records: { entries: crossEntry } }), 'claimId must name a claim of its entry');
    const summaryClaim = RECORDS();
    summaryClaim[0] = { ...summaryClaim[0]!, claimId: 'example-co-tool' };
    failsWith(check(base(), { records: { entries: summaryClaim } }), 'claimId is not allowed on a summary binding');
    const duplicateId = RECORDS();
    duplicateId[1] = { ...duplicateId[1]!, id: 'tenure' };
    failsWith(check(base(), { records: { entries: duplicateId } }), 'id repeats');
  });

  it('keeps a Summary claim apart from the next entry heading', () => {
    const cv = base();
    cv.summary = ['Analyst with nearly 2 years at Example Co.'];
    failsWith(check(cv), 'summary paragraph matches no single summary binding');
  });

  /** The CV split onto two pages before the first line with the given text. */
  function paged(cv: Cv, splitAt: string): Line[][] {
    const all = lines(cv);
    const at = all.findIndex((l) => l.text === splitAt);
    const second = all.splice(at);
    const shift = 800 - second[0]!.y!;
    return [all, second.map((l) => ({ ...l, y: l.y! + shift }))];
  }

  function continued(declare: { fromPage: number; toPage: number } | null, onNextPage: boolean): Run {
    const cv = base();
    cv.experience[0]!.bullets[1] = { text: ['Wrote reports for the', 'product team.'] };
    const m = MANIFEST();
    const claims = m.sections[1]!.entries![0]!.claims as { claimId: string; bulletMarker: string; page: number; continuation?: unknown }[];
    if (declare) claims[1]!.continuation = declare;
    m.sections[2]!.entries![0]!.claims[0]!.page = 2;
    return check({ pages: paged(cv, onNextPage ? 'product team.' : 'Projects') }, { manifest: m });
  }

  it('joins a page continuation only where the manifest declares it', () => {
    passes(continued({ fromPage: 1, toPage: 2 }, true));
    failsWith(continued(null, true), 'undeclared page continuation of claim example-co-reports');
    failsWith(continued({ fromPage: 1, toPage: 2 }, false), 'declared page continuation not found');
    failsWith(continued({ fromPage: 1, toPage: 3 }, true), 'must run from its page to the next page');
  });
});

// ───────────────────────────── cv-sync.sh ─────────────────────────────
// A stub renderer stands in for the private one. It writes a synthetic PDF whose text it reads
// from the "DOCX" (a plain text file here): with --web it drops lines marked SENSITIVE, without it
// keeps them. Environment switches make it misbehave in the ways the wrapper must catch.
const STUB = String.raw`
import os, sys, json, zlib
args = sys.argv[1:]
log = os.environ.get("STUB_LOG")
if log:
    with open(log, "a") as f:
        f.write(json.dumps(args) + "\n")
if args == ["--declare-assets"]:
    print("assets/font.bin")
    sys.exit(0)
if os.environ.get("STUB_FAIL"):
    sys.exit(3)
docx, pdf = args[0], args[1]
web = "--web" in args[2:] and not os.environ.get("STUB_IGNORE_WEB")
here = os.path.dirname(os.path.abspath(__file__))
font = open(os.path.join(here, "assets", "font.bin")).read()
lines = [l for l in open(docx).read().splitlines() if l.strip()]
if web:
    lines = [l for l in lines if not l.startswith("SENSITIVE ")]
lines = [l.replace("SENSITIVE ", "") for l in lines]
tamper = os.environ.get("STUB_TAMPER")
if tamper and "synthetic" in os.path.basename(docx):
    with open(tamper, "a") as f:
        f.write("# changed\n")
ops = b""
y = 800
for l in lines + ["font " + font.strip()]:
    t = l.encode("latin-1").replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")
    ops += b"BT /F1 10 Tf 72 %d Td (" % y + t + b") Tj ET\n"
    y -= 14
objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Length %d >>\nstream\n" % len(ops) + ops + b"\nendstream"]
out, offs = b"%PDF-1.4\n", []
for i, o in enumerate(objs, 1):
    offs.append(len(out)); out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
x = len(out)
out += b"xref\n0 6\n0000000000 65535 f \n" + b"".join(b"%010d 00000 n \n" % o for o in offs)
out += b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % x
open(pdf, "wb").write(out)
`;

type Sync = { dir: string; renderer: string; original: string; input: string; synthetic: string; present: string; output: string; evidence: string; log: string };

function syncSetup(): Sync {
  const dir = tmp();
  for (const name of ['web', 'original']) {
    mkdirSync(join(dir, name, 'assets'), { recursive: true });
    writeFileSync(join(dir, name, 'render.py'), STUB);
    writeFileSync(join(dir, name, 'assets', 'font.bin'), 'synthetic-font\n');
  }
  // The "original" renderer: the same stub, so its non-web output matches.
  const s: Sync = {
    dir,
    renderer: join(dir, 'web', 'render.py'),
    original: join(dir, 'original', 'render.py'),
    input: join(dir, 'approved.docx'),
    synthetic: join(dir, 'synthetic.docx'),
    present: join(dir, 'present.txt'),
    output: join(dir, 'out', 'cv.pdf'),
    evidence: join(dir, 'evidence.json'),
    log: join(dir, 'stub.log'),
  };
  mkdirSync(join(dir, 'out'));
  writeFileSync(s.input, 'Ada Example\nWrote reports for the product team.\n');
  writeFileSync(
    s.synthetic,
    'Synthetic Person\nSENSITIVE Phone +44 20 7946 0000\nSENSITIVE Musterstraße 12, 10115 Berlin\nSENSITIVE Holds a work permit\nInnocuous approved line\n',
  );
  writeFileSync(s.present, 'Synthetic Person\nInnocuous approved line\n');
  return s;
}

const LINT_ONLY_MANIFEST = { version: 1, sections: [{ sectionId: 'all', heading: 'Nothing' }], summaryBindings: [] };

function sync(s: Sync, o: { args?: string[]; env?: Record<string, string | undefined>; drop?: string[]; inputSha?: string } = {}) {
  const full: Record<string, string> = {
    '--renderer': s.renderer,
    '--input': s.input,
    '--output': s.output,
    '--input-sha256': o.inputSha ?? sha256(readFileSync(s.input)),
    '--synthetic-docx': s.synthetic,
    '--synthetic-present': s.present,
    '--original-renderer': s.original,
    '--evidence': s.evidence,
  };
  const args = Object.entries(full)
    .filter(([k]) => !(o.drop ?? []).includes(k))
    .flat();
  return spawnSync('bash', [SYNC, ...args, ...(o.args ?? ['--lint-only'])], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, TRUTH_DENYLIST: DENY, STUB_LOG: s.log, ...o.env } as unknown as NodeJS.ProcessEnv,
  });
}

describe('cv-sync.sh', () => {
  it('accepts the renderer on the synthetic input, then renders the approved input from the same snapshot', () => {
    const s = syncSetup();
    const r = sync(s);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const pdf = readFileSync(s.output);
    expect(JSON.parse(readFileSync(join(s.dir, 'out', 'cv.meta.json'), 'utf8'))).toEqual({
      sha256: sha256(pdf),
      renderedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
      web: true,
    });
    const calls = readFileSync(s.log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as string[]);
    const real = calls.at(-1)!;
    // Absolute snapshot renderer path is the script itself; arguments: snapshot DOCX, PDF, --web.
    expect(real).toHaveLength(3);
    expect(real[0]).toMatch(/^\/.*\/input\.docx$/);
    expect(real[1]).toMatch(/^\/.*\.pdf$/);
    expect(real[2]).toBe('--web');
    const evidence = JSON.parse(readFileSync(s.evidence, 'utf8'));
    expect(evidence.result).toBe('pass');
    expect(evidence.candidatePdfSha256).toBe(sha256(pdf));
    expect(evidence.inputSha256).toBe(sha256(readFileSync(s.input)));
    expect(Object.keys(evidence.snapshot)).toEqual(['render.py', 'assets/font.bin']);
    expect(JSON.stringify(evidence)).not.toMatch(/Ada Example|Wrote reports/);
  });

  it('rejects missing, relative or unreadable paths before rendering, leaving no output', () => {
    for (const drop of ['--renderer', '--input', '--output', '--input-sha256', '--evidence']) {
      const s = syncSetup();
      expect(sync(s, { drop: [drop] }).status, drop).toBe(2);
      expect(existsSync(s.output)).toBe(false);
    }
    const s = syncSetup();
    const relative = spawnSync('bash', [SYNC, '--renderer', 'render.py', '--input', s.input, '--output', s.output, '--input-sha256', 'x', '--evidence', s.evidence], { encoding: 'utf8' });
    expect(relative.status).toBe(2);
    rmSync(s.input);
    const r = sync(s, { inputSha: sha256('x') });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('is not a readable regular file');
    const t = syncSetup();
    chmodSync(t.renderer, 0o000);
    expect(sync(t).status).toBe(1);
    expect(existsSync(t.output)).toBe(false);
    expect(existsSync(t.log)).toBe(false);
  });

  it('rejects a changed approved input before rendering it', () => {
    const s = syncSetup();
    const r = sync(s, { inputSha: sha256('the reviewed bytes') });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('is not the reviewed input');
    expect(existsSync(s.output)).toBe(false);
  });

  it('rejects a renderer that ignores --web, before installing anything', () => {
    const s = syncSetup();
    const r = sync(s, { env: { STUB_IGNORE_WEB: '1' } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('synthetic acceptance failed');
    expect(r.stdout + r.stderr).not.toContain('7946');
    expect(existsSync(s.output)).toBe(false);
  });

  it('rejects a failing renderer', () => {
    const s = syncSetup();
    expect(sync(s, { env: { STUB_FAIL: '1' } }).status).toBe(1);
    expect(existsSync(s.output)).toBe(false);
  });

  it('rejects a renderer or asset changed after acceptance', () => {
    for (const target of ['render.py', 'assets/font.bin']) {
      const s = syncSetup();
      const r = sync(s, { env: { STUB_TAMPER: join(s.dir, 'web', target) } });
      expect(r.status, target).toBe(1);
      expect(r.stderr).toContain('changed after acceptance');
      expect(existsSync(s.output)).toBe(false);
    }
  });

  it('rejects a non-web mode that differs from the original renderer', () => {
    const s = syncSetup();
    writeFileSync(s.original, STUB.replace('if web:', 'if True:'));
    const r = sync(s);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('non-web output differs from the original renderer');
  });

  it('does not install a candidate that fails the checker', () => {
    const s = syncSetup();
    writeFileSync(s.input, 'Ada Example\nA passionate analyst.\n');
    const r = sync(s);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('candidate PDF failed the checker');
    expect(existsSync(s.output)).toBe(false);
  });

  it('runs the full check on the candidate unless told otherwise', () => {
    const s = syncSetup();
    const m = join(s.dir, 'manifest.json');
    writeFileSync(m, JSON.stringify(LINT_ONLY_MANIFEST));
    const r = sync(s, { args: ['--manifest', m] });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('candidate PDF failed the checker');
  });
});
