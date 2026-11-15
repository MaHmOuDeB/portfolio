// The Home page's sections from "How I test" to the dark call to action, rendered on the server: the
// tabs widget, the two bento tracks with their vignettes, the questions rows, the tools band, the site
// band, the FAQ and the call to action. Every visitor-facing sentence is pinned here word for word,
// every vignette is decorative and prints no digit, and every figure is a Fact.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { describe, expect, it } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { HEADLINES, HOME_CASES } from '../../../content/home.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { LANGUAGES, SHIPPED_TOOLS, TIMELINE } from '../../../content/about';
import { HOME_TOOLS } from '../../../content/home.ts';
import { DOCPROOF_REPO } from '../../../content/docproof';
import { N8N_REPO } from '../../../content/n8n';
import { aboutPhoto } from '../../../content/about-photo';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import { PULSE_EVENT_NAMES } from '@/lib/pulse/names';
import { toHomeModel } from '@/lib/home/model';
import { snapshotFixture } from '@/lib/home/fixtures';
import type { Arm } from '@/experiment.values';
import { CONTACT, CONTACT_HREF, CV_LINK } from '@/lib/site';

const { HowITest } = await import('@/components/home/HowITest');
const { ExperimentsTrack, cardLinePhase } = await import('@/components/home/ExperimentsTrack');
const { FeaturedCases } = await import('@/components/home/FeaturedCases');
const { AutomationTrack } = await import('@/components/home/AutomationTrack');
const { QuestionsRows } = await import('@/components/home/QuestionsRows');
const { ToolsBand } = await import('@/components/home/ToolsBand');
const { SiteTile } = await import('@/components/home/SiteTile');
const { HomeFaq } = await import('@/components/home/HomeFaq');
const { HomeCallToAction } = await import('@/components/home/HomeCallToAction');

const ARMS: readonly Arm[] = ['a', 'b'];
const audit = (html: string) =>
  auditHtml(html, { route: '/v/a', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] });

