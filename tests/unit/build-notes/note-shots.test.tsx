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

const EXPECTED = {
  marketingwsBrief: {
    src: '/images/notes/marketingws-brief-light.png',
    alt: 'The Brief form in MarketingWS, filled in for a LinkedIn post in a professional tone, in English, about a neighbourhood bike repair café that opens on Saturdays, for students and young professionals in Berlin, with the instruction to be friendly, use no emojis and end with the opening hours.',
    caption: 'The brief: a campaign type, a platform, a tone, a language and a few lines on the offer.',
  },
  marketingwsDraft: {
    src: '/images/notes/marketingws-first-draft-light.png',
    alt: 'The First draft panel in MarketingWS: a short LinkedIn post about the bike repair café, with a placeholder where a percentage would go, hashtags and the opening hours at the end.',
    caption: 'The first draft it returned. Where the brief has no figure, the draft leaves a placeholder instead of inventing one.',
  },
  weatherChecks: {
    src: '/images/notes/weather-quality-checks-light-crop.png',
    alt: "Terminal output of the weather pipeline's data-quality checks, one line per check, each with its status word: most lines read OK, the warning lines read WARN and the line on merged condition spellings reads INFO.",
    caption:
      'The data-quality step of the pipeline I rebuilt on a public weather dataset. Every error-level check passes; the warnings name the sensor errors I quarantined and the places with too few observations.',
  },
  n8nDecision: {
    src: '/images/notes/n8n-einvoice-routing-light.png',
    alt: 'Part of an n8n workflow canvas: it checks the request, reads and checks the invoice row, then routes the outcome either to updating the register or to an error response.',
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
      caption: text(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/.exec(body)![1]!.replace(/<a [\s\S]*?<\/a>/, '')),
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

  it('escapes the apostrophe in the rendered alt text and decodes back to the pin', () => {
    const markup = renderToStaticMarkup(<NoteShot shot="weatherChecks" />);
    expect(markup).toContain("pipeline&#x27;s data-quality checks");
    expect(shotsIn(markup)[0]!.alt).toBe(EXPECTED.weatherChecks.alt);
  });

  it('shows both MarketingWS shots at one width, the text column', () => {
    for (const id of ['marketingwsBrief', 'marketingwsDraft'] as const) {
      const figure = /<figure ([^>]*)>/.exec(renderToStaticMarkup(<NoteShot shot={id} />))![1]!;
      expect(NOTE_SHOTS[id].maxWidth).toBe('text');
      expect(figure).toMatch(/class="[^"]*\bmax-w-text\b/);
      expect(figure).not.toContain('style=');
      // Never wider than the file: the text column is 680 px.
      expect(NOTE_SHOTS[id].width).toBeGreaterThanOrEqual(680);
    }
  });

  it('keeps the terminal and canvas text at 13 px or more: a narrowest width, and a labelled scrolling frame under it', () => {
    for (const id of ['weatherChecks', 'n8nDecision'] as const) {
      const shot = NOTE_SHOTS[id];
      const textAt = (cssWidth: number) => (shot.textPx * cssWidth) / shot.width;
      expect(textAt(shot.minWidth)).toBeGreaterThanOrEqual(13);
      expect(shot.maxWidth).toBeGreaterThanOrEqual(shot.minWidth);
      expect(shot.maxWidth).toBeLessThanOrEqual(960);
      const markup = renderToStaticMarkup(<NoteShot shot={id} />);
      expect(markup).toContain(`<div data-shot-frame="" class="overflow-x-auto" tabindex="0" role="region" aria-labelledby="${id}-caption"><img `);
      expect(markup).toContain(`<figcaption id="${id}-caption"`);
      expect(markup).toContain(`style="min-width:${shot.minWidth}px"`);
    }
    // A frame that takes focus fits whole, with its 4 px ring, under the 64 px sticky header on a
    // 768 px tall laptop screen, so focusing it can show its whole ring.
    for (const id of ['weatherChecks', 'n8nDecision'] as const) {
      const shot = NOTE_SHOTS[id];
      expect((shot.maxWidth as number) * (shot.height / shot.width) + 8, id).toBeLessThanOrEqual(768 - 64);
    }
    // The light terminal: no dark surface on a light-only site.
    expect(NOTE_SHOTS.weatherChecks.file).not.toMatch(/dark/);
  });

  it('links the n8n canvas to the wider crop of the same recording', () => {
    const markup = renderToStaticMarkup(<NoteShot shot="n8nDecision" />);
    expect(markup).toContain('<a href="/images/notes/n8n-einvoice-decision-nodes-light.png"');
  });

  it('puts the caption last in the figure, with the full-size link inside it', () => {
    for (const id of Object.keys(EXPECTED)) {
      const markup = renderToStaticMarkup(<NoteShot shot={id as keyof typeof NOTE_SHOTS} />);
      expect(markup).toMatch(/<\/figcaption><\/figure>$/);
    }
    const linked = renderToStaticMarkup(<NoteShot shot="marketingwsDraft" />);
    expect(linked).toMatch(/<figcaption[^>]*>[^]*<a [^>]*>Full-size picture of the first draft<\/a><\/figcaption>/);
    expect(renderToStaticMarkup(<NoteShot shot="n8nDecision" />)).toContain('>Full-size picture of the workflow canvas</a>');
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
      'weather-quality-checks-light-crop.png',
      'n8n-einvoice-routing-light.png',
    ]);
    const fullSize = Object.values(NOTE_SHOTS).flatMap((s) => ('fullSizeFile' in s ? [s.fullSizeFile] : []));
    expect(fullSize).toEqual(['n8n-einvoice-decision-nodes-light.png']);
    for (const f of [...used, ...fullSize]) expect(existsSync(join(repo, 'public/images/notes', f))).toBe(true);
  });
});
