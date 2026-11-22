// The German twin of content/seo.ts: the title, description and sharing card of every page that has a
// German version, in formal "Sie" (facts in the first person), sentence for sentence from the English
// entries. SEO_PAGES_DE is keyed by every English path, so a page without a German entry fails the
// typecheck. The cut-list pages (/demo and /exclude) have no German page and no entry.
//
// This module is plain data (no server-only import), so scripts run with Node's type stripping can
// read OG_CARDS_DE; pages reach it through src/lib/seo/entries.ts. Numbers come from the facts data
// through factText with the German locale, never typed.
import type { FactId } from '../../src/lib/facts/index.ts';
import { factText } from '../../src/lib/facts/text.ts';
import { ogAlt, type OgCard } from '../../src/lib/seo/og-template.ts';
import { SITE } from '../../src/lib/site.ts';
import type { SeoEntry, SeoPath } from '../seo.ts';

const de = { locale: 'de' } as const;

/** The German form of the site's sharing line (the English one is the Home description). */
export const SITE_SHARING_LINE_DE =
  'Analyst in Berlin. Ich baue die Agenten und Workflows, die manuelle Arbeit überflüssig machen, und ich plane und analysiere A/B-Tests, mit fast zwei Jahren davon bei Audible (Amazon).';

/** The German headline in one tone: the same words as the shell's headline (a unit test keeps them equal). */
export const SITE_SHARING_HEADLINE_DE = 'KI-Automatisierung und A/B-Testing für Produkt- und Growth-Teams';

/** The Home page's title in a link preview. */
export const HOME_SHARE_TITLE_DE = `${SITE.name}: ${SITE_SHARING_HEADLINE_DE}`;

const CASE_TITLES_DE = {
  audible: `${factText('profile.audible.experiments', { locale: 'de' })} A/B-Tests bei Audible (Amazon)`,
  retention: `Der Retourenwert wuchs um etwa ${factText('retail.returns.yoy_growth_clean', { locale: 'de' })}, nicht um ${factText('retail.returns.yoy_growth_raw', { locale: 'de' })}`,
  pulse: `${factText('pulse.events.count', { locale: 'de' })} Ereignisse, jedes entworfen, um eine Produktfrage zu beantworten`,
  lab: 'Vier Wege, wie ein A/B-Test in die Irre führen kann, und die Prüfung für jeden.',
  experiment: 'Ein echter A/B-Test auf dieser Website, offen durchgeführt.',
} as const;

const LAB_DESCRIPTION_DE =
  'Vier interaktive Beispiele: wie viele Besucher ein Test braucht, warum vorzeitiges Nachsehen falsche Gewinner findet, ob die Aufteilung fair war und warum kleine Tests Erfolge überschätzen.';
const EXPERIMENT_DESCRIPTION_DE =
  'Ein echter A/B-Test, der auf dieser Website läuft: die Frage, der vorab veröffentlichte Plan, die bisherigen Ergebnisse und die Daten, um sie nachzurechnen.';

type CaseName = keyof typeof CASE_TITLES_DE;

function caseCard(name: CaseName, sub: string, factIds: readonly FactId[]): OgCard {
  return { name, variant: 'case', title: CASE_TITLES_DE[name], sub, footer: SITE.name, factIds };
}

/** The German sharing cards, one per English card name, drawn to public/og/de/<name>.png. */
export const OG_CARDS_DE: readonly OgCard[] = [
  { name: 'site', variant: 'site', title: SITE_SHARING_HEADLINE_DE, sub: SITE_SHARING_LINE_DE, footer: SITE.name, factIds: [] },
  caseCard('audible', 'Vom Plan bis zur Empfehlung.', ['profile.audible.experiments']),
  caseCard('retention', 'Analyse der Kundenbindung: Wer bestellt erneut', [
    'retail.returns.yoy_growth_clean',
    'retail.returns.yoy_growth_raw',
  ]),
  caseCard('pulse', 'Pulse: ein Tracking-Plan für Produktanalysen', ['pulse.events.count']),
  caseCard('lab', LAB_DESCRIPTION_DE, []),
  caseCard('experiment', EXPERIMENT_DESCRIPTION_DE, []),
];

export function ogCardDe(name: string): OgCard {
  const card = OG_CARDS_DE.find((c) => c.name === name);
  if (!card) throw new Error(`no German sharing card named ${name}`);
  return card;
}

/** What a German page says about itself, and which card it shares. */
export type GermanSeoText = { title: string; description: string; card: string };

/** One German entry per English page path: a missing path is a type error. */
export type SeoPagesDe = { readonly [P in SeoPath]: GermanSeoText };