type El = T.Element;
const isEl = (n: T.ChildNode | T.ParentNode): n is El => 'tagName' in n;
const attr = (el: El, name: string): string | undefined => el.attrs.find((a) => a.name === name)?.value;
const has = (el: El, name: string) => attr(el, name) !== undefined;
function all(root: T.ParentNode, test: (el: El) => boolean): El[] {
  const out: El[] = [];
  const walk = (node: T.ParentNode) => {
    for (const child of node.childNodes) {
      if (!isEl(child)) continue;
      if (test(child)) out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
}
const one = (root: T.ParentNode, test: (el: El) => boolean): El => {
  const found = all(root, test);
  expect(found).toHaveLength(1);
  return found[0]!;
};
function text(node: T.ParentNode): string {
  let s = '';
  for (const child of node.childNodes) {
    if (child.nodeName === '#text') s += (child as T.TextNode).value;
    else if (isEl(child)) s += text(child);
  }
  return s;
}
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const row0 = (root: El, q: string) => all(root, (el) => el.tagName === 'details').find((r) => text(r).includes(q))!;
const classes = (el: El) => (attr(el, 'class') ?? '').split(/\s+/).filter(Boolean);
const doc = (html: string) => parse(`<!doctype html><html><body>${html}</body></html>`);
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

/** The chip, the h2 (title and quiet clause) and the sub of a section head. */
function head(root: T.ParentNode) {
  const h = one(root, (el) => has(el, 'data-section-head'));
  const h2 = one(h, (el) => el.tagName === 'h2');
  const quiet = all(h2, (el) => has(el, 'data-quiet'));
  const sub = all(h, (el) => el.tagName === 'p');
  return {
    chip: text(one(h, (el) => has(el, 'data-chip'))),
    title: squash(text(h2)),
    quiet: quiet.length ? text(quiet[0]!) : null,
    sub: sub.length ? text(sub[0]!) : null,
    id: attr(h2, 'id'),
  };
}

/** The kind of sketch inside a vignette. */
const sketchOf = (v: El) => attr(one(v, (el) => has(el, 'data-sketch')), 'data-sketch');

/** Every vignette: decorative, untagged, and free of digits. */
function expectVignettes(root: T.ParentNode, count: number) {
  const vigs = all(root, (el) => has(el, 'data-vignette'));
  expect(vigs).toHaveLength(count);
  for (const v of vigs) {
    expect(attr(v, 'aria-hidden')).toBe('true');
    expect(all(v, (el) => has(el, 'data-vignette-label'))).toEqual([]);
    expect(text(v)).not.toMatch(/Illustration/);
    expect(text(v), text(v)).not.toMatch(/\d/);
    expect(text(v)).not.toMatch(/revenue|listening|churn|ILTV|conversion|lift/i);
    expect(all(v, (el) => el.tagName === 'a' || has(el, 'tabindex'))).toEqual([]);
  }
  return vigs;
}

describe('HowITest: the tabs widget', () => {
  const html = render(createElement(HowITest));
  const d = doc(html);
  const section = one(d, (el) => has(el, 'data-home-how'));

  it('is a ruled section headed "How I test", "Planned before it starts, honest about what it shows."', () => {
    expect(section.tagName).toBe('section');
    expect(has(section, 'data-rule')).toBe(true);
    const h = head(section);
    expect(h).toMatchObject({
      chip: 'How I test',
      title: 'Planned before it starts, honest about what it shows.',
      quiet: 'honest about what it shows.',
      sub: 'Three steps behind every recommendation, including when the result is neutral.',
    });
    expect(attr(section, 'aria-labelledby')).toBe(h.id);
  });

  it('has three native radio tabs with labels, the same name, the first checked, so it works without JavaScript', () => {
    const radios = all(section, (el) => el.tagName === 'input');
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => attr(r, 'type'))).toEqual(['radio', 'radio', 'radio']);
    expect(new Set(radios.map((r) => attr(r, 'name'))).size).toBe(1);
    expect(radios.map((r) => has(r, 'checked'))).toEqual([true, false, false]);
    const group = one(section, (el) => attr(el, 'role') === 'radiogroup');
    expect(attr(group, 'aria-labelledby')).toBe(head(section).id);
    const labels = all(section, (el) => el.tagName === 'label');
    expect(labels).toHaveLength(3);
    for (const [i, label] of labels.entries()) {
      // The label wraps its radio, so a click anywhere on the tab selects it and the radio is named by it.
      expect(all(label, (el) => el === radios[i])).toHaveLength(1);
      // The radio is visually hidden, the label shows the focus ring and the selected state.
      expect(classes(radios[i]!)).toContain('sr-only');
      // Focus scrolls the whole label into view, not only the radio's 1 px box at its top.
      expect(classes(radios[i]!)).toContain('scroll-mb-36');
      expect(attr(label, 'class')).toMatch(/has-\[:focus-visible\]:outline/);
      expect(attr(label, 'class')).toMatch(/has-\[:checked\]:/);
    }
  });

  it('marks the selected tab with a 2 px ink bar at its left edge, which hover never shows', () => {
    for (const label of all(section, (el) => el.tagName === 'label')) {
      const cls = attr(label, 'class')!;
      expect(cls.split(' ')).toContain('group');
      expect(cls).not.toMatch(/hover:bg-/);
      expect(cls).toMatch(/hover:border-hairline-strong/);
      const mark = one(label, (el) => has(el, 'data-how-mark'));
      expect(attr(mark, 'aria-hidden')).toBe('true');
      expect(classes(mark)).toEqual(expect.arrayContaining(['hidden', 'group-has-[:checked]:block', 'w-0.5', 'bg-ink']));
      // Unselected, the title is muted; selected, the title and line are ink.
      expect(classes(one(label, (el) => has(el, 'data-how-title')))).toEqual(expect.arrayContaining(['text-muted', 'group-has-[:checked]:text-ink']));
    }
  });

  it('says the three habits, word for word: a title and one line per tab', () => {
    const tabs = all(section, (el) => el.tagName === 'label').map((l) => ({
      title: text(one(l, (el) => has(el, 'data-how-title'))),
      line: text(one(l, (el) => has(el, 'data-how-line'))),
    }));
    expect(tabs).toEqual([
      { title: 'Plan', line: 'I plan the sample size and run time before a test starts, so when to stop is settled in advance.' },
      { title: 'Analyse', line: 'I test the primary metric for significance and check that the guardrails held.' },
      { title: 'Recommend', line: 'I write the recommendation with its reasons, including when a neutral result is still worth shipping.' },
    ]);
  });

  it('has one decorative preview panel per tab, shown by its checked radio in CSS, the first by default', () => {
    const panels = all(section, (el) => has(el, 'data-how-panel'));
    expect(panels.map((p) => attr(p, 'data-how-panel'))).toEqual(['plan', 'analyse', 'recommend']);
    for (const p of panels) {
      expect(attr(p, 'aria-hidden')).toBe('true');
      expect(classes(p)).toContain('hidden');
    }
    const radios = all(section, (el) => el.tagName === 'input');
    const ids = radios.map((r) => attr(r, 'id'));
    expect(ids.map((id) => id && /^[a-z][a-z0-9-]*$/.test(id))).toEqual([true, true, true]);
    const wrap = one(section, (el) => has(el, 'data-how-tabs'));
    for (const [i, id] of ids.entries()) {
      const panel = attr(panels[i]!, 'data-how-panel');
      expect(classes(wrap)).toContain(`[&:has(#${id}:checked)_[data-how-panel=${panel}]]:block`);
    }
    expectVignettes(section, 3);
    // The panel is as tall as its sketch, never stretched to the tabs' height (no half-empty panel).
    const frame = one(section, (el) => has(el, 'data-depth-drift'));
    expect(classes(frame)).toContain('self-start');
    expect(classes(frame).filter((c) => c.startsWith('min-h-'))).toEqual([]);
  });

  it('passes the truth audit', () => {
    expect(audit(html)).toEqual([]);
  });
});

