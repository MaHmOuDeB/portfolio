// The Retention case study page, the reference page later pages copy. It composes the sourced prose
// and the four public-data Figures in the analysis template's order: a summary, then the problem,
// the data, the method, one section per analysis step, the findings, how I checked this, the limits
// and the links. Every number on it is a <Fact> or a <Derived> (the build's truth audit), the
// win-back part is a sizing only (with a planner of a hypothetical uplift beside the sourced sizing),
// and nothing on it comes from the live experiment.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RETENTION_SECTIONS, RetentionCaseStudy, RetentionPage } from '@/components/retention/RetentionPage';
import { REVERSAL_SQL_READ_AT } from '../../../content/retention';
import { FACTS, FACT_DISPLAYS, getFact } from '@/lib/facts';
import { RETENTION } from '@/lib/retention/data';
import { sampleSizePerArm } from '@/lib/stats';
import { auditHtml } from '../../../scripts/truth-audit.ts';

const repo = join(import.meta.dirname, '../../..');
const lock = JSON.parse(readFileSync(join(repo, 'sources.lock.json'), 'utf8')) as {
  sources: Record<string, { repo: string; commit: string; path: string }>;
};

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Visible text: tags removed, entities decoded, whitespace collapsed, no space before punctuation. */
const text = (markup: string) =>
  decode(markup.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;)])/g, '$1')
    .replace(/\( /g, '(')
    .trim();
/** The markup of the section with this id (sections do not nest). */
const section = (markup: string, id: string) => {
  const start = markup.indexOf(`<section id="${id}"`);
  if (start < 0) throw new Error(`no section ${id}`);
  return markup.slice(start, markup.indexOf('</section>', start));
};

// The page as it ships: the composition with its win-back planner.
const PAGE = renderToStaticMarkup(<RetentionCaseStudy />);
const PAGE_TEXT = text(PAGE);
const ctx = { route: '/work/retention', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };

const ORDER = [
  ['summary', 'Summary'],
  ['problem', 'The problem'],
  ['data', 'The data'],
  ['method', 'Method'],
  ['returns-cleaning', 'Cleaning: reversed orders and returns'],
  ['cohort-retention', 'Cohorts: who orders again, month by month'],
  ['customer-segments', 'Customer segments'],
  ['repeat-order-model', 'A model of who orders again'],
  ['win-back-sizing', 'Sizing a win-back test'],
  ['findings', 'Findings'],
  ['how-i-checked-this', 'How I checked this'],
  ['limits', 'Limits'],
  ['sources', 'Sources and links'],
] as const;

describe('the outline', () => {
  it('has one h1, the page title', () => {
    expect([...PAGE.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    expect(PAGE).toMatch(/<h1 id="retention-title"[^>]*>Customer retention and reactivation analysis<\/h1>/);
  });

  it('puts the sections in the analysis template order, each named by its own h2', () => {
    const sections = [...PAGE.matchAll(/<section id="([^"]+)" aria-labelledby="([^"]+)"[^>]*>\s*<h2 id="([^"]+)"[^>]*>([^<]+)<\/h2>/g)].map(
      (m) => [m[1], m[2], m[3], decode(m[4]!)],
    );
    expect(sections.map(([id, , , title]) => [id, title])).toEqual(ORDER.map(([id, title]) => [id, title]));
    for (const [id, labelledBy, headingId] of sections) {
      expect(labelledBy).toBe(`${id}-title`);
      expect(headingId).toBe(`${id}-title`);
    }
    expect(RETENTION_SECTIONS.map((s) => s.id)).toEqual(ORDER.map(([id]) => id));
    // every h2 on the page is a section title: no stray level
    expect([...PAGE.matchAll(/<h2[\s>]/g)]).toHaveLength(ORDER.length);
  });

  it('has concise section links whose targets exist, in page order, under a named navigation', () => {
    const nav = /<nav aria-label="On this page"[^>]*>([\s\S]*?)<\/nav>/.exec(PAGE);
    expect(nav).not.toBeNull();
    const links = [...nav![1]!.matchAll(/<a [^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(links.map(([href]) => href)).toEqual(ORDER.slice(1).map(([id]) => id));
    expect(links.map(([, label]) => label)).toEqual([
      'Problem',
      'Data',
      'Method',
      'Cleaning',
      'Cohorts',
      'Segments',
      'Model',
      'Win-back sizing',
      'Findings',
      'How I checked this',
      'Limits',
      'Sources',
    ]);
    for (const [id] of links) expect(PAGE).toContain(`id="${id}"`);
    // the summary comes before the section links, the problem after them
    expect(PAGE.indexOf('<nav aria-label="On this page"')).toBeGreaterThan(PAGE.indexOf('<section id="summary"'));
    expect(PAGE.indexOf('<nav aria-label="On this page"')).toBeLessThan(PAGE.indexOf('<section id="problem"'));
  });

  it('keeps every element id unique', () => {
    const ids = [...PAGE.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places each Figure in its own analysis section, after the prose that explains it', () => {
    const placed: [string, string][] = [
      ['returns-cleaning', 'returns'],
      ['cohort-retention', 'cohorts'],
      ['customer-segments', 'rfm'],
      ['repeat-order-model', 'models'],
      ['win-back-sizing', 'winback'],
      ['win-back-sizing', 'winback-duration'],
    ];
    for (const [sectionId, figureId] of placed) {
      const s = section(PAGE, sectionId);
      expect(s, figureId).toContain(`data-figure="${figureId}"`);
      expect(s.indexOf('<p')).toBeLessThan(s.indexOf(`data-figure="${figureId}"`));
    }
    expect([...PAGE.matchAll(/<figure [^>]*data-figure="/g)]).toHaveLength(placed.length);
  });

  it('badges each of the four public-data Figures Public data, never Simulated', () => {
    for (const id of ['returns', 'cohorts', 'rfm', 'models']) {
      const figure = new RegExp(`<figure [^>]*data-figure="${id}"[\\s\\S]*?</figure>`).exec(PAGE);
      expect(figure, id).not.toBeNull();
      expect(text(figure![0]), id).toContain('Public data');
      expect(text(figure![0]), id).not.toMatch(/Simulated|Live from this site/);
    }
  });

  it('keeps prose in the readable column and lets the evidence run wider', () => {
    for (const [id] of ORDER) {
      const s = section(PAGE, id);
      expect(s, id).toMatch(/class="[^"]*max-w-text/);
    }
    expect(PAGE).toContain('max-w-figure');
    // The page's own markup (Figures aside: their marks move only in answer to a control) has no
    // animation and no grid of identical cards.
    const own = PAGE.replace(/<figure [\s\S]*?<\/figure>/g, '');
    expect(own).not.toMatch(/animate-|transition|fade|slide-in/);
    expect(own).not.toMatch(/grid-cols-/);
  });

  it('makes the cleaning evidence lead: the two growth figures before the Figure', () => {
    const s = section(PAGE, 'returns-cleaning');
    const raw = s.indexOf('data-fact="retail.returns.yoy_growth_raw"');
    const clean = s.indexOf('data-fact="retail.returns.yoy_growth_clean"');
    expect(raw).toBeGreaterThan(-1);
    expect(clean).toBeGreaterThan(raw);
    expect(clean).toBeLessThan(s.indexOf('data-figure="returns"'));
  });
});

describe('periods, denominators and names', () => {
  it('names the cohorts, the cutoff, the rise the sizing depends on and the model', () => {
    const summary = text(section(PAGE, 'summary'));
    expect(summary).toContain('Across the January to November 2010 cohorts, weighted by size, about 20% order again in the month after their first order.');
    const findings = text(section(PAGE, 'findings'));
    expect(findings).toContain('Across the January to November 2010 cohorts, about 20% order again in the month after their first order, and about 18% in the twelfth month after it.');
    expect(findings).toContain('Champions are 23% of customers at the September 2011 cutoff and hold 71% of spend up to it, partly by construction.');
    expect(findings).toContain('Sized to detect a rise of 5 percentage points, a holdout test of all lapsed customers needs 1,353 per group and fits in one period');
    expect(text(section(PAGE, 'limits'))).toContain('The scores rank customers but are not calibrated probabilities: in the tenth of customers with the lowest scores, the gradient-boosting model predicted 3.1% on average and 8.7% ordered again.');
    expect(text(section(PAGE, 'limits'))).not.toContain('it predicted');
    expect(text(section(PAGE, 'method'))).toContain('I worked in five steps; most have their own period and their own group of customers:');
    expect(text(section(PAGE, 'cohort-retention'))).toContain(
      'about 20% order again in the month after their first order and about 18% in the twelfth month after it.',
    );
    expect(PAGE_TEXT).not.toMatch(/About 20% of a cohort|the model predicted|each with its own period|a year after it/);
  });
});

describe('the summary', () => {
  it('has question, my role, method, result, what I would recommend and next step', () => {
    const s = section(PAGE, 'summary');
    const labels = [...s.matchAll(/<dt[^>]*>([^<]*)<\/dt>/g)].map((m) => decode(m[1]!));
    expect(labels).toEqual(['Question', 'My role', 'Method', 'Result', 'What I would recommend', 'Next step']);
  });

  it('labels the decision as a recommendation, never as a decision someone took', () => {
    const s = text(section(PAGE, 'summary'));
    expect(s).toContain('What I would recommend');
    expect(s).not.toMatch(/\bDecision\b/);
  });
});

describe('truth', () => {
  it('passes the truth audit: every number under a fact or derived marker', () => {
    expect(auditHtml(`<!doctype html><html><head><title>t</title></head><body>${PAGE}</body></html>`, ctx)).toEqual([]);
  });

  it('names the work as a public dataset rebuilt in 2026', () => {
    expect(PAGE_TEXT).toContain('public dataset, rebuilt in 2026');
  });

  const ariaText = [...PAGE.matchAll(/aria-label="([^"]*)"/g)].map((m) => decode(m[1]!)).join(' ');

  it.each([
    ['we decided', /we decided/i],
    ['the business', /the business/i],
    ['rolled out', /rolled out/i],
    ['launched', /launched/i],
    ['customers responded', /customers responded/i],
    ['money saved', /\bsaved\b|revenue caused|caused revenue|money/i],
    ['ran a test', /\bran\b|\brun a test\b/i],
    ['designed', /\bdesign(ed)?\b/i],
    ['two orders', /two orders/i],
    ['top fifth', /top fifth/i],
    ['top-spending', /top[- ]spending/i],
    ['per arm', /per arm|\barm\b/i],
    ['Pulse or Weather', /Pulse|Weather|Audible/],
    ['the live test', /paused|A\/A|calibration run|calibration phase|live test|Live from this site/i],
    ['a raw Home model', /splitStatus|testNote|"phase"/],
  ])('never says %s, in the text or in an accessible name', (_, pattern) => {
    expect(PAGE_TEXT).not.toMatch(pattern);
    expect(ariaText).not.toMatch(pattern);
    expect(decode(PAGE)).not.toMatch(pattern);
  });

  it('has no table header that says anyone was contacted', () => {
    const headers = [...PAGE.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => decode(m[1]!));
    expect(headers.length).toBeGreaterThan(10);
    for (const h of headers) expect(h).not.toMatch(/contact/i);
  });

  it('renders nothing of the live experiment', () => {
    expect(PAGE).not.toMatch(/data-experiment|data-live|data-phase/);
  });
});

describe('the win-back section', () => {
  const s = section(PAGE, 'win-back-sizing');
  const t = text(s);

  it('says it was sized, that nobody was contacted and no test was run', () => {
    expect(t).toContain('I sized a possible holdout test; nobody was contacted and no test was run.');
  });

  it('prints the baseline, the uplift and the size per group through their facts, and derives the target', () => {
    for (const id of ['retention.winback.baseline_rate', 'retention.winback.uplift_pp', 'retention.winback.n_per_arm']) {
      expect(s, id).toContain(`data-fact="${id}"`);
    }
    expect(s).toContain('<data value="0.34" data-derived="retention.winback.baseline_rate retention.winback.uplift_pp">34%</data>');
    expect(t).toContain('detecting a rise from 29% to 34%, an uplift of 5 percentage points, needs 1,353 lapsed customers in each group');
  });

  it('treats the total against the lapsed customers as a count of who exists, never as power for the top-scored group', () => {
    const n = getFact('retention.winback.n_per_arm').value as number;
    expect(s).toContain(`<data value="${2 * n}" data-derived="retention.winback.n_per_arm">2,706</data>`);
    expect(s).toContain('data-fact="retention.winback.lapsed_customers"');
    expect(t).toContain('That is arithmetic about how many customers there are, not evidence that an offer would work.');
    const top = RETENTION.tables.holdout_sizes.find(
      (h) => h.group === 'top 20% of lapsed by score' && h.uplift_pp === getFact('retention.winback.uplift_pp').value,
    )!;
    expect(top.customers_per_arm).toBe(1547);
    expect(s).toContain(`<data value="${2 * top.customers_per_arm}" data-derived="source:retention">3,094</data>`);
    expect(s).toContain('data-fact="retention.winback.top20_customers"');
    expect(t).toContain('A test on only the top 20% of lapsed customers by score would not fit');
  });

  it('shows the targeting table as observed later orders against a random selection, with no money', () => {
    expect(s).toContain('Ordered again within the window');
    expect(s).toContain('Expected to order again, random selection');
    expect(t).toContain('These are later orders from customers nobody contacted.');
    expect(t).not.toMatch(/revenue|£|GBP|spend/i);
  });

  it('has controls only inside its planner Figures, and links to the Lab and to the Home planner', () => {
    const outside = s.replace(/<figure [\s\S]*?<\/figure>/g, '');
    expect(outside).not.toMatch(/<input|<button|role="group"|role="radiogroup"/);
    // the Lab link lands on the Lab's sample-size section, the planner
    expect(s).toMatch(/<a [^>]*href="\/lab#sample-size"[^>]*>Try other baselines and rises in the Lab(&#x27;|')s sample-size planner<\/a>/);
    const home = /<a [^>]*href="([^"]+)"[^>]*>The same arithmetic as the Home planner<\/a>/.exec(s);
    expect(home?.[1]).toBe('/#hero-planner');
    expect(home![0]).toContain('data-touch-target=""');
    // the links follow the planner, and the targeting evidence follows them
    expect(s.indexOf('data-figure="winback-duration"')).toBeLessThan(s.indexOf('href="/lab#sample-size"'));
    expect(s.indexOf('href="/lab#sample-size"')).toBeLessThan(s.indexOf('href="/#hero-planner"'));
    expect(s.indexOf('href="/#hero-planner"')).toBeLessThan(s.indexOf('lapsed-targeting'));
  });

  it('plans 29% plus 5 points, to 34%, at 1,353 customers per group, labelled a hypothetical uplift and Simulated', () => {
    const sizing = /<figure [^>]*data-figure="winback"[\s\S]*?<\/figure>/.exec(s)![0];
    const duration = /<figure [^>]*data-figure="winback-duration"[\s\S]*?<\/figure>/.exec(s)![0];
    const n = getFact('retention.winback.n_per_arm').value as number;
    expect(n).toBe(1353);
    expect(sizing).toMatch(new RegExp(`<data data-planner-n="" data-num="" value="${n}"[^>]*data-derived="simulated"[^>]*>1,353</data>`));
    expect(text(sizing)).toContain('customers per group');
    expect(text(sizing)).toContain('To detect a rise of 5 points, from 29% to 34%.');
    for (const f of [sizing, duration]) {
      expect(text(f)).toContain('Simulated');
      expect(text(f)).toContain('Hypothetical uplift');
      expect(f).not.toMatch(/Public data/);
    }
    // the caption says the uplift is hypothetical and not anyone's response, on the observed reactivation baseline
    const caption = text(/<figcaption[\s\S]*?<\/figcaption>/.exec(sizing)![0]);
    expect(caption).toContain('The preset is a hypothetical uplift on an observed baseline.');
    expect(caption).toContain('is the share of lapsed customers in the case study');
    expect(caption).toContain('is an uplift to plan for, not the effect of any offer. Nobody was contacted and no test was run.');
    expect(caption).not.toMatch(/returns|returned/i);
    // the sourced baseline and the target keep their fact refs in the caption
    expect(sizing).toContain('data-fact="retention.winback.baseline_rate"');
    expect(sizing).toContain('<data value="0.34" data-derived="retention.winback.baseline_rate retention.winback.uplift_pp">34%</data>');
  });

  it('keeps the public-data sizing table beside the planner, with its own badge, before the planner', () => {
    const table = s.indexOf('id="holdout-sizes-heading"');
    expect(table).toBeGreaterThan(-1);
    expect(table).toBeLessThan(s.indexOf('data-figure="winback"'));
    const block = s.slice(table, s.indexOf('data-figure="winback"'));
    expect(text(block)).toContain('Public data');
    expect(block).not.toMatch(/Simulated/);
    // the source row at the sized uplift is the fact; other rows are the export's own, not recomputed here
    const sized = RETENTION.tables.holdout_sizes.find(
      (h) => h.group === 'all lapsed customers' && h.uplift_pp === getFact('retention.winback.uplift_pp').value,
    );
    expect(sized?.customers_per_arm).toBe(getFact('retention.winback.n_per_arm').value);
  });

  it('places a planner when one is given, inside the section', () => {
    const withPlanner = renderToStaticMarkup(<RetentionPage planner={<div data-test-planner="">planner</div>} />);
    expect(section(withPlanner, 'win-back-sizing')).toContain('data-test-planner');
    expect(withPlanner.match(/data-test-planner/g)).toHaveLength(1);
  });
});

describe('how I checked this', () => {
  const s = section(PAGE, 'how-i-checked-this');
  const t = text(s);
  const { repo: name, commit } = lock.sources.retention!;

  it('quotes the reversal rule exactly as the cleaning SQL at the pinned commit writes it', () => {
    const pre = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(s);
    expect(pre).not.toBeNull();
    expect(decode(pre![1]!.replace(/<[^>]+>/g, ''))).toBe(
      [
        'CREATE OR REPLACE TABLE reversed_pairs AS',
        'SELECT DISTINCT s.invoice AS order_invoice, s.stock_code, r.invoice AS cancel_invoice',
        'FROM returns_all r',
        'JOIN sales_all s',
        '  ON s.customer_id = r.customer_id AND s.stock_code = r.stock_code AND s.quantity = r.quantity',
        ' AND s.invoice_ts <= r.invoice_ts AND s.invoice_ts >= r.invoice_ts - INTERVAL 1 DAY;',
      ].join('\n'),
    );
    expect(s).toContain(`href="https://github.com/${name}/blob/${commit}/sql/01_clean.sql#L34-L39"`);
  });

  it.each(['retention', 'retail'] as const)('the %s lock commit is the commit the SQL excerpt was read at', (id) => {
    expect(
      lock.sources[id]!.commit,
      're-read sql/01_clean.sql lines 34-39 at the new commit before changing this',
    ).toBe(REVERSAL_SQL_READ_AT[id]);
  });

  it('never links a moving branch anywhere on the page', () => {
    for (const m of PAGE.matchAll(/href="([^"]+)"/g)) expect(m[1]).not.toMatch(/\/(tree|blob)\/(main|master|HEAD)\b/);
  });

  it('names the export, schema and reproduction checks', () => {
    expect(t).toContain('pinned by commit and by a hash of its content');
    expect(t).toContain('against its schema');
    expect(t).toContain('the cohort table must reproduce the weighted month-one and month-twelve rates');
  });

  it('claims scipy and statsmodels tests for the sample-size code only', () => {
    const sentences = PAGE_TEXT.split(/(?<=\.) /).filter((x) => /scipy|statsmodels/.test(x));
    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toMatch(/sample-size code/);
    const n = sampleSizePerArm({
      baseline: getFact('retention.winback.baseline_rate').value as number,
      mde: (getFact('retention.winback.uplift_pp').value as number) / 100,
      mdeType: 'absolute',
      alpha: 0.05,
      power: 0.8,
    });
    expect(n).toBe(getFact('retention.winback.n_per_arm').value);
  });
});

describe('the limits', () => {
  const s = section(PAGE, 'limits');
  const t = text(s);

  it('has at least two concrete limits', () => {
    expect([...s.matchAll(/<li[\s>]/g)].length).toBeGreaterThanOrEqual(2);
  });

  it('says historic observational data from a gift retailer does not show response to marketing', () => {
    expect(t).toContain('This is historic, observational data from one UK gift retailer.');
    expect(t).toContain('not how anyone would respond to a win-back offer');
  });

  it('says the AUC interval covers test-sample variability, not retraining or a shift in the data', () => {
    expect(t).toContain('The interval on the AUC gain covers test-sample variability only.');
    expect(t).toContain('It does not cover retraining the model, another period or a change in the mix of customers.');
  });

  it('gives the calibration caveat from the actual lowest bin: a ranking, not a probability', () => {
    const lowest = RETENTION.tables.calibration[0]!;
    expect([lowest.bin, lowest.predicted, lowest.observed]).toEqual([0, 0.031, 0.087]);
    expect(s).toContain('<data value="0.031" data-derived="source:retention">3.1%</data>');
    expect(s).toContain('<data value="0.087" data-derived="source:retention">8.7%</data>');
    expect(t).toContain('not calibrated probabilities');
  });
});

describe('links', () => {
  it('makes every link on the page a 44 px target', () => {
    const anchors = [...PAGE.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
    expect(anchors.length).toBeGreaterThan(15);
    for (const a of anchors) expect(a, a).toContain('data-touch-target=""');
  });

  it('links each repository at its pinned commit', () => {
    const s = section(PAGE, 'sources');
    for (const id of ['retention', 'retail']) {
      const { repo: name, commit } = lock.sources[id]!;
      expect(s).toContain(`href="https://github.com/${name}/tree/${commit}"`);
    }
  });
});

describe('the route and the host', () => {
  const route = readFileSync(join(repo, 'src/app/work/retention/page.tsx'), 'utf8');
  const host = readFileSync(join(repo, 'src/app/kitchen-sink/retention/page.dev.tsx'), 'utf8');

  it('the route is a plain static page that renders the composition', async () => {
    expect(route).toMatch(/<RetentionCaseStudy \/>/);
    expect(route).not.toMatch(/revalidate|dynamic|searchParams|cookies\(|headers\(|faultAfterChange/);
    const mod = (await import('@/app/work/retention/page')) as {
      default: () => React.ReactNode;
      metadata: { title?: unknown; description?: unknown };
    };
    expect(mod.metadata.title).toBe('Customer retention and reactivation analysis');
    // the description is plain words: its only digits are the literal year of the rebuild
    expect(String(mod.metadata.description).replace('rebuilt in 2026', '')).not.toMatch(/\d/);
    expect(renderToStaticMarkup(<>{mod.default()}</>)).toBe(PAGE);
  });

  it('the dev host renders the same composition', () => {
    expect(host).toMatch(/<RetentionCaseStudy \/>/);
    expect(host).not.toMatch(/faultAfterChange/);
  });
});
