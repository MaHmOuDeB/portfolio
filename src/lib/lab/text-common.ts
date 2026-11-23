// What every Lab Figure's words share: the slice of the kit's words an island's Figure and controls
// print, and the labels of the Lab's exhibit frame. Plain data (strings and templates), so a server
// component can hand it to a client island as props; English is the default of every component, and
// the other language lives in content/de/lab.tsx, typed by the types next to each Figure. A client
// file never imports a dictionary: it takes its words as a prop.
import { KIT_TEXT_EN, type KitText } from '@/components/kit/text';
import type { Locale } from '@/lib/i18n/locale';

/** The kit's words that strings alone carry, and the language tag the Figure's numbers follow. */
export type LabKit = Pick<KitText, 'locale' | 'zero' | 'figure' | 'table' | 'error' | 'badge' | 'reset' | 'slider'>;

/** The full `KitText` for a Figure: the slice, with the English of the parts a Lab Figure never prints. */
export function labKit(slice: LabKit): KitText {
  return { ...KIT_TEXT_EN, ...slice };
}

/** The slice of a full `KitText`, for the German copy to build its own from the kit's German words. */
export function labKitSlice(t: KitText): LabKit {
  return { locale: t.locale, zero: t.zero, figure: t.figure, table: t.table, error: t.error, badge: t.badge, reset: t.reset, slider: t.slider };
}

export const EN_LAB_KIT: LabKit = labKitSlice(KIT_TEXT_EN);

/** The two labels of the sentences around an exhibit: above the Figure and below it. */
export type ExhibitLabels = { leadIn: string; takeaway: string };

export const EN_EXHIBIT: ExhibitLabels = { leadIn: 'Try it', takeaway: 'What I do about it' };

/** A word and its plural, for a count. */
export type Plural = { one: string; other: string };

/** The one or the other form, by a count. */
export const plural = (n: number, p: Plural): string => (n === 1 ? p.one : p.other);

/** The language tag of a words object, for the number formatters. */
export type Located = { kit: { locale: Locale } };
