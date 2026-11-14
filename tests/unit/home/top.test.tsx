// The top of Home that is not the hero: the live bar (the live note on an ink strip) and the
// experience band (where I have worked and studied, read from the About timeline).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TIMELINE } from '../../../content/about';
import { HOME_EXPERIENCE } from '../../../content/home.ts';
import type { Arm } from '@/experiment.values';
import { toHomeModel } from '@/lib/home/model';
import { snapshotFixture } from '@/lib/home/fixtures';

const { LiveBar } = await import('@/components/home/LiveBar');
const { LiveNote } = await import('@/components/home/LiveNote');
const { ExperienceBand, experienceName } = await import('@/components/home/ExperienceBand');

type Mode = Parameters<typeof snapshotFixture>[0];
const ARMS: readonly Arm[] = ['a', 'b'];
const bar = (m: Mode, arm: Arm) => renderToStaticMarkup(createElement(LiveBar, { note: LiveNote({ model: toHomeModel(snapshotFixture(m), arm) }) }));
const words = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('LiveBar', () => {
  it('renders nothing when there is no note (before the test starts)', () => {
    for (const arm of ARMS) expect(bar('not-started', arm)).toBe('');
    expect(renderToStaticMarkup(createElement(LiveBar, { note: null }))).toBe('');
  });

  it('is one ink strip that carries the note and the note\'s own link, per note state', () => {
    const cases: [Mode, string, string][] = [
      ['calibration', 'It is calibrating first, so everyone sees the same page.', 'See the live results'],
      ['ab', 'This site runs an A/B test on its visitors', 'See the live results'],
      ['paused', 'The experiment on this site is paused.', 'See why the experiment is paused'],
      ['held', 'The test stopped because', 'Read the live test explanation'],
      ['ship-b', 'The A/B test on this site', 'Read the live test explanation'],
    ];
    for (const [m, sentence, link] of cases) {
      for (const arm of ARMS) {
        const html = bar(m, arm);
        expect(html, `${m}/${arm}`).toMatch(/^<div data-live-bar="" role="region" aria-label="Live test"><div data-live-bar-in="">/);
        expect(words(html)).toContain(sentence);
        expect([...html.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((x) => words(x[1]!))).toEqual([link]);
        // The link keeps its 44 px target.
        expect(html).toMatch(/<a [^>]*class="[^"]*min-h-\(--size-target\)/);
      }
    }
  });

  it('wraps the note in the same markup in both groups', () => {
    for (const m of ['calibration', 'paused', 'held'] as const) expect(bar(m, 'a')).toBe(bar(m, 'b'));
    const strip = (h: string) => h.replace(/<div data-live-bar-in="">[\s\S]*$/, '');
    expect(strip(bar('ab', 'a'))).toBe(strip(bar('ab', 'b')));
  });
});

describe('ExperienceBand', () => {
  const html = renderToStaticMarkup(createElement(ExperienceBand));

  it('has the small line and the two groups, each with its chip', () => {
    expect(html).toContain('Where I have worked and studied');
    expect([...html.matchAll(/<span data-chip="">([^<]*)<\/span>/g)].map((m) => m[1])).toEqual(['Work', 'Study']);
  });

  it('prints the names the About timeline holds, as plain text, no logos', () => {
    const names = [...html.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1]!.replaceAll('&amp;', '&'));
    expect(names).toEqual(['Audible (Amazon)', 'Mercor', 'University of Europe for Applied Sciences', 'Jacobs University Bremen']);
    const fromTimeline = TIMELINE.map((t) => experienceName(t.where));
    for (const n of names) expect(fromTimeline).toContain(n);
    for (const n of names) expect(TIMELINE.some((t) => t.where.startsWith(n))).toBe(true);
    expect(html).not.toMatch(/<img|<svg/);
    expect(HOME_EXPERIENCE.groups.map((g) => g.label)).toEqual(['Work', 'Study']);
  });

  it('is a section ruled from rail to rail, labelled by its line', () => {
    expect(html).toMatch(/^<section data-experience="" data-rule="" aria-labelledby="experience-title">/);
    expect(html).toContain('id="experience-title"');
  });
});
