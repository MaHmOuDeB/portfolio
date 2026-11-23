// The German Home and Work pages: the words, the links, the figures and the isolation from the
// experiment. The registry of German pages is mocked with the pages these two pages link to.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n/pages', () => ({
  DE_PAGES: [
    '/',
    '/work',
    '/work/audible',
    '/work/retention',
    '/work/pulse',
    '/work/weather',
    '/work/docproof',
    '/work/n8n',
    '/work/marketingws',
    '/lab',
    '/experiment',
    '/cv',
    '/contact',
  ],
}));

import { SHELL_DE } from '../../../content/de/shell';
import { HOME_DE, languagesSentenceDe, SKETCH_TEXT_DE } from '../../../content/de/home';
import { WORK_DE } from '../../../content/de/work';
import { SITE_SHARING_LINE_DE } from '../../../content/de/seo';
import { HOME_EN, heroSubText, SKETCH_TEXT_EN, type HomeCopy } from '../../../content/home';
import { WORK_EN } from '../../../content/work';
import { LANGUAGES } from '../../../content/languages';
import { HomeStatic } from '@/components/home/HomeStatic';
import { HomeFaq } from '@/components/home/HomeFaq';
import { HowITest } from '@/components/home/HowITest';
import { AutomateRow } from '@/components/home/AutomateRow';
import { QuestionsRows } from '@/components/home/QuestionsRows';
import { homeCopy } from '@/components/home/copy';
import { WorkPage } from '@/components/work/WorkPage';
import { workCopy } from '@/components/work/copy';
import { CONTACT } from '@/lib/site';

// Inline tags vanish (a link inside a sentence reads as the sentence); every other tag is a break.
const plain = (html: string) =>
  html
    .replace(/<\/?(a|data|time|span|strong|em|b)(\s[^>]*)?>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
const hrefs = (html: string) => [...html.matchAll(/<a [^>]*?href="([^"]*)"/g)].map((m) => m[1]!);
const SHY = /­/g;

const home = renderToStaticMarkup(<HomeStatic locale="de" />);
const work = renderToStaticMarkup(<WorkPage locale="de" />);
const faq = renderToStaticMarkup(<HomeFaq locale="de" />);
const how = renderToStaticMarkup(<HowITest locale="de" />);
const automate = renderToStaticMarkup(<AutomateRow locale="de" />);
const questions = renderToStaticMarkup(<QuestionsRows locale="de" />);
const PAGES = { home, work, faq, how, automate, questions };

/** Every string leaf of a copy value (a fact part is an object and is skipped). */
function leaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) leaves(v, out);
  else if (value !== null && typeof value === 'object' && !('$$typeof' in value)) {
    for (const [k, v] of Object.entries(value)) if (k !== 'id' && k !== 'study' && k !== 'href') leaves(v, out);
  }
  return out;
}

