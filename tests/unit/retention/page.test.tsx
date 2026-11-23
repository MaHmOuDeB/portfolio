// The Retention case study page, the reference page later pages copy. It composes the sourced prose
// and the four public-data Figures in the reading model: the plain opening and the glance card, four
// findings (each a lead-in, its Figure, a takeaway and its method one click deeper), how I did it and
// checked it as details rows, the limits, the links, the close and previous and next. Every number on it is a <Fact> or a <Derived> (the build's truth audit), the
// win-back part is a sample-size calculation (with a planner of a hypothetical uplift beside it),
// and nothing on it comes from the live experiment.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { withoutCta } from '../page-cta';
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
const PAGE = withoutCta(renderToStaticMarkup(<RetentionCaseStudy />));
const PAGE_TEXT = text(PAGE);
const ctx = { route: '/work/retention', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };

const ORDER = [
  ['returns-cleaning', 'A double count made returns look like they grew'],
  ['cohort-retention', 'Who orders again, month by month'],
  ['repeat-order-model', 'A model of who orders again'],
  ['win-back-sizing', 'Sizing a win-back test'],
  ['how-i-checked-this', 'How I did it and checked it'],
  ['limits', 'Limits'],
  ['sources', 'Sources and links'],
] as const;
/** The four findings: each a lead-in, its Figure in a sheet, a takeaway and a details row. */
const FINDINGS = ['returns-cleaning', 'cohort-retention', 'repeat-order-model', 'win-back-sizing'] as const;
/** The markup of every native details row in some markup, keyed by its summary text. */
const detailsRows = (markup: string) =>
  Object.fromEntries(
    [...markup.matchAll(/<details data-method=""[^>]*>([\s\S]*?)<\/details>/g)].map((m) => [
      text(/<summary[^>]*>([\s\S]*?)<\/summary>/.exec(m[1]!)![1]!),
      m[1]!.slice(m[1]!.indexOf('</summary>')),
    ]),
  );
const between = (markup: string, from: string, to: string) => markup.slice(markup.indexOf(from), markup.indexOf(to, markup.indexOf(from)));
const GLANCE = between(PAGE, '<section aria-label="At a glance"', '</section>');
const exhibit = (id: string, part: 'lead-in' | 'takeaway') =>
  text(new RegExp(`<div data-${part}=""><p data-exhibit-label="">[^<]*</p><p data-exhibit-text="">([\\s\\S]*?)</p></div>`).exec(section(PAGE, id))![1]!);

