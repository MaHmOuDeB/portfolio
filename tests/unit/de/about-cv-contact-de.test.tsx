// The German About, CV and Contact pages: the English outline and ids, German words everywhere the
// frame, the kit and the pages print any, the Facts, the truth words, the language row at B1, the
// contact form's German messages and the redirect that is never built from input.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/de/about', redirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '198.51.100.7' }) }));
vi.mock('@/lib/i18n/pages', () => ({
  DE_PAGES: ['/', '/work', '/work/retention', '/work/pulse', '/work/docproof', '/work/n8n', '/work/weather', '/work/marketingws', '/work/audible', '/experiment', '/lab', '/about', '/cv', '/contact', '/privacy'],
}));

import { ABOUT_DE, CV_DE } from '../../../content/de/about';
import { CONTACT_DE, ERRORS_DE } from '../../../content/de/contact';
import { ABOUT_EN, CV_EN, LANGUAGES } from '../../../content/about';
import { CONTACT_EN } from '../../../content/contact';
import { AboutPage } from '@/components/about/AboutPage';
import { CvPage } from '@/components/about/CvPage';
import { ContactPageBody } from '@/components/contact/ContactPageBody';
import { contactStateTitle, contactMetadata } from '@/lib/contact/title';
import { ERRORS, FIELD_ORDER, readLocale, validate } from '@/lib/contact/fields';
import { handleContact, type ContactContext } from '@/lib/contact/handle';
import { createContactLimiter } from '@/lib/contact/limiter';
import { contactConfig, deliver } from '@/lib/contact/send';
import { FACTS, FACT_DISPLAYS_DE } from '@/lib/facts';
import { aroundPlaceholder } from '@/components/kit/text';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { withoutCta } from '../page-cta';
import { decode, text } from '../build-notes/helpers';

const PDF = JSON.stringify({ sha256: 'a'.repeat(64), renderedAt: '2026-11-12T10:00:00Z', bytes: 86_016 });
// The pages are rendered once, below, so the build's PDF is set before that.
process.env.CV_PDF = PDF;

const render = (el: React.ReactElement) => renderToStaticMarkup(el);
const ids = (m: string) => [...m.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]).sort();
const facts = (m: string) => [...m.matchAll(/data-fact="([^"]+)"/g)].map((x) => x[1]);
const claims = (m: string) => [...m.matchAll(/data-cv-claim="([^"]+)"/g)].map((x) => x[1]);
const hrefs = (m: string) => [...m.matchAll(/<a [^>]*href="([^"]+)"/g)].map((x) => decode(x[1]!));
const prose = (m: string) => text(m);

const PAGES = {
  about: { route: '/about', en: withoutCta(render(<AboutPage />)), de: withoutCta(render(<AboutPage locale="de" />)) },
  cv: { route: '/cv', en: withoutCta(render(<CvPage />)), de: withoutCta(render(<CvPage locale="de" />)) },
  contact: { route: '/contact', en: render(<ContactPageBody sent={false} />), de: render(<ContactPageBody locale="de" sent={false} />) },
} as const;
const NAMES = Object.keys(PAGES) as (keyof typeof PAGES)[];

describe('every German page', () => {
  it.each(NAMES)('%s: keeps the English ids, and the Facts of the English page', (name) => {
    const { en, de } = PAGES[name];
    expect(ids(de)).toEqual(ids(en));
    expect(facts(de)).toEqual(facts(en));
  });

  it.each(NAMES)('%s: every internal link stays in German or is on the pass-through list', (name) => {
    const list = hrefs(PAGES[name].de);
    expect(list.length).toBeGreaterThan(0);
    for (const h of list) {
      if (!h.startsWith('/')) continue;
      expect(h.startsWith('/de') || h.startsWith('/cv.pdf') || h.startsWith('/images/') || h.startsWith('/_next/'), h).toBe(true);
    }
  });

  it.each(NAMES)('%s: passes the truth audit with German displays', (name) => {
    const html = `<!doctype html><html lang="de"><head><title>t</title></head><body>${PAGES[name].de}</body></html>`;
    expect(
      auditHtml(html, {
        route: PAGES[name].route,
        factIds: new Set(Object.keys(FACTS)),
        factDisplays: FACT_DISPLAYS_DE,
        denylist: [],
        pages: ['/work', '/work/retention', '/work/pulse', '/work/docproof', '/work/n8n', '/experiment', '/about', '/cv', '/contact', '/privacy'],
      }),
    ).toEqual([]);
  });

  it.each(NAMES)('%s: leaks no English from the page, the frame or the kit', (name) => {
    const words = prose(PAGES[name].de);
    for (const w of [
      'Read my CV', 'Write to me', 'Open to roles', 'Find out what I can do', 'Timeline', 'Languages', 'Summary', 'Experience', 'Education', 'Projects',
      'Print this page', 'Download CV', 'Contact', 'Send message', 'Message', 'All fields are required', 'Choose one', 'Want the facts first', 'Technologies',
      'Show the numbers as a table', 'Working student', 'to present', 'Berlin, Germany',
    ]) {
      expect(words, w).not.toMatch(new RegExp(`(^|[^\\p{L}-])${w}([^\\p{L}-]|$)`, 'u'));
    }
  });

  it.each(NAMES)('%s: uses none of the banned or truth-rule words', (name) => {
    const words = prose(PAGES[name].de);
    for (const bad of ['KI-gestützt', 'KI-basiert', 'KI-getrieben', 'leidenschaftlich', 'Rockstar', 'definiert', 'verantwortet', 'geleitet', 'entworfen und durchgeführt']) {
      expect(words, bad).not.toMatch(new RegExp(`(^|[^\\p{L}])${bad}`, 'u'));
    }
  });
});

