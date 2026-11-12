// /demo, the links I open when I share my screen in an interview: the home page in each group, forced
// with `?variant=`, and two Lab links with their URL state. The page is static, not indexed but
// followed, outside the menu, and it reads nothing from the live test and sends it nothing. The forced
// links use the existing contract only: the proxy and assignArm give the requested group and mark it
// forced, and the beacon's classifier refuses a forced view before any entry rule. What a forced view
// shows follows the frozen design: group A's headlines in both groups during the calibration, the
// requested group's in the A/B. tests/e2e/demo.spec.ts drives the same links in a browser against the
// local store.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { LAB_SECTIONS } from '../../../content/lab';
import { DEMO_COPY, FORCED_LINKS, LAB_LINKS, PLANNER_LINK, ForcedNote } from '../../../content/demo';
import { DEMO_TITLE, DemoPage } from '@/components/demo/DemoPage';
import { TextLink } from '@/components/kit/TextLink';
import { FeaturedCases } from '@/components/home/FeaturedCases';
import { EXPERIMENT, type Arm, type ExperimentPhase } from '@/experiment.values';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import { assignArm } from '@/lib/experiment/assign';
import { classifyEntry, type EntrySignals } from '@/lib/experiment/entry';
import { readFigureParams } from '@/lib/figure/url-state';
import { snapshotFixture } from '@/lib/home/fixtures';
import { toHomeModel } from '@/lib/home/model';
import {
  DURATION_ID,
  DURATION_PRESETS,
  DURATION_SCHEMA,
  FULL_PLANNER_ID,
  FULL_PLAN_PRESETS,
  FULL_PLAN_SCHEMA,
  normalizeFullPlan,
  normalizeTraffic,
} from '@/lib/lab/full-planner-values';
import { PEEK_ID, PEEK_PRESETS, PEEK_SCHEMA } from '@/lib/lab/peeking-values';
import { LIVE_ROUTES, NAV } from '@/lib/site';
import { proxy } from '@/proxy';

const repo = join(import.meta.dirname, '../../..');
const ORIGIN = 'http://localhost:3123';
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Visible text: tags removed, entities decoded, whitespace collapsed, no space before punctuation. */
const text = (markup: string) =>
  decode(markup.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;)])/g, '$1')
    .trim();
const audit = (markup: string) =>
  auditHtml(`<!doctype html><html><head><title>t</title></head><body>${markup}</body></html>`, {
    route: '/demo',
    factIds: new Set(Object.keys(FACTS)),
    factDisplays: FACT_DISPLAYS,
    denylist: [],
  });
/** Every link in the markup, in document order: its href (decoded), its text and its own markup. */
const links = (markup: string) =>
  [...markup.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: decode(m[1]!), label: text(m[2]!), html: m[0] }));
/** The markup of the section with this id (sections do not nest). */
const section = (markup: string, id: string) => {
  const start = markup.indexOf(`<section id="${id}"`);
  if (start < 0) throw new Error(`no section ${id}`);
  return markup.slice(start, markup.indexOf('</section>', start));
};

const PAGE = renderToStaticMarkup(<DemoPage />);

const FORCED_HREFS = ['/?variant=a', '/?variant=b'] as const;
const PEEKING_HREF = '/lab/peeking?peeking.preset=interview';
const PLANNER_HREF = '/lab?planner.baseline=0.05&planner.risePoints=1&duration.traffic=1000#sample-size';

// The page's words, exactly as a visitor reads them.
const INTRO =
  'I open these links when I share my screen in an interview. This page is not in the menu, and search engines are asked not to list it.';
const FORCED_LEAD = 'Each link opens the home page as one group of the live test sees it.';
const FORCED_EXCLUDED =
  'Views opened through these links are never counted in the live test. The home page reports each one as a view whose group was chosen in the address, and the server leaves it out of the results. This page itself sends nothing to the live test.';
