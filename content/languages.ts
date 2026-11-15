// The languages I speak, with their levels: the About page, the CV page and the Home FAQ all read
// this one list, so they cannot disagree. German is B1. No imports, so scripts run with Node's type
// stripping can read it.
export const LANGUAGES: readonly { language: string; level: string }[] = [
  { language: 'English', level: 'fluent (C2)' },
  { language: 'German', level: 'B1' },
  { language: 'French', level: 'fluent (C2)' },
  { language: 'Arabic', level: 'native' },
  { language: 'Spanish', level: 'A2' },
];

/** "a", "a and b", "a, b and c". */
function joinAnd(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * The list as one sentence: neighbours with the same level share it, and a level in brackets is
 * written inside the sentence's own brackets ("fluent (C2)" becomes "(fluent, C2)").
 */
export function languagesSentence(list: readonly { language: string; level: string }[] = LANGUAGES): string {
  const groups: { names: string[]; level: string }[] = [];
  for (const { language, level } of list) {
    const last = groups.at(-1);
    if (last && last.level === level) last.names.push(language);
    else groups.push({ names: [language], level });
  }
  const parts = groups.map((g) => `${joinAnd(g.names)} (${g.level.replace(' (', ', ').replace(')', '')})`);
  return `${joinAnd(parts)}.`;
}