describe('ExperimentsTrack: the bento of the three experiment cards', () => {
  const track = (arm: Arm, m: Parameters<typeof snapshotFixture>[0] = 'ab') => {
    const model = toHomeModel(snapshotFixture(m), arm);
    return render(createElement(ExperimentsTrack, { headlineArm: model.headlineArm, phase: cardLinePhase(model) }));
  };

  it('is the ruled section #work headed "Open the work and see how it was done."', () => {
    const d = doc(track('a'));
    const section = one(d, (el) => el.tagName === 'section' && attr(el, 'id') === 'work');
    expect(attr(section, 'data-home-track')).toBe('experiments');
    expect(has(section, 'data-rule')).toBe(true);
    const h = head(section);
    expect(h).toMatchObject({
      chip: 'Experiments and analytics',
      title: 'Open the work and see how it was done.',
      quiet: 'and see how it was done.',
      sub: 'Each case study shows the method, the sources and what it cannot tell you.',
    });
    expect(attr(section, 'aria-labelledby')).toBe(h.id);
  });

  it('puts the phase line under the sub, before the cards, and holds no note (the live bar has it)', () => {
    const html = track('a', 'calibration');
    expect(html.indexOf('data-home-card-line')).toBeGreaterThan(html.indexOf('Each case study shows the method'));
    expect(html.indexOf('data-home-card-line')).toBeLessThan(html.indexOf('data-experiment="cards"'));
    expect(text(one(doc(html), (el) => has(el, 'data-home-card-line')))).toBe(
      'These three headlines are what the test will compare. For now everyone sees the same ones.',
    );
    expect(html).not.toMatch(/data-home-tag|data-home-note/);
  });

  it('is the same markup in both groups once the headline twins are neutral', () => {
    const neutral = (h: string) => h.replaceAll(' data-headline-shown=""', '').replaceAll(' aria-hidden="true"', '').replaceAll(' invisible', '');
    expect(neutral(track('a'))).toBe(neutral(track('b')));
  });

  it('passes the truth audit', () => {
    for (const arm of ARMS) expect(audit(track(arm))).toEqual([]);
  });
});

describe('FeaturedCases: a vignette on each experiment card', () => {
  const cards = (arm: Arm) => render(createElement(FeaturedCases, { headlineArm: arm }));

  it('keeps the experiment attributes on each card and ends each in its vignette, the same in both groups', () => {
    for (const arm of ARMS) {
      const d = doc(cards(arm));
      const region = one(d, (el) => attr(el, 'data-experiment') === 'cards');
      const links = all(region, (el) => el.tagName === 'a');
      expect(links.map((a) => attr(a, 'data-experiment-click'))).toEqual(['card', 'card', 'card']);
      expect(links.map((a) => attr(a, 'data-case-card'))).toEqual(HEADLINES.map((h) => h.study));
      expect(links.map((a) => attr(a, 'href'))).toEqual(HOME_CASES.map((c) => c.href));
      for (const a of links) expect(all(a, (el) => has(el, 'data-headline-twin'))).toHaveLength(2);
      const vigs = expectVignettes(region, 3);
      expect(vigs.map(sketchOf)).toEqual(['process', 'cohorts', 'events']);
    }
  });

  it('draws the process on the Audible card, never a result: four ticked steps, no outcome word', () => {
    const v = one(doc(cards('a')), (el) => attr(el, 'data-sketch') === 'process');
    expect(all(v, (el) => has(el, 'data-mini-label')).map((el) => text(el))).toEqual(['Sample size', 'Run time', 'Guardrails', 'Recommendation']);
    expect(all(v, (el) => has(el, 'data-tag')).map((el) => text(el))).toEqual(['planned', 'set', 'checked', 'written']);
    expect(all(v, (el) => has(el, 'data-check'))).toHaveLength(4);
    expect(all(v, (el) => has(el, 'data-interval-mark'))).toHaveLength(0);
    expect(text(v)).not.toMatch(/higher|lower|clear|neutral|held|intact|win|lift/i);
  });

  it('draws a cohort grid on the retention card', () => {
    const v = one(doc(cards('a')), (el) => attr(el, 'data-sketch') === 'cohorts');
    expect(all(v, (el) => has(el, 'data-cohort-cell')).length).toBeGreaterThan(20);
  });

  it('lists three event names that the Pulse page prints, tagged activation, engagement and intent', () => {
    const v = one(doc(cards('a')), (el) => attr(el, 'data-sketch') === 'events');
    const rows = all(v, (el) => has(el, 'data-event'));
    expect(rows.map((r) => attr(r, 'data-event'))).toEqual(['Viewed Dashboard', 'Applied Filter', 'Exported Report']);
    for (const r of rows) expect(PULSE_EVENT_NAMES).toContain(attr(r, 'data-event'));
    expect(all(v, (el) => has(el, 'data-tag')).map((el) => text(el))).toEqual(['activation', 'engagement', 'intent']);
  });
});