describe('the German About page', () => {
  const de = PAGES.about.de;
  const words = prose(de);

  it('has the English sections in order, with German titles', () => {
    expect([...de.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1])).toEqual([...PAGES.about.en.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]));
    expect(words).toContain('Werdegang');
    expect(words).toContain('Tools und wo ich sie genutzt habe');
    expect(de).toContain('data-home-faq');
    expect(de).toContain('data-home-questions');
  });

  it('says Werkstudent, three teams one after another and the tool with its recorder', () => {
    expect(words).toContain('Werkstudent');
    expect(words).toMatch(/nacheinander mit 3 Teams gearbeitet/);
    expect(words).toContain('Tampermonkey mit einem Schritt-Rekorder');
    expect(words).not.toContain('gleichzeitig');
  });

  it('prints months with Intl and "bis" and "heute" inside <time>', () => {
    expect(de).toContain('<time dateTime="2026-10">Oktober 2026</time> bis heute');
    expect(de).toContain('<time dateTime="2023-08">August 2023</time> bis <time dateTime="2025-04">April 2025</time>');
  });

  it('keeps German at B1 and never says fluent next to it', () => {
    const row = /<dt[^>]*>Deutsch<\/dt><dd[^>]*>([^<]*)<\/dd>/.exec(de);
    expect(row?.[1]).toBe('B1');
    expect(LANGUAGES.find((l) => l.language === 'German')?.level).toBe('B1');
    expect(words).not.toMatch(/Deutsch[ :(]*(fließend|verhandlungssicher|sehr gute)/);
  });

  it('describes the photograph in German and links the German CV and contact pages', () => {
    expect(de).toContain(`alt="${ABOUT_DE.ui.photoAlt}"`);
    expect(hrefs(de)).toContain('/de/cv');
  });
});

describe('the German CV page', () => {
  const de = PAGES.cv.de;
  const words = prose(de);

  it('has the same data-cv-claim ids as the English page', () => {
    expect(claims(de)).toEqual(claims(PAGES.cv.en));
    expect(claims(de).length).toBeGreaterThan(20);
  });

  it('links the English PDF with hreflang en and the German label', () => {
    expect(de).toMatch(/<a href="\/cv\.pdf" hreflang="en" download=""[^>]*>/i);
    expect(words).toContain('Lebenslauf (PDF, Englisch, 84 KB)');
    expect(PAGES.cv.en).toContain('Download CV (PDF, <data value="84" data-derived="build">84</data> KB)');
    expect(PAGES.cv.en).not.toMatch(/hreflang/i);
  });

  it('prints "Seite drucken" and the German section titles', () => {
    expect(words).toContain('Seite drucken');
    expect([...de.matchAll(/<h2 id="[^"]+-title"[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1])).toEqual([
      'Zusammenfassung', 'Berufserfahrung', 'Kenntnisse', 'Ausbildung', 'Sprachen', 'Projekte',
    ]);
  });

  it('keeps the truth words of the rebuilt, sized and designed projects', () => {
    expect(words).toContain('Werkstudent');
    expect(words).toContain('einem öffentlichen Datensatz');
    expect(words).toContain('2026 neu aufgebaut');
    expect(words).toContain('dimensioniert');
    expect(words).toContain('entworfen und gebaut');
    expect(words).toContain('Textvarianten');
    expect(words).toContain('Tampermonkey mit einem Schritt-Rekorder');
    expect(words).not.toMatch(/Retention-Test entworfen|durchgeführt/);
  });

  it('carries the adoption figure with its context', () => {
    expect(words).toMatch(/meiner Empfehlungen wurden übernommen: Viele Tests waren Wetten auf Personalisierung/);
  });
});

