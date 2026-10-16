import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FACTS, FACT_DISPLAYS } from '../../src/lib/facts/index.ts';
import { auditHtml, routeOf, type AuditContext, type Finding } from '../../scripts/truth-audit.ts';

const FIXTURES = new URL('../fixtures/truth-audit/', import.meta.url).pathname;
const SCRIPT = new URL('../../scripts/truth-audit.ts', import.meta.url).pathname;
const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.html`), 'utf8');

const ctx = (over: Partial<AuditContext> = {}): AuditContext => ({
  route: '/',
  factIds: new Set(Object.keys(FACTS)),
  factDisplays: FACT_DISPLAYS,
  denylist: [],
  ...over,
});
const audit = (name: string, over: Partial<AuditContext> = {}) => auditHtml(fixture(name), ctx(over));
const stray = (detail: string, route = '/'): Finding => ({ route, kind: 'stray-number', detail });
const page = (body: string, head = '<title>Page</title>') =>
  `<!DOCTYPE html><html lang="en"><head>${head}</head><body>${body}</body></html>`;

describe('auditHtml', () => {
  it('passes Fact- and Derived-marked numbers, a year and a CEFR level, and skips script, style, template and comments', () => {
    expect(audit('clean')).toEqual([]);
  });

  it('flags an unmarked number, trimming the trailing full stop', () => {
    expect(audit('stray')).toEqual([stray('"1,353" in text')]);
  });

  it('flags each part of a number split across elements', () => {
    expect(audit('split')).toEqual([stray('"1" in text'), stray('"353" in text')]);
  });

  it('covers numbers in elements nested inside a data-derived element', () => {
    expect(audit('nested')).toEqual([]);
  });

  it('flags numbers in unmarked accessible-name attributes and covers those on a marked element', () => {
    expect(audit('attrs')).toEqual([stray('"20" in aria-label'), stray('"1" in aria-label')]);
  });

  it('passes a fact display in the head and flags any other head number', () => {
    expect(audit('head')).toEqual([stray('"30" in meta og:description')]);
  });

  it('checks the head title and the description and twitter meta as well', () => {
    const head =
      '<title>Ran 30 tests</title><meta name="description" content="Over 4 weeks">' +
      '<meta name="twitter:title" content="7 builds">';
    expect(auditHtml(page('<p>Hi.</p>', head), ctx())).toEqual([
      stray('"30" in <title>'),
      stray('"4" in meta description'),
      stray('"7" in meta twitter:title'),
    ]);
  });

  it('parses <noscript> content as markup', () => {
    expect(audit('noscript')).toEqual([stray('"42" in alt')]);
  });

  it('flags an empty data-derived and an unknown ref', () => {
    expect(audit('derived-bad')).toEqual([
      { route: '/', kind: 'bad-derived', detail: 'data-derived is empty' },
      { route: '/', kind: 'bad-derived', detail: 'data-derived "source:hillstrom"' },
    ]);
  });

  it('flags a data-fact id that is not a known fact', () => {
    const html = page('<p><data value="9" data-fact="profile.nope.nothing">9</data></p>');
    expect(auditHtml(html, ctx())).toEqual([
      { route: '/', kind: 'unknown-fact', detail: 'data-fact "profile.nope.nothing"' },
    ]);
  });

  it('names a deny-list hit only by its index, never by its text', () => {
    const findings = audit('denylist', { denylist: ['Secretword'] });
    expect(findings).toEqual([{ route: '/', kind: 'denylisted', detail: 'deny-list term #1' }]);
    expect(JSON.stringify(findings).toLowerCase()).not.toContain('secretword');
  });

  it('counts deny-list indexes from one and checks attributes and meta too', () => {
    const html = page(
      '<p><span aria-label="about SECRETWORD">x</span></p>',
      '<title>Page</title><meta property="og:title" content="other term here">',
    );
    expect(auditHtml(html, ctx({ denylist: ['other term', 'secretword'] }))).toEqual([
      { route: '/', kind: 'denylisted', detail: 'deny-list term #1' },
      { route: '/', kind: 'denylisted', detail: 'deny-list term #2' },
    ]);
  });

  it('redacts a deny-list term from any other finding detail', () => {
    const html = page('<p><data value="1" data-fact="secretword.a.b">1</data></p>');
    const findings = auditHtml(html, ctx({ denylist: ['Secretword'] }));
    expect(findings).toEqual([{ route: '/', kind: 'unknown-fact', detail: 'data-fact "[deny-list term #1].a.b"' }]);
    expect(JSON.stringify(findings).toLowerCase()).not.toContain('secretword');
  });

  it('flags the banned phrases in any case', () => {
    const html = page('<p>An AI-powered, Passionate rockstar.</p>');
    expect(auditHtml(html, ctx())).toEqual([
      { route: '/', kind: 'banned-phrase', detail: '"AI-powered" in text' },
      { route: '/', kind: 'banned-phrase', detail: '"Passionate" in text' },
      { route: '/', kind: 'banned-phrase', detail: '"rockstar" in text' },
    ]);
  });

  it('allows a year in range, but not one outside it, part of a decimal, or a status code', () => {
    expect(audit('allowlisted')).toEqual([]);
    expect(auditHtml(fixture('allowlisted').replace('2030', '2031'), ctx())).toEqual([stray('"2031" in text')]);
    expect(auditHtml(page('<p>Version 2030.5 shipped.</p>'), ctx())).toEqual([stray('"2030.5" in text')]);
    const notFound = page('<p>404</p>');
    expect(auditHtml(notFound, ctx({ route: '/_not-found' }))).toEqual([stray('"404" in text', '/_not-found')]);
  });
});

describe('routeOf', () => {
  it('maps built html files to routes', () => {
    expect(routeOf('.next/server/app/work/retention.html')).toBe('/work/retention');
    expect(routeOf('.next/server/app/_not-found.html')).toBe('/_not-found');
    expect(routeOf('.next/server/app/index.html')).toBe('/');
    expect(routeOf('index.html')).toBe('/');
  });
});

describe('truth-audit CLI', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'truth-audit-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const build = (files: Record<string, string>) => {
    for (const [route, name] of Object.entries(files)) {
      const file = join(dir, '.next/server/app', route);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, fixture(name));
    }
  };
  // The parent's CI and TRUTH_DENYLIST never leak into the child.
  const run = (env: Record<string, string>) => {
    const base = { ...process.env };
    delete base.CI;
    delete base.TRUTH_DENYLIST;
    try {
      const stdout = execFileSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', SCRIPT], {
        cwd: dir,
        env: { ...base, ...env },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: 0, stdout, stderr: '' };
    } catch (e) {
      const err = e as { status: number; stdout: string; stderr: string };
      return { status: err.status, stdout: err.stdout, stderr: err.stderr };
    }
  };

  it('fails in CI when TRUTH_DENYLIST is unset', () => {
    build({ 'index.html': 'clean' });
    const r = run({ CI: 'true' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('TRUTH_DENYLIST missing in CI');
  });

  it('fails in CI when TRUTH_DENYLIST is empty, as an unset Actions secret is', () => {
    build({ 'index.html': 'clean' });
    const r = run({ CI: 'true', TRUTH_DENYLIST: ' \n\n ' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('TRUTH_DENYLIST missing in CI');
  });

  it('skips the deny-list locally with a notice and reports a clean build', () => {
    build({ 'index.html': 'clean', '_not-found.html': 'allowlisted' });
    const r = run({});
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('deny-list skipped (no TRUTH_DENYLIST)');
    expect(r.stdout).toContain('truth audit: 2 pages, 0 findings');
  });

  it('prints one line per finding, with the deny-list term by index only, and exits 1', () => {
    build({ 'index.html': 'clean', 'work/retention.html': 'stray', 'notes.html': 'denylist' });
    const r = run({ CI: 'true', TRUTH_DENYLIST: '\n  Secretword  \n' });
    expect(r.status).toBe(1);
    expect(r.stdout.trim().split('\n').sort()).toEqual([
      '/notes denylisted deny-list term #1',
      '/work/retention stray-number "1,353" in text',
    ]);
    expect((r.stdout + r.stderr).toLowerCase()).not.toContain('secretword');
  });

  it('fails when there are no built pages to audit', () => {
    const r = run({});
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no built pages');
  });
});