describe('AutomationTrack: four cards with vignettes, then the three lines', () => {
  const html = render(createElement(AutomationTrack));
  const d = doc(html);
  const section = one(d, (el) => attr(el, 'data-home-track') === 'automation');

  it('is ruled and headed "Take the manual steps out, and keep the checks in."', () => {
    expect(has(section, 'data-rule')).toBe(true);
    const h = head(section);
    expect(h).toMatchObject({
      chip: 'Automation and agents',
      title: 'Take the manual steps out, and keep the checks in.',
      quiet: 'and keep the checks in.',
      sub: 'A tool my team at Audible adopted, and public projects where code checks the work before a person relies on it.',
    });
    expect(attr(section, 'aria-labelledby')).toBe(h.id);
  });

  it('keeps the four cards, their links, titles and Facts', () => {
    const links = all(section, (el) => el.tagName === 'a');
    expect(links.map((a) => attr(a, 'href'))).toEqual(['/work/audible#automation', '/work/docproof', '/work/n8n', '/work/marketingws']);
    // The project name is a small label inside the h3, so the link's name carries both.
    expect(links.map((a) => text(one(a, (el) => has(el, 'data-card-label'))))).toEqual(['Audible test-account tool', 'Docproof', 'n8n workflow library', 'MarketingWS']);
    expect(links.map((a) => text(one(a, (el) => has(el, 'data-card-title'))))).toEqual([
      'Set up a test account in about 3 minutes, not 20',
      'Let agents write, and let checks decide',
      'Check every e-invoice before a person has to',
      'Draft marketing copy, with a check for invented figures',
    ]);
    for (const a of links) expect(all(one(a, (el) => el.tagName === 'h3'), (el) => has(el, 'data-card-label'))).toHaveLength(1);
    for (const a of links) expect(has(a, 'data-experiment-click')).toBe(false);
    // The automation card's minutes are in its title; its description carries no figure.
    expect(all(d, (el) => has(el, 'data-fact')).map((el) => attr(el, 'data-fact'))).toEqual([
      'profile.audible.setup_minutes_after',
      'profile.audible.setup_minutes_before',
      'profile.audible.markets',
      'profile.n8n.automated_tests',
    ]);
  });

  it('ends each card in its vignette: recorded steps, three agents with one blocked claim, a three-node workflow, one brief to three variants', () => {
    const vigs = expectVignettes(section, 4);
    expect(vigs.map(sketchOf)).toEqual(['steps', 'agents', 'workflow', 'variants']);
    const [steps, agents, workflow, variants] = vigs as [El, El, El, El];
    expect(all(steps, (el) => has(el, 'data-check')).length).toBeGreaterThanOrEqual(3);
    // The generic mechanism, never the internal tool's own steps.
    expect(all(steps, (el) => has(el, 'data-mini-label')).map((el) => text(el))).toEqual(['Record', 'Replay', 'Verify']);
    expect(text(steps)).toContain('recorded once, replayed');
    expect(all(agents, (el) => has(el, 'data-mini-label')).map((el) => text(el))).toEqual(['Author', 'Claim auditor', 'Reviewer']);
    expect(all(agents, (el) => has(el, 'data-tag')).map((el) => text(el))).toEqual(['blocked: unsupported claim']);
    expect(all(workflow, (el) => has(el, 'data-node')).map((el) => text(el))).toEqual(['Intake', 'Validate', 'Alert']);
    expect(all(variants, (el) => has(el, 'data-node')).map((el) => text(el))).toEqual(['Brief']);
    expect(all(variants, (el) => has(el, 'data-variant'))).toHaveLength(3);
  });

  it('then one ruled row with the three "I automate." lines, title-less, after the cards', () => {
    const row = one(d, (el) => has(el, 'data-home-automate'));
    expect(html.indexOf('data-home-automate')).toBeGreaterThan(html.indexOf('/work/marketingws'));
    expect(all(row, (el) => /^h\d$/.test(el.tagName))).toEqual([]);
    const ul = one(row, (el) => el.tagName === 'ul');
    expect(attr(ul, 'role')).toBe('list');
    // Three equal cells: the outer two have one padding, so their tracks are a third of it narrower.
    expect(classes(ul)).toContain('md:grid-cols-[minmax(0,calc(100%/3_-_0.5rem))_minmax(0,1fr)_minmax(0,calc(100%/3_-_0.5rem))]');
    for (const li of all(ul, (el) => el.tagName === 'li')) expect(classes(li)).toEqual(expect.arrayContaining(['md:px-6', 'md:first:pl-0', 'md:last:pr-0']));
    expect(all(ul, (el) => el.tagName === 'li').map((li) => text(li))).toEqual([
      'I turn repeated manual steps into tools a whole team can use.',
      'I build agents in which code, not the model, has the last word on facts.',
      'I test my workflows against the ways they fail, not only when everything goes right.',
    ]);
  });

  it('passes the truth audit and keeps the limits', () => {
    expect(text(d)).toContain('Tampermonkey with a step recorder');
    expect(text(d)).not.toMatch(/deployed|in production|\bused by (?!a client)/i);
    expect(audit(html)).toEqual([]);
  });
});