describe('the outline', () => {
  it('has one h1 in two tones: who orders again, and how to test a win-back offer', () => {
    expect([...PAGE.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    const h1 = /<h1 id="retention-title"[^>]*>([\s\S]*?)<\/h1>/.exec(PAGE)![1]!;
    expect(text(h1)).toBe('Who orders again, and how to test a win-back offer.');
    expect(h1).toMatch(/^Who orders again, <span[^>]*>and how to test a win-back offer\.<\/span>$/);
  });

  it('opens in plain words, then the repository button', () => {
    const head = between(PAGE, '</h1>', '<section aria-label="At a glance"');
    expect(text(/<p data-plain-opening="">([\s\S]*?)<\/p>/.exec(head)![1]!)).toBe(
      "A shop wants to win back customers who stopped ordering. Before it spends on offers it needs to know two things: are its numbers right, and who would have come back anyway? I worked through both on two years of public order data from a UK gift retailer, rebuilt in 2026 from my Master's projects.",
    );
    const { repo: name, commit } = lock.sources.retention!;
    expect(head).toMatch(new RegExp(`<div data-case-actions=""[^>]*><a href="https://github.com/${name}/tree/${commit}"[\\s\\S]*See the code on GitHub</a></div>`));
  });

  it('has the glance card: three pull figures from the facts, one sentence, the facts and the scope, and no Summary block', () => {
    const points = /<ul role="list" data-glance-points=""[^>]*>([\s\S]*?)<\/ul>/.exec(GLANCE)![1]!;
    const ids = [...points.matchAll(/data-fact="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['retail.returns.yoy_growth_raw', 'retail.returns.yoy_growth_clean', 'retention.winback.n_per_arm']);
    expect(text(points)).toBe(
      '29% growth in returns, as a double count first showed it about 2% the real growth, with the double count removed 1,353 customers per group for a fair test of a win-back offer',
    );
    expect(text(/<p data-glance-outcome="">([\s\S]*?)<\/p>/.exec(GLANCE)![1]!)).toBe(
      'A model predicts who orders again only slightly better than putting the most recent buyers first, so the next step is a test with a holdout group, not a campaign to the top scorers.',
    );
    expect(text(GLANCE)).toContain(
      "Scope Public dataset, rebuilt in 2026 from my Master's projects. A prediction and a sample size: nobody was contacted and no test was run.",
    );
    expect(PAGE).not.toContain('id="summary"');
    expect(PAGE_TEXT).not.toMatch(/\bSummary\b|Next step|What I would recommend/);
  });

  it('puts the visible sections in the reading order, each named by its own h2, then the close', () => {
    const sections = [...PAGE.matchAll(/<section id="([^"]+)" aria-labelledby="([^"]+)"[^>]*>\s*<h2 id="([^"]+)"[^>]*>([^<]+)<\/h2>/g)].map(
      (m) => [m[1], m[2], m[3], decode(m[4]!)],
    );
    expect(sections.map(([id, , , title]) => [id, title])).toEqual(ORDER.map(([id, title]) => [id, title]));
    for (const [id, labelledBy, headingId] of sections) {
      expect(labelledBy).toBe(`${id}-title`);
      expect(headingId).toBe(`${id}-title`);
    }
    expect(RETENTION_SECTIONS.map((s) => s.id)).toEqual(ORDER.map(([id]) => id));
    const h2s = [...PAGE.matchAll(/<h2 [^>]*>([\s\S]*?)<\/h2>/g)].map((m) => text(m[1]!));
    expect(h2s).toEqual([...ORDER.map(([, title]) => title), 'What this shows about how I work']);
  });

  it('never skips a heading level', () => {
    const levels = [...PAGE.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!, `heading ${i}`).toBeLessThanOrEqual(1);
  });

  it('has in-page links whose targets are visible headings, in page order, after the glance card', () => {
    const nav = /<nav aria-label="On this page"[^>]*>([\s\S]*?)<\/nav>/.exec(PAGE);
    expect(nav).not.toBeNull();
    const links = [...nav![1]!.matchAll(/<a [^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(links.map(([href]) => href)).toEqual(ORDER.map(([id]) => id));
    expect(links.map(([, label]) => label)).toEqual(['Returns', 'Cohorts', 'Model', 'Win-back sizing', 'How I checked this', 'Limits', 'Sources']);
    for (const [id] of links) {
      const at = PAGE.indexOf(`id="${id}"`);
      expect(at).toBeGreaterThan(0);
      const before = PAGE.slice(0, at);
      expect(before.split('<details').length, id).toBe(before.split('</details>').length);
    }
    expect(PAGE.indexOf('<nav aria-label="On this page"')).toBeGreaterThan(PAGE.indexOf('aria-label="At a glance"'));
  });

  it('keeps every element id unique', () => {
    const ids = [...PAGE.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places each Figure in its own section, after the sentence that says what to look at', () => {
    const placed: [string, string][] = [
      ['returns-cleaning', 'returns'],
      ['cohort-retention', 'cohorts'],
      ['how-i-checked-this', 'rfm'],
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
    // The segments Figure sits in its details row, with the SQL.
    const rows = detailsRows(section(PAGE, 'how-i-checked-this'));
    expect(Object.keys(rows)).toEqual(['The data', 'Method', 'Customer segments', 'The reversal rule in SQL', 'How I checked this']);
    expect(rows['Customer segments']).toContain('data-figure="rfm"');
    expect(rows['The reversal rule in SQL']).toContain('<pre');
  });

  it('badges each of the four public-data Figures Public data, never Simulated', () => {
    for (const id of ['returns', 'cohorts', 'rfm', 'models']) {
      const figure = new RegExp(`<figure [^>]*data-figure="${id}"[\\s\\S]*?</figure>`).exec(PAGE);
      expect(figure, id).not.toBeNull();
      expect(text(figure![0]), id).toContain('Public data');
      expect(text(figure![0]), id).not.toMatch(/Simulated|Live from this site/);
    }
  });

  it('gives each finding a lead-in, its evidence in a sheet, a takeaway and its method one click deeper', () => {
    for (const id of FINDINGS) {
      const s = section(PAGE, id);
      const lead = s.indexOf('data-lead-in');
      const sheet = s.indexOf('data-figure-sheet');
      const take = s.indexOf('data-takeaway');
      const details = s.indexOf('<details data-method');
      expect(lead, id).toBeGreaterThan(0);
      expect(sheet, id).toBeGreaterThan(lead);
      expect(take, id).toBeGreaterThan(sheet);
      expect(details, id).toBeGreaterThan(take);
    }
    expect(exhibit('returns-cleaning', 'lead-in')).toBe(
      'Switch between counting cancelled orders as returns and removing them, and watch January 2011: the axis keeps room for the counted spike, so the empty space is what the double count added.',
    );
    expect(exhibit('returns-cleaning', 'takeaway')).toBe(
      'One £77k order, placed and cancelled within 24 hours, produced most of the apparent growth, so a dashboard would have reported a returns problem that did not exist.',
    );
    expect(exhibit('cohort-retention', 'lead-in')).toBe(
      'A cohort is customers grouped by the month of their first order; read each row across to see what share of them ordered again in each later month.',
    );
    expect(exhibit('cohort-retention', 'takeaway')).toBe(
      'About 20% of new customers order again the next month, and about 18% in the twelfth month after their first order.',
    );
    expect(exhibit('repeat-order-model', 'lead-in')).toBe(
      'Compare the model with the simple rule that puts the most recent buyers first, and see how close their two scores are.',
    );
    expect(exhibit('repeat-order-model', 'takeaway')).toBe(
      'The model finds people who were coming back anyway, so a campaign to its top scorers would look like a success and prove nothing.',
    );
    expect(exhibit('win-back-sizing', 'lead-in')).toBe(
      'A holdout is customers who get no offer, so their behaviour shows what would have happened anyway; the table shows how many customers each group of such a test needs.',
    );
    expect(exhibit('win-back-sizing', 'takeaway')).toBe(
      'The next step is a test with 1,353 lapsed customers per group against a holdout, not a campaign to the top scorers.',
    );
  });

  it('has no motion and no card grid of its own', () => {
    // The kit's buttons change colour on hover (transition-colors); nothing on the page moves.
    const own = PAGE.replace(/<figure [\s\S]*?<\/figure>/g, '').replace(/ transition-colors/g, '');
    expect(own).not.toMatch(/animate-|transition|fade|slide-in/);
    expect(own).not.toMatch(/grid-cols-/);
  });

  it('ends with the close, then previous Audible and next Pulse', () => {
    const close = between(PAGE, '<section data-page-close=""', '</section>');
    expect(close).toContain('id="what-this-shows"');
    expect(text(close)).toContain(
      'I check that the numbers are right before I analyse them, and I treat a prediction as a reason to test, not as proof that an offer works.',
    );
    const next = /<nav aria-label="More work" data-next-row=""[^>]*>([\s\S]*?)<\/nav>/.exec(PAGE)![1]!;
    const links = [...next.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(links).toEqual([
      ['/work/audible', 'Previous Audible'],
      ['/work/pulse', 'Next Pulse'],
    ]);
  });
});

describe('periods, denominators and names', () => {
  it('names the cohorts, the cutoff, the rise the sizing depends on and the model', () => {
    const rows = detailsRows(section(PAGE, 'how-i-checked-this'));
    expect(text(rows['Customer segments']!)).toContain(
      'They are 23% of customers and hold 71% of spend up to the cutoff.',
    );
    expect(text(section(PAGE, 'limits'))).toContain('The scores rank customers but are not calibrated probabilities: in the tenth of customers with the lowest scores, the gradient-boosting model predicted 3.1% on average and 8.7% ordered again.');
    expect(text(section(PAGE, 'limits'))).not.toContain('it predicted');
    expect(text(rows.Method!)).toContain('I worked in five steps; most have their own period and their own group of customers:');
    expect(text(section(PAGE, 'cohort-retention'))).toContain(
      'about 20% order again in the month after their first order and about 18% in the twelfth month after it.',
    );
    expect(text(section(PAGE, 'win-back-sizing'))).toContain(
      'detecting a rise from 29% to 34%, an uplift of 5 percentage points, needs 1,353 lapsed customers in each group',
    );
    expect(PAGE_TEXT).not.toMatch(/About 20% of a cohort|the model predicted|each with its own period|a year after it/);
  });
});

describe('repetition', () => {
  const count = (re: RegExp) => (PAGE_TEXT.match(re) ?? []).length;

  it('says nobody was contacted at most twice, and "partly by construction" at most twice', () => {
    expect(count(/nobody was contacted/gi)).toBeLessThanOrEqual(2);
    expect(count(/no test was run/gi)).toBeLessThanOrEqual(2);
    expect(count(/partly by construction/gi)).toBeLessThanOrEqual(2);
  });

  it('says the review caught the inflated growth once, under Limits', () => {
    expect(count(/The inflated growth was not my catch: a review caught it and I fixed it\./g)).toBe(1);
    expect(text(section(PAGE, 'limits'))).toContain('The inflated growth was not my catch: a review caught it and I fixed it.');
  });

  it('says the win-back was sized, never designed or run', () => {
    expect(PAGE_TEXT).toContain('I sized a possible holdout test.');
    expect(PAGE_TEXT).not.toMatch(/I (designed|ran) (a|the) (win-back|holdout)/i);
  });

  it('has no em or en dash in its own words', () => {
    expect(PAGE_TEXT).not.toMatch(/[–—]/);
  });
});

describe('truth', () => {
  it('passes the truth audit: every number under a fact or derived marker', () => {
    expect(auditHtml(`<!doctype html><html><head><title>t</title></head><body>${PAGE}</body></html>`, ctx)).toEqual([]);
  });

  it('names the work as a public dataset rebuilt in 2026', () => {
    expect(PAGE_TEXT).toMatch(/Public dataset, rebuilt in 2026/);
    expect(PAGE_TEXT).toContain('public order data from a UK gift retailer, rebuilt in 2026');
  });

  const ariaText = [...PAGE.matchAll(/aria-label="([^"]*)"/g)].map((m) => decode(m[1]!)).join(' ');

  it('says nothing of the live test and carries no raw Home-model field, in the text or an accessible name', () => {
    for (const pattern of [/paused|A\/A|calibration run|calibration phase|live test|Live from this site/i, /splitStatus|testNote|"phase"/]) {
      expect(PAGE_TEXT, String(pattern)).not.toMatch(pattern);
      expect(ariaText, String(pattern)).not.toMatch(pattern);
      expect(decode(PAGE), String(pattern)).not.toMatch(pattern);
    }
  });

  // Every heading, paragraph, list item and caption, in page order, exactly as a visitor reads it,
  // so any change to the wording is a deliberate change to this file.
  it('pins the prose of every section, as a visitor reads it', async () => {
    const blocks = [...PAGE.matchAll(/<(h2|h3|p|li|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => `${m[1]}: ${text(m[2]!)}`);
    expect(blocks.length).toBeGreaterThan(40);
    await expect(`${blocks.join('\n')}\n`).toMatchFileSnapshot('./__snapshots__/retention-prose.txt');
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

  it('says it was sized', () => {
    expect(t).toContain('I sized a possible holdout test.');
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

  it('has controls only inside its planner Figures, and links to the Lab (and no longer to a Home planner)', () => {
    const outside = s.replace(/<figure [\s\S]*?<\/figure>/g, '');
    expect(outside).not.toMatch(/<input|<button|role="group"|role="radiogroup"/);
    // the Lab link lands on the Lab's sample-size section, the planner
    expect(s).toMatch(/<a [^>]*href="\/lab#sample-size"[^>]*>Try other baselines and rises in the Lab(&#x27;|')s sample-size planner<\/a>/);
    expect(s).not.toContain('hero-planner');
    expect(s).not.toContain('Home planner');
    // the link follows the planner, and the targeting evidence follows it
    expect(s.indexOf('data-figure="winback-duration"')).toBeLessThan(s.indexOf('href="/lab#sample-size"'));
    expect(s.indexOf('href="/lab#sample-size"')).toBeLessThan(s.indexOf('lapsed-targeting'));
  });

  it('plans 29% plus 5 points, to 34%, at 1,353 customers per group, labelled a hypothetical uplift and Simulated', () => {
    const sizing = /<figure [^>]*data-figure="winback"[\s\S]*?<\/figure>/.exec(s)![0];
    const duration = /<figure [^>]*data-figure="winback-duration"[\s\S]*?<\/figure>/.exec(s)![0];
    const n = getFact('retention.winback.n_per_arm').value as number;
    expect(n).toBe(1353);
    expect(sizing).toMatch(new RegExp(`<data data-planner-n="" data-num="" value="${n}"[^>]*data-derived="simulated"[^>]*>1,353</data>`));
    expect(text(sizing)).toContain('customers per group');
    expect(text(sizing)).toContain('To detect a rise of 5 points, from 29% to 34%.');
    // the label after each result sentence stands on its own line
    expect(s).toMatch(/data-planner-wrap="" class="[^"]*\[&amp;_\[data-planner-result\]\+span\]:block/);
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
    for (const a of anchors) expect(a, a).toMatch(/data-touch-target="(true)?"/);
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
  const route = readFileSync(join(repo, 'src/app/(en)/work/retention/page.tsx'), 'utf8');
  const host = readFileSync(join(repo, 'src/app/(en)/kitchen-sink/retention/page.dev.tsx'), 'utf8');

  it('the route is a plain static page that renders the composition', async () => {
    expect(route).toMatch(/<RetentionCaseStudy \/>/);
    expect(route).not.toMatch(/revalidate|dynamic|searchParams|cookies\(|headers\(|faultAfterChange/);
    const mod = (await import('@/app/(en)/work/retention/page')) as {
      default: () => React.ReactNode;
      metadata: { title?: unknown; description?: unknown };
    };
    expect(mod.metadata.title).toBe('Retention analysis: who orders again, and how to test a win-back offer | Mahmoud El Bergui');
    // the description is plain words: its only digits are the literal year of the rebuild
    expect(String(mod.metadata.description).replace('rebuilt in 2026', '')).not.toMatch(/\d/);
    expect(withoutCta(renderToStaticMarkup(<>{mod.default()}</>))).toBe(PAGE);
  });

  it('the dev host renders the same composition', () => {
    expect(host).toMatch(/<RetentionCaseStudy \/>/);
    expect(host).not.toMatch(/faultAfterChange/);
  });
});
