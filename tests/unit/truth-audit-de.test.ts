import { FACTS } from '../../src/lib/facts/index.ts';
import { KIT_TEXT_EN } from '../../src/components/kit/text.ts';
import { KIT_TEXT_DE } from '../../content/de/kit.ts';
import { SHELL_EN } from '../../content/shell.ts';
import { SHELL_DE } from '../../content/de/shell.ts';
import { auditHtml, englishLeakStrings, type AuditContext, type Finding } from '../../scripts/truth-audit.ts';

// A fixed display list, as in truth-audit.test.ts, so a stray number cannot match a real fact display.
const ctx = (over: Partial<AuditContext> = {}): AuditContext => ({
  route: '/de/work',
  factIds: new Set(Object.keys(FACTS)),
  factDisplays: ['1.067', '25+', '85 %'],
  denylist: [],
  document: true,
  ...over,
});
const doc = (lang: string | null, body: string, head = '<title>Seite</title>') =>
  `<!DOCTYPE html><html${lang === null ? '' : ` lang="${lang}"`}><head>${head}</head><body>${body}</body></html>`;
const LINKS = '<nav><a href="/de">Start</a> <a href="/de/lab">Lab</a></nav>';
const dePage = (body = '<p>Hallo.</p>', head?: string) => doc('de', `${LINKS}${body}`, head);
const kinds = (fs: Finding[]) => fs.map((f) => f.kind);