describe('QuestionsRows', () => {
  const html = render(createElement(QuestionsRows));
  const d = doc(html);
  const section = one(d, (el) => has(el, 'data-home-questions'));
  const QUESTIONS = [
    'Is the sample big enough?',
    'How long should the test run?',
    'Did the guardrails hold?',
    'Is the difference real?',
    'Should we ship it?',
    'Which step can be automated?',
    "Who checks the agent's work?",
    'Will it still work next month?',
  ];

  it('is ruled and headed "The questions a team asks. I bring the answers, written down."', () => {
    expect(has(section, 'data-rule')).toBe(true);
    const h = head(section);
    expect(h).toMatchObject({ chip: 'Questions', title: 'The questions a team asks. I bring the answers, written down.', quiet: 'I bring the answers, written down.', sub: null });
    expect(attr(section, 'aria-labelledby')).toBe(h.id);
  });

  it('has two sliding rows (the ribbon mechanic), the second sliding the other way, eight question chips in all', () => {
    const rows = all(section, (el) => has(el, 'data-depth-ribbon'));
    expect(rows).toHaveLength(2);
    const lists = rows.map((r) => one(r, (el) => el.tagName === 'ul'));
    expect(classes(lists[0]!)).not.toContain('[animation-direction:reverse]');
    expect(classes(lists[1]!)).toContain('[animation-direction:reverse]');
    // role="list" because the rows drop their list style (VoiceOver); no label of their own, so the
    // section's name is not read again for each row.
    for (const ul of lists) expect(attr(ul, 'role')).toBe('list');
    for (const ul of lists) expect(attr(ul, 'aria-labelledby')).toBeUndefined();
    const chips = all(section, (el) => has(el, 'data-chip'));
    expect(chips.slice(1).map((c) => text(c))).toEqual(QUESTIONS);
  });

  it('holds no link and no digit', () => {
    expect(all(section, (el) => el.tagName === 'a')).toEqual([]);
    expect(text(section)).not.toMatch(/\d/);
  });
});

