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
    // The raw-HTML pass also sees the term in the attribute.
    expect(findings).toEqual([
      { route: '/', kind: 'unknown-fact', detail: 'data-fact "[deny-list term #1].a.b"' },
      { route: '/', kind: 'denylisted', detail: 'deny-list term #1' },
    ]);
    expect(JSON.stringify(findings).toLowerCase()).not.toContain('secretword');
  });

  describe('deny-list terms that span nodes or hide outside scanned text', () => {
    const term = 'Secret word';
    const hit = [{ route: '/', kind: 'denylisted', detail: 'deny-list term #1' }];
    const cases: [string, string][] = [
      ['split by inline markup', page('<p><em>Secret</em> word</p>')],
      ['split mid-word by inline markup', page('<p><strong>Secret</strong> <b>wo</b>rd</p>')],
      ['split by a React text separator comment', page('<p>Secret<!-- --> word</p>')],
      ['joined by a non-breaking space', page('<p>Secret word</p>')],
      ['inside a data-fact element', page('<p><data value="3" data-fact="profile.audible.teams">secret word</data></p>')],
      ['only in a script payload', page('<p>Hi.</p><script>self.__next_f.push([1,"secret word"])</script>')],
      ['only in an href slug', page('<p><a href="/work/secret word-notes">Notes</a></p>')],
    ];
    it.each(cases)('finds a term %s, by index only', (_name, html) => {
      const findings = auditHtml(html, ctx({ denylist: [term] }));
      expect(findings).toEqual(hit);
      expect(JSON.stringify(findings).toLowerCase()).not.toContain('secret');
    });

    it('matches a non-breaking space in the term against a normal space in the text', () => {
      expect(auditHtml(page('<p>Secret word</p>'), ctx({ denylist: ['secret word'] }))).toEqual(hit);
    });

    it('redacts a whitespace-variant term from other finding details', () => {
      const html = page('<p><data value="1" data-fact="secret word.a.b">1</data></p>');
      const findings = auditHtml(html, ctx({ denylist: [term] }));
      expect(findings).toEqual([
        { route: '/', kind: 'unknown-fact', detail: 'data-fact "[deny-list term #1].a.b"' },
        { route: '/', kind: 'denylisted', detail: 'deny-list term #1' },
      ]);
      expect(JSON.stringify(findings).toLowerCase()).not.toContain('secret');
    });
  });

  it('redacts a deny-list term from the route', () => {
    const findings = auditHtml(fixture('stray'), ctx({ route: '/secretword-notes', denylist: ['Secretword'] }));
    expect(findings).toEqual([stray('"1,353" in text', '/[deny-list term #1]-notes')]);
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

describe('framework routes', () => {
  const global = { route: '/_global-error' };
  const html = page('<p>Ran 500 tests</p>', '<title>500: This page couldn’t load</title>');

  it('skips stray-number findings on /_global-error', () => {
    expect(auditHtml(html, ctx(global))).toEqual([]);
  });

  it.each(['/_not-found', '/about'])('still flags the same stray numbers on %s', (route) => {
    expect(auditHtml(html, ctx({ route }))).toEqual([
      stray('"500" in <title>', route),
      stray('"500" in text', route),
    ]);
  });

  it('still reports a deny-list term on /_global-error, by index only', () => {
    const findings = auditHtml(page('<p>Secretword 500</p>'), ctx({ ...global, denylist: ['other', 'Secretword'] }));
    expect(findings).toEqual([{ route: '/_global-error', kind: 'denylisted', detail: 'deny-list term #2' }]);
  });

  it('still validates data-derived on /_global-error', () => {
    const findings = auditHtml(page('<p data-derived>1</p><p data-derived="nope">2</p>'), ctx(global));
    expect(findings).toEqual([
      { route: '/_global-error', kind: 'bad-derived', detail: 'data-derived is empty' },
      { route: '/_global-error', kind: 'bad-derived', detail: 'data-derived "nope"' },
    ]);
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

  it('never prints a deny-list term that is part of a page file name', () => {
    build({ 'secretword-notes.html': 'stray' });
    const r = run({ TRUTH_DENYLIST: 'Secretword' });
    expect(r.status).toBe(1);
    expect(r.stdout.trim().split('\n')).toEqual(['/[deny-list term #1]-notes stray-number "1,353" in text']);
    expect((r.stdout + r.stderr).toLowerCase()).not.toContain('secretword');
  });

  it('fails when there are no built pages to audit', () => {
    const r = run({});
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no built pages');
  });
});

describe('auditHtml hardening', () => {
  const denyHit = [{ route: '/', kind: 'denylisted', detail: 'deny-list term #1' }];

  describe('head meta tags', () => {
    it('reads only the text properties, so image and url metadata never false-positive', () => {
      const head =
        '<title>Page</title>' +
        '<meta property="og:image" content="https://example.test/og-7.png?v=3">' +
        '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' +
        '<meta property="og:url" content="https://example.test/2026/10"><meta property="og:type" content="website">' +
        '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="https://example.test/og-7.png">';
      expect(auditHtml(page('<p>Hi.</p>', head), ctx())).toEqual([]);
    });

    it('still reads title, description and image alt text in both og: and twitter:', () => {
      const head =
        '<title>Page</title>' +
        '<meta property="og:title" content="5 tests"><meta property="og:description" content="6 tests">' +
        '<meta property="og:image:alt" content="7 bars"><meta name="twitter:title" content="8 tests">' +
        '<meta name="twitter:description" content="9 tests"><meta name="twitter:image:alt" content="4 bars">' +
        '<meta name="description" content="13 tests">';
      expect(auditHtml(page('<p>Hi.</p>', head), ctx()).map((f) => f.detail)).toEqual([
        '"5" in meta og:title',
        '"6" in meta og:description',
        '"7" in meta og:image:alt',
        '"8" in meta twitter:title',
        '"9" in meta twitter:description',
        '"4" in meta twitter:image:alt',
        '"13" in meta description',
      ]);
    });
  });

  describe('invisible characters', () => {
    const term = 'Secret word';
    const cases: [string, string][] = [
      ['a zero-width space', 'Sec​ret word'],
      ['a zero-width joiner', 'Secret‍ word'],
      ['a word joiner', 'Secret wo⁠rd'],
      ['a byte-order mark', '﻿Secret word'],
      ['a soft hyphen', 'Secret&shy; word'],
    ];
    it.each(cases)('finds a term hidden by %s', (_name, text) => {
      const findings = auditHtml(page(`<p>${text}</p>`), ctx({ denylist: [term] }));
      expect(findings).toEqual(denyHit);
    });

    it('finds a term hidden in the raw html outside scanned text', () => {
      const html = page('<p>Hi.</p><script>self.__next_f.push([1,"sec​ret­ word"])</script>');
      expect(auditHtml(html, ctx({ denylist: [term] }))).toEqual(denyHit);
    });

    it('ignores invisible characters inside the term too', () => {
      expect(auditHtml(page('<p>secret word</p>'), ctx({ denylist: ['Se​cret­ word'] }))).toEqual(denyHit);
    });

    it('redacts a term from other details even when the page hides it with invisible characters', () => {
      const html = page('<p><data value="1" data-fact="sec​ret word.a.b">1</data></p>');
      const findings = auditHtml(html, ctx({ denylist: [term] }));
      expect(findings).toEqual([
        { route: '/', kind: 'unknown-fact', detail: 'data-fact "[deny-list term #1].a.b"' },
        { route: '/', kind: 'denylisted', detail: 'deny-list term #1' },
      ]);
      expect(JSON.stringify(findings).toLowerCase()).not.toContain('secret');
    });
  });

  describe('banned phrases', () => {
    const cases: [string, string, string][] = [
      ['a space', 'An AI powered tool.', 'AI powered'],
      ['a non-breaking hyphen (U+2011)', 'An AI‑powered tool.', 'AI‑powered'],
      ['an en dash', 'An AI–powered tool.', 'AI–powered'],
      ['a zero-width space inside', 'An AI​-powered tool.', 'AI-powered'],
      ['a soft hyphen', 'An AI&shy;powered tool.', 'AIpowered'],
      ['a soft hyphen inside another word', 'Very pass&shy;ionate.', 'passionate'],
    ];
    it.each(cases)('flags AI-powered written with %s', (_name, text, shown) => {
      expect(auditHtml(page(`<p>${text}</p>`), ctx())).toEqual([
        { route: '/', kind: 'banned-phrase', detail: `"${shown}" in text` },
      ]);
    });

    it('does not flag unrelated words', () => {
      expect(auditHtml(page('<p>Said the maid, powered by wind. Paid powered.</p>'), ctx())).toEqual([]);
    });
  });

  describe('more attributes', () => {
    it.each(['aria-description', 'aria-roledescription', 'placeholder'])('flags a stray number in %s', (name) => {
      expect(auditHtml(page(`<div ${name}="Step 42 of those"></div>`), ctx())).toEqual([stray(`"42" in ${name}`)]);
    });

    it('flags a stray number in an input value', () => {
      expect(auditHtml(page('<input type="number" value="20">'), ctx())).toEqual([stray('"20" in value')]);
    });

    it('covers an input value inside a data-derived element', () => {
      const html = page('<div data-derived="simulated"><input type="number" value="20"></div>');
      expect(auditHtml(html, ctx())).toEqual([]);
    });

    it('skips hidden inputs, whose value is form plumbing (React form actions hold JSON with digits)', () => {
      const hidden = '<input type="hidden" name="$ACTION_REF_1" value="{&quot;id&quot;:&quot;40a1&quot;,&quot;bound&quot;:2}">';
      expect(auditHtml(page(hidden), ctx())).toEqual([]);
      expect(auditHtml(page('<input type="HIDDEN" value="20">'), ctx())).toEqual([]);
      // A visible input with digits and no marker still reports; a marked one does not.
      expect(auditHtml(page('<input type="text" value="20">'), ctx())).toEqual([stray('"20" in value')]);
      expect(auditHtml(page('<div data-derived="live"><input type="text" value="20"></div>'), ctx())).toEqual([]);
    });

    it('does not read the value attribute of other elements', () => {
      expect(auditHtml(page('<data value="20">x</data><li value="3">y</li>'), ctx())).toEqual([]);
    });

    it('checks the deny-list in these attributes', () => {
      const html = page('<input value="secret word"><p aria-description="secret word"></p>');
      expect(auditHtml(html, ctx({ denylist: ['secret word'] }))).toEqual(denyHit);
    });
  });
});

describe('script exit handling', () => {
  it.each(['truth-audit.ts', 'sync-sources.ts'])('%s sets process.exitCode instead of calling process.exit', (name) => {
    const text = readFileSync(new URL(`../../scripts/${name}`, import.meta.url).pathname, 'utf8');
    expect(text).not.toMatch(/process\.exit\(/);
    expect(text).toMatch(/process\.exitCode =/);
  });
});