describe('German pages in the truth audit', () => {
  it('passes a clean German page', () => {
    expect(auditHtml(dePage(), ctx())).toEqual([]);
  });

  it('rejects a German page with lang en, and an English page with lang de', () => {
    expect(auditHtml(doc('en', `${LINKS}<p>Hallo.</p>`), ctx())).toEqual([
      { route: '/de/work', kind: 'wrong-lang', detail: '<html lang="en">, expected "de"' },
    ]);
    expect(auditHtml(doc('de', '<p>Hi.</p>'), ctx({ route: '/work' }))).toEqual([
      { route: '/work', kind: 'wrong-lang', detail: '<html lang="de">, expected "en"' },
    ]);
    expect(kinds(auditHtml(doc(null, '<p>Hi.</p>'), ctx({ route: '/' })))).toEqual(['wrong-lang']);
  });

  it('does not check the lang of the framework page the site does not author', () => {
    expect(auditHtml(doc(null, '<p>Hi.</p>'), ctx({ route: '/_global-error' }))).toEqual([]);
  });

  it.each(['KI-gestützt', 'KI-basierte Analyse', 'leidenschaftlicher Analyst', 'Rockstars', 'ki gestützte'])(
    'rejects the banned German phrase "%s"',
    (phrase) => {
      expect(kinds(auditHtml(dePage(`<p>Ich bin ${phrase}.</p>`), ctx()))).toEqual(['banned-phrase']);
    },
  );

  it('applies the German banned phrases on German routes only', () => {
    expect(auditHtml(doc('en', '<p>A Rockstar.</p>'), ctx({ route: '/work' })).map((f) => f.kind)).toEqual(['banned-phrase']);
    expect(auditHtml(doc('en', '<p>leidenschaftlich</p>'), ctx({ route: '/work' }))).toEqual([]);
  });

  it('rejects an English kit string and an English shell label on a German page', () => {
    const kit = auditHtml(dePage('<p>Show the numbers as a table</p>'), ctx());
    expect(kit).toEqual([{ route: '/de/work', kind: 'english-leak', detail: '"Show the numbers as a table" in text' }]);
    const shell = auditHtml(dePage('<a href="#main">Skip to content</a>'), ctx());
    expect(kinds(shell)).toEqual(['english-leak']);
    const attr = auditHtml(dePage('<button aria-label="Controls need JavaScript.">x</button>'), ctx());
    expect(new Set(kinds(attr))).toEqual(new Set(['english-leak']));
  });

  it('does not run the English leak check on an English page', () => {
    expect(auditHtml(doc('en', '<p>Show the numbers as a table</p>'), ctx({ route: '/work' }))).toEqual([]);
  });

  it('finds no English string in the German kit and shell words', () => {
    const html = dePage(
      `<p>${[JSON.stringify(KIT_TEXT_DE), JSON.stringify(SHELL_DE)].join(' ')}</p>`,
    );
    expect(auditHtml(html, ctx({ factDisplays: [] })).filter((f) => f.kind === 'english-leak')).toEqual([]);
  });

  it('builds the leak list from the English kit and shell, templates and sentences included', () => {
    const list = englishLeakStrings();
    expect(list).toContain(KIT_TEXT_EN.table.show);
    expect(list).toContain(SHELL_EN.skip);
    expect(list).toContain(SHELL_EN.notFound.title);
    expect(list).not.toContain(SHELL_EN.language.english);
    expect(list.every((s) => s.length >= 5)).toBe(true);
  });

  it('rejects an English internal link on a German page', () => {
    const html = doc('de', `${LINKS}<a href="/work">Work</a>`);
    expect(auditHtml(html, ctx({ pages: ['/work'] }))).toEqual([
      { route: '/de/work', kind: 'bad-link', detail: '"/work" does not stay in German' },
    ]);
    const group = doc('de', `${LINKS}<a href="/v/a">Start</a>`);
    expect(kinds(auditHtml(group, ctx({ pages: ['/work'] })))).toEqual(['bad-link']);
  });

  it('accepts /de links, query and hash, and a link that passes through localHref unchanged', () => {
    const html = doc(
      'de',
      `${LINKS}<a href="/de?x=1">a</a><a href="/de/lab#peeking">b</a><a href="/cv.pdf">c</a><a href="#top">d</a><a href="https://x.example/">e</a>`,
    );
    expect(auditHtml(html, ctx({ pages: ['/work'] }))).toEqual([]);
  });

  it('rejects a German page with no internal links to examine', () => {
    const none = doc('de', '<p>Hallo.</p><a href="https://example.org/">x</a><a href="#top">y</a>');
    expect(auditHtml(none, ctx())).toEqual([
      { route: '/de/work', kind: 'bad-link', detail: 'no internal links were examined' },
    ]);
  });

  it('does not run the link check on English pages', () => {
    expect(auditHtml(doc('en', '<p>Hi.</p>'), ctx({ route: '/work' }))).toEqual([]);
  });

  it('rejects an unknown number in a German title and meta, and passes a German fact display', () => {
    const bad = auditHtml(dePage('<p>Hi.</p>', '<title>Über 1.234 Besucher</title>'), ctx());
    expect(bad).toEqual([{ route: '/de/work', kind: 'stray-number', detail: '"1.234" in <title>' }]);
    const meta = auditHtml(dePage('<p>Hi.</p>', '<title>Seite</title><meta name="description" content="Rund 77 Tests">'), ctx());
    expect(kinds(meta)).toEqual(['stray-number']);
    const ok = auditHtml(dePage('<p>Hi.</p>', '<title>1.067 Besucher, 85 % Quote</title>'), ctx());
    expect(ok).toEqual([]);
  });

  it('allows the German citations on /de/privacy only, and the twins of the English entries', () => {
    const cite = '<p>Art. 6 Abs. 1 lit. f DSGVO und § 25 Abs. 2 Nr. 2 TDDDG, Art. 13, § 5 Abs. 1.</p>';
    expect(auditHtml(dePage(cite), ctx({ route: '/de/privacy' }))).toEqual([]);
    expect(kinds(auditHtml(dePage(cite), ctx({ route: '/de/work' }))).every((k) => k === 'stray-number')).toBe(true);
    expect(auditHtml(dePage(cite), ctx({ route: '/de/work' })).length).toBeGreaterThan(0);
    const en = '<p>Art. 6(1)(f), § 25(2) No. 2 TDDDG</p>'.replace('§ 25(2)', '§25(2)');
    expect(auditHtml(dePage(`${en}<p>IPv4</p>`), ctx({ route: '/de/privacy' }))).toEqual([]);
    expect(auditHtml(dePage('<p>python3</p>'), ctx({ route: '/de/experiment' }))).toEqual([]);
    expect(auditHtml(dePage('<p>OAuth2 und F1</p>'), ctx({ route: '/de/cv' }))).toEqual([]);
    expect(kinds(auditHtml(dePage('<p>python3</p>'), ctx({ route: '/de/lab' })))).toEqual(['stray-number']);
  });
});

describe('a fragment (a rendered component, not a built page)', () => {
  it('skips the page-level checks: no lang on <html> and no links are not findings', () => {
    expect(auditHtml('<!doctype html><html><body><p>Hallo.</p></body></html>', ctx({ document: false }))).toEqual([]);
  });
});

describe('the language menu', () => {
  it('lets the English link (hreflang="en") leave German, and still flags a plain English link', () => {
    const page = (a: string) => `<!doctype html><html lang="de"><body><a href="/de/work">Projekte</a>${a}</body></html>`;
    expect(auditHtml(page('<a href="/work" hreflang="en" lang="en">English</a>'), ctx({ pages: ['/work'] }))).toEqual([]);
    expect(kinds(auditHtml(page('<a href="/work">Projekte</a>'), ctx({ pages: ['/work'] })))).toEqual(['bad-link']);
  });
});