describe('ToolsBand', () => {
  const html = render(createElement(ToolsBand));
  const d = doc(html);
  const band = one(d, (el) => has(el, 'data-home-shipped'));
  const groups = all(band, (el) => has(el, 'data-tools-group'));

  it('is a ruled band labelled by its left-aligned line "Methods and tools", with no ribbon', () => {
    expect(band.tagName).toBe('section');
    expect(has(band, 'data-rule')).toBe(true);
    expect(has(band, 'data-depth-ribbon')).toBe(false);
    expect(all(band, (el) => has(el, 'data-depth-ribbon'))).toEqual([]);
    const label = one(band, (el) => has(el, 'data-tools-label'));
    expect(label.tagName).toBe('p');
    expect(text(label)).toBe('Methods and tools');
    expect(attr(band, 'aria-labelledby')).toBe(attr(label, 'id'));
    expect(classes(label)).not.toContain('text-center');
    expect(classes(label)).toEqual(expect.arrayContaining(['mx-auto', 'max-w-figure']));
  });

  it('holds two groups, side by side from lg and one column below', () => {
    expect(groups.map((g) => attr(g, 'data-tools-group'))).toEqual(['experiments', 'automation']);
    const grid = one(band, (el) => has(el, 'data-tools-groups'));
    expect(classes(grid)).toEqual(expect.arrayContaining(['grid', 'grid-cols-1', 'lg:grid-cols-2']));
  });

  it('gives each group its name, its line, a list of chips labelled by the name, and where it was used', () => {
    for (const [i, g] of groups.entries()) {
      const data = HOME_TOOLS.groups[i]!;
      const name = one(g, (el) => has(el, 'data-tools-name'));
      expect(text(name)).toBe(data.name);
      expect(classes(name)).toEqual(expect.arrayContaining(['text-sm', 'font-semibold']));
      const line = one(g, (el) => has(el, 'data-tools-line'));
      expect(text(line)).toBe(data.line);
      expect(classes(line)).toEqual(expect.arrayContaining(['text-sm', 'text-muted']));
      const ul = one(g, (el) => el.tagName === 'ul');
      expect(attr(ul, 'role')).toBe('list');
      expect(attr(ul, 'aria-labelledby')).toBe(attr(name, 'id'));
      expect(classes(ul)).toContain('flex-wrap');
      const items = all(ul, (el) => el.tagName === 'li').map((li) => text(li));
      expect(items).toEqual([...data.items]);
      expect(all(ul, (el) => has(el, 'data-chip'))).toHaveLength(items.length);
      const seen = one(g, (el) => has(el, 'data-tools-seen'));
      expect(text(seen)).toBe(data.seenIn);
      expect(classes(seen)).toEqual(expect.arrayContaining(['text-xs', 'text-muted']));
    }
    expect(groups.map((g) => all(g, (el) => el.tagName === 'li').map((li) => text(li)))).toEqual([
      ['A/B testing', 'Sample size and power', 'Guardrail metrics', 'SQL', 'Python'],
      ['Multi-agent pipelines (Claude Code)', 'Automated verification', 'n8n workflows', 'LLM APIs', 'Browser automation'],
    ]);
  });

  it('ends in one quiet engineering line after the groups, not chips', () => {
    const eng = one(band, (el) => has(el, 'data-tools-engineering'));
    expect(eng.tagName).toBe('p');
    expect(text(eng)).toBe('Engineering: FastAPI, React and TypeScript, Docker and GitHub Actions, in my public projects.');
    expect(classes(eng)).toEqual(expect.arrayContaining(['text-sm', 'text-muted']));
    expect(all(eng, (el) => has(el, 'data-chip'))).toEqual([]);
    expect(html.indexOf('data-tools-engineering')).toBeGreaterThan(html.lastIndexOf('data-tools-seen'));
  });

  it('is Home\'s own list, not About\'s, and adds no link, control or heading', () => {
    const chips = all(band, (el) => has(el, 'data-chip')).map((c) => text(c));
    expect(chips).toHaveLength(10);
    expect(chips).not.toEqual(SHIPPED_TOOLS.map((t) => t.tool));
    expect(all(band, (el) => ['a', 'button', 'input', 'select', 'textarea'].includes(el.tagName))).toEqual([]);
    expect(all(band, (el) => /^h\d$/.test(el.tagName))).toEqual([]);
    expect(text(band)).not.toMatch(/Excel|Tableau|as a data source/);
  });

  it('never ties the AI and automation group to Audible, and passes the truth audit', () => {
    expect(text(groups[1]!)).not.toMatch(/Audible|Amazon/);
    expect(audit(html)).toEqual([]);
  });
});

