// The real screenshots on the build notes: each figure's src, alt and caption are pinned exactly,
// where it sits in its note, and that the files on disk match the sizes the figure declares.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarketingwsPage } from '@/components/marketingws/MarketingwsPage';
import { N8nPage } from '@/components/n8n/N8nPage';
import { NoteShot } from '@/components/build-notes/NoteShot';
import { NOTE_SHOTS } from '@/components/build-notes/note-shots';
import { WeatherPage } from '@/components/weather/WeatherPage';
import { audit, decode, section, text } from './helpers';

const repo = join(import.meta.dirname, '../../..');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

const EXPECTED = {
  marketingwsBrief: {
    src: '/images/notes/marketingws-brief-light.png',
    alt: 'The Brief form in MarketingWS, filled in for a LinkedIn post in a professional tone, in English, about a neighbourhood bike repair café that opens on Saturdays, for students and young professionals in Berlin, with the instruction to be friendly, use no emojis and end with the opening hours, ten in the morning to two in the afternoon.',
    caption: 'The brief: a campaign type, a platform, a tone, a language and a few lines on the offer.',
  },
  marketingwsDraft: {
    src: '/images/notes/marketingws-first-draft-light.png',
    alt: 'The First draft panel in MarketingWS: a short LinkedIn post about the bike repair café, with a placeholder where a percentage would go, three hashtags and the opening hours, ten in the morning to two in the afternoon at the end.',
    caption: 'The first draft it returned. Where the brief has no figure, the draft leaves a placeholder instead of inventing one.',
  },
  weatherChecks: {
    src: '/images/notes/weather-quality-checks-dark.png',
    alt: "Terminal output of the weather pipeline's data-quality checks. Fifteen lines read OK, two read WARN (rows quarantined as sensor errors with wind above one hundred and fifty kilometres per hour, and locations observed fewer than twenty times) and one reads INFO (condition spellings merged), followed by the row counts of the staging, dimension, fact and quarantine tables.",
    caption:
      'The data-quality step of the pipeline, run on the public weather dataset I rebuilt in 2026. Every error-level check passes; the warnings name the sensor errors I quarantined and the places with too few observations.',
  },
  n8nDecision: {
    src: '/images/notes/n8n-einvoice-decision-crop-light.png',
    alt: 'An n8n workflow canvas: a webhook checks the request, reads the invoice row, routes the outcome to error responses or to updating the register and the supplier record, then responds OK.',
    caption: 'The approval step: a person approves or declines an invoice that needs a look, and every other answer is a clear error code.',
  },
} as const;

const PAGES = {
  marketingws: { markup: renderToStaticMarkup(<MarketingwsPage />), shots: ['marketingwsBrief', 'marketingwsDraft'], where: 'architecture' },
  weather: { markup: renderToStaticMarkup(<WeatherPage />), shots: ['weatherChecks'], where: 'how-i-checked-this' },
  n8n: { markup: renderToStaticMarkup(<N8nPage />), shots: ['n8nDecision'], where: 'architecture' },
} as const;

/** Every <figure data-note-shot> in a markup, with its img attributes and caption text. */
const shotsIn = (markup: string) =>
  [...markup.matchAll(/<figure data-note-shot="([^"]+)"[^>]*>([\s\S]*?)<\/figure>/g)].map((m) => {
    const body = m[2]!;
    const img = /<img ([^>]*)\/?>/.exec(body)![1]!;
    const attr = (n: string) => new RegExp(`(?:^| )${n}="([^"]*)"`).exec(img)?.[1];
    return {
      id: m[1]!,
      src: attr('src'),
      alt: decode(attr('alt')!),
      width: attr('width'),
      height: attr('height'),
      loading: attr('loading'),
      decoding: attr('decoding'),
      className: attr('class'),
      caption: text(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/.exec(body)![1]!),
    };
  });

describe('NoteShot', () => {
  for (const [id, want] of Object.entries(EXPECTED)) {
    it(`${id}: pins src, alt and caption exactly`, () => {
      const [shot] = shotsIn(renderToStaticMarkup(<NoteShot shot={id as keyof typeof NOTE_SHOTS} />));
      expect(shot).toMatchObject({ id, src: want.src, alt: want.alt, caption: want.caption });
    });

    it(`${id}: lazy, async, sized from its file, tokens only`, () => {
      const markup = renderToStaticMarkup(<NoteShot shot={id as keyof typeof NOTE_SHOTS} />);
      const [shot] = shotsIn(markup);
      expect(shot!.loading).toBe('lazy');
      expect(shot!.decoding).toBe('async');
      expect(shot!.className).toContain('border-line');
      expect(shot!.className).toContain('rounded-sm');
      expect(markup).not.toMatch(/shadow/);
      // The file on disk is the one the figure declares: its PNG header carries the pixel size.
      const png = readFileSync(join(repo, 'public', want.src));
      expect(png.readUInt32BE(16)).toBe(Number(shot!.width));
      expect(png.readUInt32BE(20)).toBe(Number(shot!.height));
    });
  }

  it('links the full-size file only for the draft and the n8n canvas', () => {
    const linked = Object.keys(EXPECTED).filter((id) =>
      renderToStaticMarkup(<NoteShot shot={id as keyof typeof NOTE_SHOTS} />).includes('Full-size picture'),
    );
    expect(linked).toEqual(['marketingwsDraft', 'n8nDecision']);
  });

  it('keeps the escaped alt text out of the visible words', () => {
    expect(esc(EXPECTED.weatherChecks.alt)).toContain('&#x27;');
  });
});

describe('the notes', () => {
  for (const [name, { markup, shots, where }] of Object.entries(PAGES)) {
    it(`${name}: shows exactly its screenshots, in the ${where} section, in order`, () => {
      expect(shotsIn(markup).map((s) => s.id)).toEqual(shots);
      expect(shotsIn(section(markup, where)).map((s) => s.id)).toEqual(shots);
    });
    it(`${name}: passes the truth audit`, () => {
      expect(audit(markup, `/work/${name}`)).toEqual([]);
    });
  }

  it('uses only the approved files, all of which exist', () => {
    const used = Object.values(NOTE_SHOTS).map((s) => s.file);
    expect(used).toEqual([
      'marketingws-brief-light.png',
      'marketingws-first-draft-light.png',
      'weather-quality-checks-dark.png',
      'n8n-einvoice-decision-crop-light.png',
    ]);
    for (const f of used) expect(existsSync(join(repo, 'public/images/notes', f))).toBe(true);
  });
});