describe('the German contact page', () => {
  const de = PAGES.contact.de;
  const words = prose(de);

  it('has German words, the hidden locale field and the German privacy link; English has no locale field', () => {
    expect(words).toContain('Schreiben Sie mir, ich antworte per E-Mail.');
    expect(words).toContain('Alle Felder sind Pflichtfelder.');
    expect(words).toContain('Bitte wählen');
    expect(words).toContain('Stellenangebot');
    expect(de).toContain('<input type="hidden" name="locale" value="de"/>');
    expect(PAGES.contact.en).not.toContain('name="locale"');
    expect(de).toContain('href="/de/privacy#contact-form"');
    expect(PAGES.contact.en).toContain('href="/privacy#contact-form"');
    expect(de).toMatch(/Bis zu <data[^>]*>4000<\/data> Zeichen|Bis zu .*4\.000.* Zeichen/);
  });

  it('keeps the option values and the field names', () => {
    for (const v of ['job', 'interview', 'project', 'privacy', 'other']) expect(de).toContain(`value="${v}"`);
    for (const n of FIELD_ORDER) expect(de).toContain(`name="${n}"`);
  });

  it('never promises a reply in German and never invites German', () => {
    const sentHtml = render(<ContactPageBody locale="de" sent />);
    const sent = prose(sentHtml);
    expect(hrefs(sentHtml)).toEqual(expect.arrayContaining(['/de/contact', '/de/work']));
    expect(sent).toContain('Nachricht gesendet');
    expect(sent).toContain('Ich antworte von meiner eigenen E-Mail-Adresse.');
    for (const t of [words, sent]) expect(t).not.toMatch(/auf Deutsch|deutschsprachig|Deutsch antworte/);
  });

  it('titles the German states with German words and the site name', () => {
    expect(contactStateTitle('sent', 'de')).toBe('Nachricht gesendet: Kontakt | Mahmoud El Bergui');
    expect(contactStateTitle('not-sent', 'de')).toBe('Nachricht nicht gesendet: Kontakt | Mahmoud El Bergui');
    expect(contactMetadata(new Headers(), false, 'de').title).toBe('Kontakt | Mahmoud El Bergui');
    expect(contactMetadata(new Headers({ 'content-type': 'multipart/form-data; boundary=x' }), false, 'de').title).toBe('Nachricht nicht gesendet: Kontakt | Mahmoud El Bergui');
    expect(contactMetadata(new Headers(), false).title).toBe('Contact | Mahmoud El Bergui');
  });
});