export const SEO_PAGES_DE: SeoPagesDe = {
  '/': { title: SITE.name, description: SITE_SHARING_LINE_DE, card: 'site' },
  '/work': {
    title: 'Projekte: Experimente, Analysen und Automatisierung',
    description:
      'Sieben Projekte und ein Tool, mit ihren Quellen und Grenzen: A/B-Testing bei Audible, eine Kundenbindungsanalyse, ein Tracking-Plan, Agenten, n8n-Workflows und eine SQL-Pipeline.',
    card: 'site',
  },
  '/work/audible': {
    title: 'A/B-Testing bei Audible (Amazon)',
    description: `Wie ich als Werkstudent bei Audible an ${factText('profile.audible.experiments', { locale: 'de' })} A/B-Tests mitgewirkt habe, warum ${factText('profile.audible.recommendations_adopted', { locale: 'de' })} meiner Empfehlungen übernommen wurden und ein von mir gebautes Tool, das das Team übernommen hat.`,
    card: 'audible',
  },
  '/work/retention': {
    title: 'Kundenbindungsanalyse: Wer bestellt erneut, und wie man ein Rückgewinnungsangebot testet',
    description:
      'Bereinigung der Retouren, Kohorten, Kundensegmente, ein Modell dafür, wer erneut bestellt, und eine Stichprobengröße für die Rückgewinnung, auf einem öffentlichen Datensatz, der 2026 neu aufgebaut wurde.',
    card: 'retention',
  },
  '/work/pulse': {
    title: 'Pulse: ein Tracking-Plan für Produktanalysen',
    description: `Ein Tracking-Plan mit ${factText('pulse.events.count', { locale: 'de' })} Ereignissen, jedes an eine Produktfrage gebunden, in einem Demo-Dashboard, das ich entworfen und gebaut habe.`,
    card: 'pulse',
  },
  '/work/weather': {
    title: 'Datenqualität bei Wetterdaten',
    description:
      'Eine getestete SQL-Pipeline auf einem öffentlichen Datensatz mit Wetterbeobachtungen, 2026 neu aufgebaut: ein Sternschema, Datenqualitätsprüfungen und eine Quarantäne für Sensorfehler.',
    card: 'site',
  },
  '/work/docproof': {
    title: 'Docproof: Agenten schreiben, Prüfungen entscheiden',
    description:
      'Eine Open-Source-Pipeline, in der ein Agent schreibt, einer jede Aussage prüft und einer ohne Vorwissen gegenliest, und automatisierte Prüfungen entscheiden, was bei den Lesern ankommt.',
    card: 'site',
  },
  '/work/marketingws': {
    title: 'MarketingWS',
    description:
      'Meine Masterarbeit, ein Webdienst mit generativer KI für Content-Marketing, 2026 als Live-Web-App neu aufgebaut: wie er funktioniert, wie ich ihn geprüft habe und wo seine Grenzen liegen.',
    card: 'site',
  },
  '/work/n8n': {
    title: 'E-Rechnungs-Eingang und Fehlerbenachrichtigungen in n8n',
    description: `Liest und prüft Rechnungen im Format XRechnung und ZUGFeRD, meldet Duplikate und geänderte Bankdaten und schlägt bei Fehlern Alarm. ${factText('profile.n8n.automated_tests', { locale: 'de' })} automatisierte Tests. Ein persönliches Projekt.`,
    card: 'site',
  },
  '/lab': {
    title: 'A/B-Test-Lab: Stichprobengröße, vorzeitiges Nachsehen und faire Aufteilung',
    description: LAB_DESCRIPTION_DE,
    card: 'lab',
  },
  '/lab/peeking': {
    title: 'Vorzeitiges Nachsehen, im Lab',
    description:
      'Was tägliches Nachsehen bei einem laufenden Test mit den falsch positiven Ergebnissen macht, in einer Simulation mit festem Startwert.',
    card: 'site',
  },
  '/experiment': { title: 'Ein echter A/B-Test auf dieser Website', description: EXPERIMENT_DESCRIPTION_DE, card: 'experiment' },
  '/about': {
    title: 'Über mich',
    description:
      'Analyst für KI-Automatisierung und A/B-Testing in Berlin: meine Geschichte, mein Werdegang, die Tools, die ich genutzt habe, und wo, und mein Lebenslauf.',
    card: 'site',
  },
  '/cv': {
    title: 'Lebenslauf',
    description:
      'Der Lebenslauf von Mahmoud El Bergui, Analyst für KI-Automatisierung und A/B-Testing in Berlin, als Seite zum Lesen oder Drucken.',
    card: 'site',
  },
  '/contact': {
    title: 'Kontakt',
    description: 'Schreiben Sie mir zu einer Stelle, einem Gespräch oder einem Projekt.',
    card: 'site',
  },
  '/privacy': { title: 'Datenschutz', description: 'Was diese Website erfasst, warum und wie lange.', card: 'site' },
};

/** The German entries, with the German card's image and alt text. `path` stays the English path. */
export const SEO_ENTRIES_DE: readonly SeoEntry[] = (Object.entries(SEO_PAGES_DE) as [SeoPath, GermanSeoText][]).map(
  ([path, page]) => {
    const card = ogCardDe(page.card);
    return {
      ...de,
      path,
      title: page.title,
      description: page.description,
      image: `/og/de/${card.name}.png`,
      imageAlt: ogAlt(card),
      factIds: card.factIds,
      ...(path === '/' ? { homeShareTitle: HOME_SHARE_TITLE_DE } : {}),
    };
  },
);
