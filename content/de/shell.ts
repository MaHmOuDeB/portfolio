import 'server-only';
import type { ShellCopy } from '../shell';
import { ERROR_DE } from './shell-error';

// The shell in German: formal "Sie". The navigation words are fixed: Projekte, Über mich, Lab,
// Live-Test, Lebenslauf, Kontakt, Menü.
export const SHELL_DE: ShellCopy = {
  locale: 'de',
  skip: 'Zum Inhalt springen',
  menu: 'Menü',
  mainLabel: 'Hauptnavigation',
  footerLabel: 'Fußzeile',
  nav: { work: 'Projekte', about: 'Über mich', lab: 'Lab', live: 'Live-Test' },
  cv: 'Lebenslauf',
  contact: 'Kontakt',
  privacy: 'Datenschutz',
  headline: { lead: 'KI-Automatisierung und A/B-Testing', quiet: 'für Produkt- und Growth-Teams' },
  footerColumns: { site: 'Website', contact: 'Kontakt', legal: 'Rechtliches' },
  language: { label: 'Sprache', english: 'English', german: 'Deutsch' },
  description: 'Analyst für A/B-Testing und KI-Automatisierung in Berlin.',
  notFound: {
    chip: 'Nicht gefunden',
    title: 'Seite nicht gefunden',
    body: 'Unter dieser Adresse gibt es keine Seite. Prüfen Sie die Adresse oder beginnen Sie bei einer dieser Seiten.',
    work: 'Projekte',
    lab: 'Lab',
    linkedin: 'LinkedIn',
  },
  error: ERROR_DE,
};