describe('the German contact messages and server', () => {
  it('has the English messages shape and names no number', () => {
    for (const k of Object.keys(ERRORS) as (keyof typeof ERRORS)[]) expect(Object.keys(ERRORS_DE[k]).sort()).toEqual(Object.keys(ERRORS[k]).sort());
    for (const m of Object.values(ERRORS_DE).flatMap((e) => Object.values(e))) expect(m).not.toMatch(/\d/);
  });

  it('validates with the messages it is given: German on request, English by default', () => {
    const empty = { name: '', email: '', reason: '', subject: '', message: '' };
    expect(validate(empty).name).toBe(ERRORS.name.empty);
    expect(validate(empty, ERRORS_DE).name).toBe(ERRORS_DE.name.empty);
    expect(ERRORS_DE.name.empty).not.toBe(ERRORS.name.empty);
  });

  it('reads the locale field: ours, else English', () => {
    const fd = (v?: string) => {
      const f = new FormData();
      if (v !== undefined) f.set('locale', v);
      return f;
    };
    expect(readLocale(fd('de'))).toBe('de');
    expect(readLocale(fd('en'))).toBe('en');
    for (const bad of [undefined, 'DE', 'de ', '//evil', 'https://x', '', 'fr']) expect(readLocale(fd(bad)), String(bad)).toBe('en');
  });

  const NOW = 1_700_000_000_000;
  const FIELDS = { name: 'Ada', email: 'ada@example.test', reason: 'job', subject: 'Hallo', message: 'Guten Tag', contact_hp: '', issuedAt: String(NOW - 10_000) };
  function context(sent: { m: unknown[] }): ContactContext {
    return {
      now: () => NOW,
      ip: '198.51.100.7',
      limiter: createContactLimiter({ now: () => NOW, schedule: () => {} }),
      log: () => {},
      deliver: (m) => {
        sent.m.push(m);
        return Promise.resolve('sent');
      },
    };
  }
  const form = (patch: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ ...FIELDS, ...patch })) f.set(k, v);
    return f;
  };

  it('answers an invalid German form in German and an invalid English one in English', async () => {
    const sent = { m: [] as unknown[] };
    const de = await handleContact(form({ locale: 'de', name: '' }), context(sent));
    const en = await handleContact(form({ name: '' }), context(sent));
    const odd = await handleContact(form({ locale: 'xx', name: '' }), context(sent));
    expect(de.status === 'invalid' && de.errors.name).toBe(ERRORS_DE.name.empty);
    expect(en.status === 'invalid' && en.errors.name).toBe(ERRORS.name.empty);
    expect(odd.status === 'invalid' && odd.errors.name).toBe(ERRORS.name.empty);
  });

  it('still sends the owner an English subject and body for a German form', async () => {
    const requests: string[] = [];
    const result = await deliver(
      { name: 'Ada', email: 'ada@example.test', reason: 'job', subject: 'Hallo', message: 'Guten Tag' },
      contactConfig({ vercelEnv: 'production', fakeStore: false, resendApiKey: 'k', contactToEmail: 'a@example.test' } as never),
      { fetch: (async (_u: unknown, init?: RequestInit) => { requests.push(String(init?.body)); return new Response('{}', { status: 200 }); }) as typeof fetch, log: () => {} },
    );
    expect(result).toBe('sent');
    const body = JSON.parse(requests[0]!);
    expect(body.subject).toBe('[Portfolio] Job opportunity: Hallo');
    expect(body.text).toContain('Reason: Job opportunity');
    expect(body.text).not.toMatch(/Stellenangebot|Nachricht:/);
  });

  it('redirects to a constant target per language, whatever the locale field holds', async () => {
    const { sendContact } = await import('@/app/(en)/contact/actions');
    const go = async (locale?: string) => {
      const f = form({ contact_hp: 'bot', ...(locale === undefined ? {} : { locale }) });
      try {
        await sendContact({ status: 'idle' }, f);
      } catch (e) {
        return String((e as Error).message).replace('REDIRECT ', '');
      }
      return 'none';
    };
    expect(await go()).toBe('/contact?sent=1');
    expect(await go('en')).toBe('/contact?sent=1');
    expect(await go('de')).toBe('/de/contact?sent=1');
    for (const bad of ['DE', 'de ', '//evil', 'https://x', '/de/../x']) expect(await go(bad), bad).toBe('/contact?sent=1');
  });
});

describe('the German copy types', () => {
  it('have the English objects’ keys, ids and month ranges', () => {
    expect(Object.keys(ABOUT_DE).sort()).toEqual(Object.keys(ABOUT_EN).sort());
    expect(Object.keys(CV_DE).sort()).toEqual(Object.keys(CV_EN).sort());
    expect(Object.keys(CONTACT_DE).sort()).toEqual(Object.keys(CONTACT_EN).sort());
    expect(ABOUT_DE.timeline.map((t) => t.range)).toEqual(ABOUT_EN.timeline.map((t) => t.range));
    expect(ABOUT_DE.story.length).toBe(ABOUT_EN.story.length);
    expect(ABOUT_DE.tools.length).toBe(ABOUT_EN.tools.length);
    for (const key of ['experience', 'education', 'projects'] as const) {
      expect(CV_DE[key].map((e) => [e.id, e.claims.map((c) => c.id), e.range])).toEqual(CV_EN[key].map((e) => [e.id, e.claims.map((c) => c.id), e.range]));
    }
    expect(CV_DE.summary.map((c) => c.id)).toEqual(CV_EN.summary.map((c) => c.id));
  });

  it('keep every placeholder of the contact templates', () => {
    for (const copy of [CONTACT_EN, CONTACT_DE]) {
      expect(aroundPlaceholder(copy.form.failure.limit, 'linkedin')).toHaveLength(2);
      expect(aroundPlaceholder(copy.form.failure.delivery, 'linkedin')).toHaveLength(2);
      expect(aroundPlaceholder(copy.form.privacy, 'link')).toHaveLength(2);
      expect(copy.form.failure.fast).not.toContain('{');
    }
  });
});