describe('SiteTile: the site band', () => {
  const html = render(createElement(SiteTile));
  const d = doc(html);
  const root = one(d, (el) => has(el, 'data-home-site'));

  it('takes no props: the same band for every visitor and every state', () => {
    expect(SiteTile.length).toBe(0);
  });

  it('is a white card on the frame: chip "Live test", the two-tone h2, the sentence and two buttons', () => {
    expect(root.tagName).toBe('section');
    expect(has(root, 'data-rule')).toBe(true);
    const tile = one(root, (el) => has(el, 'data-tile'));
    expect(attr(tile, 'data-tile')).toBe('');
    expect(text(one(root, (el) => has(el, 'data-chip')))).toBe('Live test');
    const h2 = one(root, (el) => el.tagName === 'h2');
    expect(squash(text(h2))).toBe('This site is part of the evidence.');
    expect(text(one(h2, (el) => has(el, 'data-quiet')))).toBe('part of the evidence.');
    expect(attr(root, 'aria-labelledby')).toBe(attr(h2, 'id'));
    expect(text(one(root, (el) => has(el, 'data-home-site-text')))).toBe(
      'It runs an A/B test on the three experiment cards above. The plan was published before the test started, and the data is public. I built it with coding agents, and every change passes its automated checks before it ships.',
    );
    const buttons = all(root, (el) => el.tagName === 'a');
    expect(buttons.map((a) => text(a))).toEqual(['See the live test', 'Try the Lab']);
    expect(buttons.map((a) => attr(a, 'href'))).toEqual([HOME_LINKS.experiment, HOME_LINKS.lab]);
  });

  it('has a tilted sketch of a confidence chart, an illustration with no text in its SVG', () => {
    const [v] = expectVignettes(root, 1);
    expect(sketchOf(v!)).toBe('confidence');
    for (const svg of all(v!, (el) => el.tagName === 'svg')) expect(all(svg, (el) => el.tagName === 'text')).toEqual([]);
  });

  it('holds no note and types no numeral', () => {
    expect(all(d, (el) => has(el, 'data-home-note'))).toEqual([]);
    expect(text(d)).not.toMatch(/\d|more than/);
  });
});

describe('HomeFaq', () => {
  const html = render(createElement(HomeFaq));
  const d = doc(html);
  const root = one(d, (el) => has(el, 'data-home-faq'));

  it('is ruled and headed "FAQ", "Questions hiring teams ask", with its sub', () => {
    expect(has(root, 'data-rule')).toBe(true);
    expect(head(root)).toMatchObject({ chip: 'FAQ', title: 'Questions hiring teams ask', quiet: null, sub: 'Short answers; the pages behind them have the detail.' });
  });

  it('has eight native rows, the first open, with the answers word for word', () => {
    const rows = all(root, (el) => el.tagName === 'details');
    expect(rows.map((r) => has(r, 'open'))).toEqual([true, false, false, false, false, false, false, false]);
    const qa = rows.map((r) => [squash(text(one(r, (el) => el.tagName === 'summary'))), squash(text(one(r, (el) => has(el, 'data-faq-answer'))))]);
    expect(qa).toEqual([
      ['What roles are you looking for?', 'Roles in experimentation, product analytics and AI automation in Germany. I am based in Berlin.'],
      [
        'What did you do at Audible?',
        'I was a working student for nearly two years, mainly in growth experimentation with some marketing analytics. I contributed to 25+ A/B tests across web and mobile, did the sample-size planning and significance testing myself, and built a browser-automation tool, Tampermonkey with a step recorder, that cut test-account setup from about 20 to about 3 minutes.',
      ],
      [
        'What have you done since Audible?',
        "I finished my MSc in Data Science in Nov 2025. Since then I have rebuilt my Master's projects on public data and built Docproof, the n8n workflow library and this site. Since Oct 2026 I also work on contract at Mercor, building training data for AI models.",
      ],
      [
        'Can I see the Audible results?',
        'Not the figures: revenue, conversion and lift numbers are confidential. You can see how I worked on the Audible page, the statistics on simulated data in the Lab, and a real test with public data on the Live test page.',
      ],
      [
        'How do you work with AI?',
        'I have built internal AI tools that a wider team adopted: one reviews past A/B tests and their results and suggests new test ideas, the other generates the standard content of the Jira ticket for a test launch. I have also evaluated Amazon Bedrock for team-efficiency use cases. Today I build with Claude Code agents and skills. In Docproof, separate agents write, audit and review a document, and automated checks decide what reaches the reader.',
      ],
      ['Is the code public?', 'Yes. Docproof and the n8n workflow library are on GitHub under the MIT licence, and so is the code of this site.'],
      ['Which languages do you speak?', 'Arabic (native), English and French (fluent, C2), German (B1) and Spanish (A2).'],
      // The contact form passes each message on to my inbox (the privacy notice says so), so the last sentence stays.
      ['How do I reach you?', 'Through the contact form or on LinkedIn. I answer myself.'],
    ]);
  });

  it('links the pages and the repositories its answers name', () => {
    const row = (q: string) => all(root, (el) => el.tagName === 'details').find((r) => text(r).includes(q))!;
    const links = (q: string) => all(row(q), (el) => el.tagName === 'a').map((a) => [squash(text(a)), attr(a, 'href')]);
    expect(links('Can I see the Audible results?')).toEqual([
      ['the Audible page', '/work/audible'],
      ['the Lab', '/lab'],
      ['the Live test page', '/experiment'],
    ]);
    expect(links('Is the code public?')).toEqual([
      ['Docproof', DOCPROOF_REPO],
      ['the n8n workflow library', N8N_REPO.base],
    ]);
  });

  it('prints the months of the new row the way the About timeline prints them, from its own entries', () => {
    const times = all(row0(root, 'What have you done since Audible?'), (el) => el.tagName === 'time');
    const msc = TIMELINE.find((t) => t.role === 'MSc Data Science')!;
    const mercor = TIMELINE.find((t) => t.where.startsWith('Mercor'))!;
    expect(times.map((t) => attr(t, 'datetime'))).toEqual([msc.range.to, mercor.range.from]);
    expect(times.map((t) => text(t))).toEqual(['Nov 2025', 'Oct 2026']);
  });

  it('aligns its head like the other Home heads: centred, the sub under the h2', () => {
    expect(attr(one(root, (el) => has(el, 'data-section-head')), 'data-align')).toBe('center');
  });

  it("answers the languages question from the About page's own list, so the two never disagree", () => {
    const row = all(root, (el) => el.tagName === 'details').find((r) => text(r).includes('Which languages do you speak?'));
    for (const l of LANGUAGES) expect(text(row!)).toContain(l.language);
    for (const l of LANGUAGES) expect(text(row!)).toContain(l.level.replace(' (', ', ').replace(')', ''));
  });

  it('prints every figure as a Fact and passes the truth audit', () => {
    expect(all(root, (el) => has(el, 'data-fact')).map((el) => attr(el, 'data-fact'))).toEqual([
      'profile.audible.experiments',
      'profile.audible.setup_minutes_before',
      'profile.audible.setup_minutes_after',
    ]);
    expect(audit(html)).toEqual([]);
  });
});

