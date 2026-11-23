import 'server-only';
import { LANGUAGES } from '../languages.ts';

// The shared language list (content/languages.ts) in German, in its own order: German stays at B1, and
// a language or level with no German word fails loudly. The same two word lists serve the Home FAQ's
// sentence (content/de/home.ts keeps its own copy).
const NAMES: Readonly<Record<string, string>> = {
  English: 'Englisch',
  German: 'Deutsch',
  French: 'Französisch',
  Arabic: 'Arabisch',
  Spanish: 'Spanisch',
};
const LEVELS: Readonly<Record<string, string>> = {
  'fluent (C2)': 'fließend, C2',
  B1: 'B1',
  native: 'Muttersprache',
  A2: 'A2',
};

export const LANGUAGES_DE: readonly { language: string; level: string }[] = LANGUAGES.map(({ language, level }) => {
  const name = NAMES[language];
  const german = LEVELS[level];
  if (name === undefined || german === undefined) throw new Error(`no German word for ${language} (${level})`);
  return { language: name, level: german };
});