const PHASE_NOTE: Record<ExperimentPhase, string> = {
  calibration: "Until the A/B test starts, both groups see group A's headlines, so both links show the same headlines.",
  ab: "Once the A/B test has started, each link shows its own group's headlines.",
};
const LAB_NOTE = "The planner link's settings apply once the planner's controls load. Without JavaScript, the planner shows its default settings instead.";
const LINK_ROWS = [
  ['/?variant=a', "Group A's home page", null],
  ['/?variant=b', "Group B's home page", null],
  [PEEKING_HREF, 'Peeking at results', 'The peeking example on its own page: what checking a running test every day does to its false positives.'],
  [PLANNER_HREF, 'Sample size for a small rise', "The Lab's sample-size planner and its duration, set to a small rise on a low baseline and more daily visitors than its default."],
  ['/lab', 'All the examples in the Lab', 'The whole Lab: sample size, peeking, the split check and exaggeration.'],
] as const;

/** A view of / opened by a click from /demo: a fresh navigation of the demo document, then a soft one. */
const fromDemo = (forced: boolean): EntrySignals => ({
  optOut: false,
  navigationType: 'navigate',
  entryPath: '/demo',
  referrer: `${ORIGIN}/demo`,
  origin: ORIGIN,
  prerendered: false,
  restoredFromCache: false,
  forced,
  webdriver: false,
  priorViewInDocument: false,
});
/** The same link opened on its own: everything an entry needs, except that the group was asked for. */
const freshLoad = (forced: boolean): EntrySignals => ({ ...fromDemo(forced), entryPath: '/', referrer: '' });

/** The group the proxy rewrites a request for this href to, and the response headers it sets. */
function proxied(href: string): { target: string; arm: string | null; cookie: string | null } {
  const res = proxy(new NextRequest(new URL(href, ORIGIN), { headers: { 'user-agent': CHROME } }));
  const rewrite = res.headers.get('x-middleware-rewrite');
  if (rewrite === null) throw new Error(`no rewrite for ${href}`);
  const u = new URL(rewrite);
  return { target: `${u.pathname}${u.search}`, arm: res.headers.get('x-arm'), cookie: res.headers.get('set-cookie') };
}

/** The group whose headlines are visible and announced: the twin without aria-hidden, on every card. */
function announcedHeadlines(markup: string): string[] {
  return [...markup.matchAll(/<[^>]*data-headline-twin="([ab])"[^>]*>/g)].filter((m) => !/aria-hidden="true"/.test(m[0])).map((m) => m[1]!);
}