describe('HomeCallToAction: the dark call to action with the portrait', () => {
  const d = doc(render(createElement(HomeCallToAction)));
  const root = one(d, (el) => has(el, 'data-home-cta'));

  it('is the ink panel: "Find out what I can do for your team.", the line and two buttons', () => {
    expect(has(root, 'data-rule')).toBe(true);
    const panel = one(root, (el) => has(el, 'data-cta'));
    const h2 = one(panel, (el) => el.tagName === 'h2');
    expect(squash(text(h2))).toBe('Find out what I can do for your team.');
    expect(text(one(h2, (el) => has(el, 'data-quiet')))).toBe('for your team.');
    expect(text(one(panel, (el) => el.tagName === 'p'))).toBe(
      'Open to roles in experimentation, product analytics and AI automation in Germany. Based in Berlin.',
    );
    const links = all(panel, (el) => el.tagName === 'a');
    expect(links.map((a) => text(a))).toEqual(['Write to me', 'Read my CV', 'LinkedIn']);
    expect(links.map((a) => attr(a, 'href'))).toEqual([CONTACT_HREF, CV_LINK.href, CONTACT.linkedin]);
    expect(attr(links[2]!, 'rel')).toBe('noopener');
  });

  it('sits in the same ruled band, with the same space above and below, as on every other page', async () => {
    const { PageCallToAction } = await import('@/components/shell/PageCallToAction');
    const page = one(doc(render(createElement(PageCallToAction))), (el) => has(el, 'data-page-cta'));
    const spacing = (el: El) => classes(el).filter((c) => /^(md:)?p[tb]-/.test(c)).sort();
    expect(spacing(root)).toEqual(spacing(page));
  });

  it("shows the About page's portrait at the right, lazily loaded", () => {
    const media = one(root, (el) => has(el, 'data-cta-media'));
    const img = one(media, (el) => el.tagName === 'img');
    expect(attr(img, 'alt')).toBe(aboutPhoto.alt);
    expect(attr(img, 'loading')).toBe('lazy');
    expect(decodeURIComponent(attr(img, 'src') ?? '')).toContain(aboutPhoto.src);
  });

  it('claims no work authorisation and no phone number', () => {
    expect(text(d)).not.toMatch(/visa|permit|authori[sz]ation|\+?\d[\d ()-]{7,}/i);
  });
});
