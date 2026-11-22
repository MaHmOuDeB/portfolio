// The shell's words as data: skip link, header, Menu, footer, language menu, 404 and error pages.
// English is here, German in content/de/shell.ts, both typed by ShellCopy, so a missing key fails the
// typecheck. A client component never imports the German set: it gets the strings it prints as props.
import type { Locale } from '@/lib/i18n/locale';

/** The error pages' words (error.tsx and global-error.tsx print them in a client component). */
export type ErrorCopy = {
  title: string;
  body: string;
  retry: string;
  work: string;
  lab: string;
  linkedin: string;
};

/** What the language menu prints; each language name is in its own language. */
export type LanguageCopy = { label: string; english: string; german: string };

export type ShellCopy = {
  locale: Locale;
  skip: string;
  /** The Menu's button and its landmark name. */
  menu: string;
  /** Landmark names. */
  mainLabel: string;
  footerLabel: string;
  nav: { work: string; about: string; lab: string; live: string };
  cv: string;
  contact: string;
  privacy: string;
  headline: { lead: string; quiet: string };
  footerColumns: { site: string; contact: string; legal: string };
  language: LanguageCopy;
  /** The default description of every page that sets none. */
  description: string;
  notFound: {
    chip: string;
    title: string;
    body: string;
    work: string;
    lab: string;
    linkedin: string;
  };
  error: ErrorCopy;
};

export const ERROR_EN: ErrorCopy = {
  title: 'This page could not load',
  body: 'An error stopped this page from loading. Try again. If it happens again, send me the page address on LinkedIn.',
  retry: 'Try again',
  work: 'Work',
  lab: 'Lab',
  linkedin: 'LinkedIn',
};

export const SHELL_EN: ShellCopy = {
  locale: 'en',
  skip: 'Skip to content',
  menu: 'Menu',
  mainLabel: 'Main',
  footerLabel: 'Footer',
  nav: { work: 'Work', about: 'About', lab: 'Lab', live: 'Live test' },
  cv: 'CV',
  contact: 'Contact',
  privacy: 'Privacy',
  headline: { lead: 'AI automation and experimentation', quiet: 'for product and growth teams' },
  footerColumns: { site: 'Site', contact: 'Contact', legal: 'Legal' },
  language: { label: 'Language', english: 'English', german: 'Deutsch' },
  description: 'AI automation and experimentation analyst in Berlin.',
  notFound: {
    chip: 'Not found',
    title: 'Page not found',
    body: 'There is no page at this address. Check the address, or start from one of these pages.',
    work: 'Work',
    lab: 'Lab',
    linkedin: 'LinkedIn',
  },
  error: ERROR_EN,
};