describe('the /demo route', () => {
  it('is a thin static page that renders DemoPage, followed but not indexed', async () => {
    const source = readFileSync(join(repo, 'src/app/demo/page.tsx'), 'utf8');
    expect(source).toContain('<DemoPage />');
    expect(source).not.toMatch(/revalidate|dynamic|searchParams|cookies\(|headers\(|getExperimentSnapshot/);
    const mod = (await import('@/app/demo/page')) as {
      default: () => React.ReactNode;
      metadata: { title?: unknown; description?: unknown; robots?: unknown };
    };
    expect(mod.metadata.robots).toEqual({ index: false, follow: true });
    expect(mod.metadata.title).toBe(DEMO_TITLE);
    expect(mod.metadata.description).toBe('The links I open when I share my screen in an interview.');
    expect(`${String(mod.metadata.title)} ${String(mod.metadata.description)}`).not.toMatch(/\d/);
    expect(renderToStaticMarkup(<>{mod.default()}</>)).toBe(PAGE);
  });

  it('is a live route, and not in the menu', () => {
    expect(LIVE_ROUTES).toContain('/demo');
    expect(NAV.map((n) => n.href)).not.toContain('/demo');
  });
});

describe('DemoPage', () => {
  it('has one h1, Interview links, and opens with what the page is for', () => {
    expect([...PAGE.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    expect(PAGE).toMatch(/<h1 id="demo-title"[^>]*>Interview links<\/h1>/);
    expect(DEMO_TITLE).toBe('Interview links');
    expect(text(PAGE.slice(0, PAGE.indexOf('<section')))).toBe(`Interview links ${INTRO}`);
    expect(DEMO_COPY.description).toBe('The links I open when I share my screen in an interview.');
  });

  it('lists exactly five links, in order, each a 44 px site link, with its words', () => {
    const found = links(PAGE);
    expect(found.map((l) => [l.href, l.label])).toEqual(LINK_ROWS.map(([href, label]) => [href, label]));
    for (const l of found) {
      expect(l.html, l.href).toContain('data-touch-target=""');
      expect(l.href.startsWith('/'), l.href).toBe(true);
      // an ordinary same-tab link: no new window, no rel
      expect(l.html, l.href).not.toMatch(/\s(?:target|rel)=/);
    }
    // a Lab link is followed by its own sentence on what it opens, in plain words with no number
    const lab = section(PAGE, 'lab-examples');
    for (const [href, , purpose] of LINK_ROWS.filter((r) => r[2] !== null)) {
      const start = lab.indexOf(`href="${href.replace(/&/g, '&amp;')}"`);
      expect(start, href).toBeGreaterThan(-1);
      const item = lab.slice(start, lab.indexOf('</li>', start));
      expect(text(item.slice(item.indexOf('</a>'))), href).toBe(purpose);
      expect(purpose, href).not.toMatch(/\d/);
    }
  });

  it('draws the forced links as plain anchors (a full load the proxy assigns) with the kit link look', () => {
    const classes = (html: string) => new Set(/class="([^"]*)"/.exec(html)![1]!.split(/\s+/));
    const kit = links(renderToStaticMarkup(<TextLink href="/lab" standalone>x</TextLink>))[0]!;
    const found = links(PAGE);
    for (const l of found.filter((x) => FORCED_HREFS.includes(x.href as (typeof FORCED_HREFS)[number]))) {
      expect(l.html, l.href).toContain('data-full-load=""');
      expect(classes(l.html), l.href).toEqual(classes(kit.html));
    }
    // the Lab links are next/link (the kit's TextLink), whose Figures read the query in the browser
    for (const l of found.filter((x) => !x.href.startsWith('/?'))) expect(l.html, l.href).not.toContain('data-full-load');
    const source = readFileSync(join(repo, 'src/components/demo/DemoPage.tsx'), 'utf8');
    expect(/function ForcedLinks[\s\S]*?\n\}/.exec(source)![0]).not.toMatch(/TextLink|<Link/);
  });

  it('shows the forced links with what they show and why they never count', () => {
    const forced = section(PAGE, 'home-groups');
    expect(text(forced)).toBe(
      ["The home page in each group", FORCED_LEAD, "Group A's home page", "Group B's home page", PHASE_NOTE[EXPERIMENT.phase], FORCED_EXCLUDED].join(' '),
    );
    expect(FORCED_LINKS.map((l) => l.href)).toEqual([...FORCED_HREFS]);
  });

  it('says what each phase shows: the same headlines while calibrating, each group its own in the A/B', () => {
    for (const phase of ['calibration', 'ab'] as const) {
      expect(text(renderToStaticMarkup(<ForcedNote phase={phase} />)), phase).toBe(PHASE_NOTE[phase]);
    }
  });

  it('lists the Lab links and discloses that the planner settings need JavaScript', () => {
    const lab = section(PAGE, 'lab-examples');
    expect(text(lab).startsWith('Lab examples ')).toBe(true);
    expect(text(lab).endsWith(LAB_NOTE)).toBe(true);
    expect(LAB_LINKS.map((l) => l.href)).toEqual([PEEKING_HREF, PLANNER_HREF, '/lab']);
  });

  it('carries no live-test part: no beacon, no cards, no group label, no store read', () => {
    expect(PAGE).not.toMatch(/data-experiment|data-headline-twin|data-phase-label|data-test-note|data-figure/);
    for (const file of ['src/components/demo/DemoPage.tsx', 'content/demo.tsx', 'src/app/demo/page.tsx']) {
      const source = readFileSync(join(repo, file), 'utf8');
      expect(source, file).not.toMatch(/ExperimentBeacon|getExperimentSnapshot|experiment\/live|PhaseLabel|LiveNote|\/api\/e|\/exclude|EXCLUDE_TOKEN/);
    }
  });

  it('passes the truth audit and prints no digit', () => {
    expect(audit(PAGE)).toEqual([]);
    expect(text(PAGE)).not.toMatch(/\d/);
  });
});

describe('the forced links use the existing assignment contract', () => {
  it.each(FORCED_HREFS)('%s: the proxy rewrites to the asked group, names it in x-arm and sets no cookie', (href) => {
    const arm = new URL(href, ORIGIN).searchParams.get('variant');
    expect(proxied(href)).toEqual({ target: `/v/${arm}?variant=${arm}`, arm, cookie: null });
  });

  it.each(FORCED_HREFS)('%s: assignArm gives the asked group whatever the draw, marked forced', (href) => {
    const search = new URL(href, ORIGIN).searchParams;
    const arm = search.get('variant');
    for (const draw of [0, 0.49, 0.5, 0.99]) {
      expect(assignArm({ search, userAgent: CHROME, random: () => draw })).toEqual({ arm, forced: true, bot: false });
    }
  });

  it('the classifier refuses a forced view as forced before any entry rule, from this page or opened on its own', () => {
    for (const signals of [fromDemo, freshLoad]) expect(classifyEntry(signals(true))).toBe('forced');
    // the control: without the forced flag, the same fresh load is an entry
    expect(classifyEntry(freshLoad(false))).toBe('entry');
  });

  it.each(['ab', 'calibration'] as const)('in the %s, each forced view shows the headlines the frozen design gives its group', (mode) => {
    for (const href of FORCED_HREFS) {
      const { arm } = proxied(href);
      const model = toHomeModel(snapshotFixture(mode), arm as Arm);
      const expected = mode === 'ab' ? arm : 'a';
      expect(model.headlineArm, href).toBe(expected);
      const shown = announcedHeadlines(renderToStaticMarkup(<FeaturedCases headlineArm={model.headlineArm} />));
      expect(shown.length, href).toBeGreaterThan(0);
      expect(new Set(shown), href).toEqual(new Set([expected]));
    }
  });
});

describe('the Lab links reuse the Lab routes and their URL state', () => {
  it('lead to live routes and to a section that exists', () => {
    for (const { href } of LAB_LINKS) expect(LIVE_ROUTES, href).toContain(new URL(href, ORIGIN).pathname);
    const planner = new URL(PLANNER_LINK.href, ORIGIN);
    const section = LAB_SECTIONS.find((s) => `#${s.id}` === planner.hash);
    expect(section?.figure).toBe(FULL_PLANNER_ID);
  });

  it('the peeking link asks for the interview preset, and nothing else', () => {
    const search = new URL(PEEKING_HREF, ORIGIN).searchParams;
    expect([...search.keys()]).toEqual([`${PEEK_ID}.preset`]);
    expect(readFigureParams(search, PEEK_ID, PEEK_SCHEMA, PEEK_PRESETS)).toEqual({ values: PEEK_PRESETS.interview, preset: 'interview' });
  });

  it('the planner link sets only planner and duration keys, to valid values other than the presets', () => {
    const search = new URL(PLANNER_LINK.href, ORIGIN).searchParams;
    expect([...search.keys()].every((k) => k.startsWith(`${FULL_PLANNER_ID}.`) || k.startsWith(`${DURATION_ID}.`))).toBe(true);
    const plan = readFigureParams(search, FULL_PLANNER_ID, FULL_PLAN_SCHEMA, FULL_PLAN_PRESETS);
    const duration = readFigureParams(search, DURATION_ID, DURATION_SCHEMA, DURATION_PRESETS);
    expect(plan.values).toEqual({ baseline: PLANNER_LINK.baseline, risePoints: PLANNER_LINK.risePoints, mode: 'absolute' });
    expect(normalizeFullPlan(plan.values)).toEqual(plan.values);
    expect(duration.values).toEqual({ traffic: PLANNER_LINK.traffic });
    expect(normalizeTraffic(duration.values.traffic)).toBe(PLANNER_LINK.traffic);
    // each value differs from the preset, so a browser test can tell the link's view from the default
    expect(PLANNER_LINK.baseline).not.toBe(FULL_PLAN_PRESETS.default.baseline);
    expect(PLANNER_LINK.risePoints).not.toBe(FULL_PLAN_PRESETS.default.risePoints);
    expect(PLANNER_LINK.traffic).not.toBe(DURATION_PRESETS.default.traffic);
    // a small rise on a low baseline, and more traffic than the default, as the words say
    expect(PLANNER_LINK.baseline).toBeLessThan(FULL_PLAN_PRESETS.default.baseline);
    expect(PLANNER_LINK.risePoints).toBeLessThan(FULL_PLAN_PRESETS.default.risePoints);
    expect(PLANNER_LINK.traffic).toBeGreaterThan(DURATION_PRESETS.default.traffic);
  });
});

describe('CLAUDE.md', () => {
  it('lists DemoPage among the composites', () => {
    const claudeMd = readFileSync(join(repo, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toMatch(/\| `DemoPage`, `DEMO_TITLE` \| `src\/components\/demo\/DemoPage\.tsx` \|/);
  });
});