describe('the German Home page', () => {
  it('is outside the experiment: no beacon, no experiment marker, no group twin, no phase line', () => {
    expect(home).not.toContain('data-experiment');
    expect(home).not.toContain('data-headline-twin');
    expect(home).not.toContain('data-home-card-line');
    expect(home).not.toMatch(/beacon/i);
  });

  it('says the fixed note, with the Live-Test link to the German Live test page', () => {
    const note = /<div data-home-note="">([\s\S]*?)<\/div><\/div>/.exec(home)![1]!;
    expect(plain(note)).toBe('Diese Website führt ein Experiment mit ihren Besuchern durch. Den aktuellen Stand sehen Sie im Live-Test.');
    expect(hrefs(note)).toEqual(['/de/experiment']);
    expect(home).toContain('role="region" aria-label="Live-Test"');
  });

  it('shows the three fixed headlines from group A, translated, and no other group', () => {
    const headlines = [...home.matchAll(/data-case-headline="[^"]*"[^>]*><span class="col-start-1 row-start-1">([\s\S]*?)<\/span>/g)].map((m) => plain(m[1]!));
    expect(headlines).toEqual(['Wie ich Experimente angehe', 'Analyse zu Kundenbindung und Reaktivierung', 'Pulse: Demo zur Analytics-Instrumentierung']);
    expect(home).toContain('aria-label="Ausgewählte Fallstudien"');
  });

  it('keeps the h1 equal to the shell headline (soft hyphens aside) and the sub line equal to the sharing line', () => {
    const h1 = plain(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(home)![1]!).replace(SHY, '');
    expect(h1).toBe(`${SHELL_DE.headline.lead} ${SHELL_DE.headline.quiet}`);
    expect(plain(/<p data-hero-sub[^>]*>([\s\S]*?)<\/p>/.exec(home)![1]!)).toBe(SITE_SHARING_LINE_DE);
    const { lead, chips, join, end, rest } = HOME_DE.hero.sub;
    expect(`${lead}${chips[0]}${join}${chips[1]}${end}${rest}`).toBe(SITE_SHARING_LINE_DE);
  });

  it('sends every internal link to the German twin, and leaves only LinkedIn and the repositories outside', () => {
    for (const [name, html] of Object.entries(PAGES)) {
      const all = hrefs(html);
      if (['home', 'work', 'faq'].includes(name)) expect(all.length, name).toBeGreaterThan(0);
      for (const h of all) {
        if (h.startsWith('https://')) {
          expect([CONTACT.linkedin, 'https://github.com/MaHmOuDeB/docproof', 'https://github.com/MaHmOuDeB/n8n-workflow-library'], `${name} ${h}`).toContain(h);
        } else if (!h.startsWith('#')) {
          expect(h, name).toMatch(/^\/de(\/|#|$)/);
        }
      }
    }
    expect(hrefs(home)).toEqual(expect.arrayContaining(['/de/cv', '/de/contact', '/de/work', '/de/work/audible#why-so-many', '/de/work/audible#automation', '/de/work/retention', '/de/work/pulse', '/de/work/docproof', '/de/work/n8n', '/de/work/marketingws']));
  });

  it('prints every number through a Fact, in the German form', () => {
    for (const [name, html] of Object.entries(PAGES)) {
      const rest = plain(html.replace(/<data [^>]*>[\s\S]*?<\/data>/g, ' ').replace(/<time [^>]*>[\s\S]*?<\/time>/g, ' ')).replace(/\b20\d\d\b|n8n|\b[ABC][12]\b/g, '');
      expect(rest.match(/.{0,25}\d.{0,25}/)?.[0] ?? null, name).toBeNull();
    }
    expect(home).toMatch(/<data value="[^"]*" data-fact="profile\.audible\.experiments">[^<]*<\/data>/);
  });

  it('leaks no English: no English sentence of the English copy is printed, bar proper nouns', () => {
    const ALLOWED = new Set(['Test', 'Docproof', 'MarketingWS', 'Workflow', 'FAQ', 'LinkedIn', 'Python, FastAPI, Groq', 'n8n, XRechnung, ZUGFeRD', 'Pulse',
      // Proper nouns and words that are the same in German.
      'Audible', 'Mercor', 'University of Europe', 'Jacobs University', 'Plan', 'Analyse', 'Guardrails']);
    const english = [...leaves(HOME_EN as unknown as HomeCopy), ...leaves(WORK_EN)].map((s) => s.trim()).filter((s) => s.length >= 4 && !ALLOWED.has(s));
    const text = plain(Object.values(PAGES).join(' '));
    const leaked = english.filter((s) => {
      const word = new RegExp(`(?<![\\p{L}\\d])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, 'u');
      return word.test(text);
    });
    expect(leaked).toEqual([]);
  });
});

describe('the pieces the About and Work pages reuse', () => {
  it('prints the questions, the FAQ, the tabs and the automate lines in German', () => {
    expect(plain(questions)).toContain('Die Fragen, die ein Team stellt.');
    expect(plain(faq)).toContain('Welche Stellen suchen Sie?');
    expect(plain(how)).toContain('Wie ich teste');
    expect(plain(automate)).toContain('Ich baue Agenten, in denen Code und nicht das Modell das letzte Wort über Fakten hat.');
  });

  it('keeps the section and tab ids English', () => {
    expect(how).toContain('id="how-plan"');
    expect(how).toContain('id="how-title"');
    expect(faq).toContain('id="faq-title"');
  });

  it('prints the FAQ months in German and the two dates in a time element', () => {
    expect(faq).toMatch(/<time dateTime="2025-11">November 2025<\/time>/);
    expect(faq).toMatch(/<time dateTime="2026-10">Oktober 2026<\/time>/);
  });

  it('names the Mercor role by its English title and the approved German wording, never "Vertrag"', () => {
    expect(faq).toContain('AI Data Specialist, Business and Analytics Workflows (Contract)');
    expect(faq).toContain('Erstellung hochwertiger Trainingsdaten für KI-Modelle, mit Business- und Analytics-Expertise: präzise, gut dokumentierte Arbeitsbeispiele.');
    expect(faq).not.toContain('Vertragsbasis');
  });

  it('writes the languages from the shared list, German at B1', () => {
    const s = languagesSentenceDe();
    expect(s).toContain('Deutsch (B1)');
    expect(s).not.toMatch(/Deutsch \((?!B1)/);
    expect(s.match(/ \(/g)).toHaveLength(LANGUAGES.length);
    expect(plain(faq)).toContain(s);
  });
});

describe('the German Work page', () => {
  it('has the page head, the two groups with their eight cards and the German anchors', () => {
    expect(plain(work)).toContain('Projekte');
    expect(plain(work)).toContain('Die Projekte öffnen und sehen, wie sie entstanden sind.');
    expect(work).toContain('id="experimentation"');
    expect(work).toContain('id="automation"');
    expect([...work.matchAll(/data-work-item="([^"]*)"/g)]).toHaveLength(8);
    expect(work).not.toContain('Shows:');
    expect(work).toContain('Zeigt: ');
  });

  it('names the live test as an English-page test, never as this page', () => {
    expect(plain(work)).toContain('den drei Experiment-Karten auf der englischen Startseite');
    expect(hrefs(work)).toContain('/de/experiment');
    expect(work).not.toContain('data-experiment');
  });

  it('ends with the German call to action', () => {
    expect(plain(work)).toContain('Finden Sie heraus, was ich für Ihr Team tun kann.');
    expect(hrefs(work).slice(-3)).toEqual(['/de/contact', '/de/cv', CONTACT.linkedin]);
  });

  it('uses the German sketch words, with the data names left as they are', () => {
    expect(plain(work)).toContain(SKETCH_TEXT_DE.process.rows[0]!.name);
    expect(plain(work)).toContain('Viewed Dashboard');
    expect(plain(work)).not.toContain(SKETCH_TEXT_EN.process.rows[0]!.name);
  });
});

describe('the German copy follows the truth rules', () => {
  const all = [...leaves(HOME_DE), ...leaves(WORK_DE), ...Object.values(PAGES).map(plain)];

  it('uses no banned word, dash, arrow, middle dot, emoji or straight quote', () => {
    for (const s of all) {
      expect(s).not.toMatch(/KI-gestützt|KI-basiert|KI-getrieben|leidenschaftlich|Rockstar|AI-powered/i);
      expect(s).not.toMatch(/[–—→←·•]/u);
      expect(s).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('never claims the metric frameworks, a lead role, a German level or a group for the reader', () => {
    for (const s of all) {
      expect(s).not.toMatch(/definiert|verantwortet|geleitet|gleichzeitig|fließende?s? Deutsch|Deutsch \(fließend|Sie sind in Gruppe|Arm\b/);
    }
  });

  it('always pairs Tampermonkey with its step recorder', () => {
    for (const s of all) for (const m of s.matchAll(/Tampermonkey/g)) expect(s.slice(m.index!)).toMatch(/^Tampermonkey mit einem Schritt-Rekorder/);
  });

  it('never joins the experiment count with the market count, and keeps the adoption link', () => {
    const sentences = (parts: readonly (string | { fact: string })[]) => {
      const out: string[][] = [[]];
      for (const p of parts) {
        if (typeof p === 'object') out.at(-1)!.push(p.fact);
        else for (const [i, piece] of p.split('. ').entries()) { if (i > 0) out.push([]); void piece; }
      }
      return out;
    };
    for (const item of [...HOME_DE.proof.items, ...HOME_DE.featured.cases.map((c) => ({ figure: [], caption: c.description }))]) {
      const facts = [...item.figure.flatMap((p) => (typeof p === 'object' ? [p.fact] : [])), ...sentences(item.caption).flat()];
      expect(facts.includes('profile.audible.experiments') && facts.includes('profile.audible.markets')).toBe(false);
    }
    expect(HOME_DE.proof.items.find((i) => i.id === 'adopted')!.whySoMany).toBe(true);
    expect(plain(home)).toContain('Warum so viele?');
  });

  it('describes the rebuilt, demo and library projects only as the facts allow', () => {
    const t = plain(work) + plain(home);
    expect(t).not.toMatch(/im Einsatz|eingesetzt bei|produktiv|Rechnungsvolumen/);
    expect(t).toContain('2026 neu aufgebaut');
    expect(t).toContain('Öffentlicher Datensatz');
    expect(t).toContain('Textvarianten');
  });
});

describe('the English copy is unchanged by the split', () => {
  it('serves the English values through the same pickers', () => {
    expect(homeCopy('en')).toBe(HOME_EN);
    expect(workCopy('en')).toBe(WORK_EN);
    expect(homeCopy('de')).toBe(HOME_DE);
    expect(workCopy('de')).toBe(WORK_DE);
    expect(heroSubText()).toContain('Analyst in Berlin. I build the ');
  });

  it('keeps the same sketch keys in both languages', () => {
    expect(Object.keys(SKETCH_TEXT_DE)).toEqual(Object.keys(SKETCH_TEXT_EN));
  });
});
