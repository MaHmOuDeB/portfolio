// What every page must still hold after any Figure action, Reset, island failure or Figure error,
// read from the live DOM (the number and source checks are tests/e2e/truth-live.ts):
//
// - tables: every chart Figure (one with a provenance badge) keeps a table, its own or the error
//   fallback's, with a caption, at least one body row, and as many cells in each row as headers;
// - times: every <time> has a dateTime, and its text is that dateTime written the site's way: a
//   year as itself, a month as "Nov 2025", a calendar date as dd.mm or dd.mm.yyyy, and an instant as
//   its Europe/Berlin dd.mm and 24-hour hh:mm (each one printed matches the instant);
// - numbers: no ASCII hyphen-minus before a digit in a number element (the true minus is U+2212),
//   zero never signed ("+0", "−0"), a percent sign always right after its number, and every "±"
//   naming its level in the same sentence.
import type { Page } from '@playwright/test';

const BADGES = ['Simulated', 'Public data', 'Live from this site'];
const NUMBER_ELEMENTS = '[data-num], data, output, time';

type Read = {
  tables: { id: string; chart: boolean; tables: number; problems: string[] }[];
  times: { dateTime: string | null; text: string }[];
  numbers: string[];
  text: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const berlin = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function berlinParts(iso: string) {
  const out: Record<string, string> = {};
  for (const p of berlin.formatToParts(Date.parse(iso))) out[p.type] = p.value;
  return out;
}

/** A finding for a <time> whose text is not its dateTime written the site's way, or null. */
export function timeFinding(dateTime: string | null, text: string): string | null {
  const t = text.trim();
  const at = `<time dateTime="${dateTime ?? ''}">${t}`;
  if (!dateTime) return `${at}: no dateTime`;
  let m: RegExpMatchArray | null;
  if ((m = dateTime.match(/^(\d{4})$/))) return t === m[1] ? null : `${at}: a year prints as itself`;
  if ((m = dateTime.match(/^(\d{4})-(\d{2})$/))) return t === `${MONTHS[Number(m[2]) - 1]} ${m[1]}` ? null : `${at}: a month prints as "Mon yyyy"`;
  if ((m = dateTime.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    return t === `${m[3]}.${m[2]}` || t === `${m[3]}.${m[2]}.${m[1]}` ? null : `${at}: a date prints as dd.mm or dd.mm.yyyy`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(dateTime) && !Number.isNaN(Date.parse(dateTime))) {
    const p = berlinParts(dateTime);
    const dates = [...t.matchAll(/\b(\d{2})\.(\d{2})(?:\.(\d{4}))?\b/g)];
    const clocks = [...t.matchAll(/\b(\d{2}):(\d{2})\b/g)];
    if (dates.length + clocks.length === 0) return `${at}: an instant prints its Berlin dd.mm or hh:mm`;
    for (const d of dates) if (d[1] !== p.day || d[2] !== p.month || (d[3] !== undefined && d[3] !== p.year)) return `${at}: not the Berlin date`;
    for (const c of clocks) if (c[1] !== p.hour || c[2] !== p.minute) return `${at}: not the Berlin time`;
    const rest = t.replace(/\b\d{2}\.\d{2}(?:\.\d{4})?\b|\b\d{2}:\d{2}\b/g, '');
    return /\d/.test(rest) ? `${at}: a digit outside dd.mm and hh:mm` : null;
  }
  return `${at}: a dateTime that is neither a year, a month, a date nor an instant with an offset`;
}

/** Findings over the text of number elements and of the page (see the header). */
export function numberFindings(numbers: readonly string[], text: string): string[] {
  const out: string[] = [];
  for (const n of numbers) {
    if (/-\d/.test(n)) out.push(`hyphen-minus before a digit: "${n}"`);
    if (/\d\s+%/.test(n)) out.push(`space before a percent sign: "${n}"`);
    else if (/%/.test(n) && !/\d%/.test(n)) out.push(`percent sign not right after its number: "${n}"`);
  }
  for (const m of text.matchAll(/(?<![\w.,])([+\-−])\s?(\d+(?:[.,]\d+)?)(?![\d.,]*\d)/g)) {
    if (Number(m[2]!.replace(',', '.')) === 0) out.push(`a signed zero: "${m[0]}"`);
  }
  for (const m of text.matchAll(/±/g)) {
    // The rest of the sentence: up to a full stop that ends it (not a decimal point), or a new line.
    const sentence = text.slice(m.index).split(/\.(?!\d)|\n/)[0]!;
    if (!/\d+\s?%|level|confidence|interval/i.test(sentence)) out.push(`a "±" that names no level: "${sentence.slice(0, 60)}"`);
  }
  return out;
}

/** Every finding on the page; empty when the tables, times and numbers all hold. */
export async function figureInvariants(page: Page): Promise<string[]> {
  const read: Read = await page.evaluate(
    ({ badges, numberElements }) => {
      const main = document.querySelector('main') ?? document.body;
      const tables = [...main.querySelectorAll('figure[data-figure]')].map((f) => {
        const caption = f.querySelector(':scope > figcaption');
        const chart = [...(caption?.querySelectorAll('span') ?? [])].some((s) => badges.includes(s.textContent?.trim() ?? ''));
        const problems: string[] = [];
        const found = [...f.querySelectorAll('[data-figure-tables] table, [data-figure-fallback] table')];
        for (const t of found) {
          if (!t.querySelector('caption')?.textContent?.trim()) problems.push('a table with no caption');
          const heads = t.querySelectorAll('thead th').length;
          const rows = [...t.querySelectorAll('tbody tr')];
          if (rows.length === 0) problems.push('a table with no body row');
          for (const r of rows) if (heads > 0 && r.children.length !== heads) problems.push(`a row of ${r.children.length} cells under ${heads} headers`);
        }
        return { id: f.id, chart, tables: found.length, problems };
      });
      const times = [...document.querySelectorAll('time')].map((t) => ({ dateTime: t.getAttribute('datetime'), text: t.textContent ?? '' }));
      const numbers = [...main.querySelectorAll(numberElements)].map((e) => (e.textContent ?? '').trim()).filter(Boolean);
      return { tables, times, numbers, text: (main as HTMLElement).innerText };
    },
    { badges: BADGES, numberElements: NUMBER_ELEMENTS },
  );
  const out: string[] = [];
  for (const f of read.tables) {
    if (f.chart && f.tables === 0) out.push(`${f.id}: a chart Figure with no table`);
    for (const p of f.problems) out.push(`${f.id}: ${p}`);
  }
  for (const t of read.times) {
    const finding = timeFinding(t.dateTime, t.text);
    if (finding) out.push(finding);
  }
  out.push(...numberFindings(read.numbers, read.text));
  return out;
}
