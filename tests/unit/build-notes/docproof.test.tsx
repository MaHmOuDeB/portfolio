// The Docproof build note at /work/docproof. It follows the build-note template (the problem, the
// architecture with its diagram, how I checked this, the outcome, the limits and the sources) in the
// golden page's outline, with the section names every build note shares. The copy is pinned word for word, so any change to what the page says is a
// deliberate test change. The recorded verify run is evidence: it is printed exactly as captured, on
// the fictional document it was captured on, and a page without a captured run says "Not recorded".
import { renderToStaticMarkup } from 'react-dom/server';
import { withoutCta } from '../page-cta';
import { describe, expect, it } from 'vitest';
import { DOCPROOF_SECTIONS, DOCPROOF_TITLE, DocproofPage } from '@/components/docproof/DocproofPage';
import { DocproofRunEvidence, VERIFY_RUN } from '../../../content/docproof';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import { LIVE_ROUTES } from '@/lib/site';
import DocproofRoute, { metadata } from '@/app/(en)/work/docproof/page';
import { auditHtml } from '../../../scripts/truth-audit.ts';

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

const PAGE = withoutCta(renderToStaticMarkup(<DocproofPage />));
const ctx = { route: '/work/docproof', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };

// The recorded run is the best exhibit, so its section leads; the rest keep the shared order.
const ORDER = [
  ['how-i-checked-this', 'How I checked this', 'How I checked this'],
  ['problem', 'The problem', 'Problem'],
  ['architecture', 'Architecture', 'Architecture'],
  ['outcome', 'Outcome', 'Outcome'],
  ['limits', 'Limits', 'Limits'],
  ['sources', 'Sources and links', 'Sources'],
] as const;

describe('the outline', () => {
  it('has one two-tone h1, the plain opening under it and the button to the code', () => {
    expect(DOCPROOF_TITLE).toBe('Docproof: agents write, checks decide');
    expect([...PAGE.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    const h1 = /<h1 id="docproof-title"[^>]*>([\s\S]*?)<\/h1>/.exec(PAGE)![1]!;
    expect(text(h1)).toBe('Docproof: agents write, checks decide.');
    expect(h1).toContain('checks decide.');
    const head = PAGE.slice(PAGE.indexOf('</h1>'), PAGE.indexOf('<section aria-label="At a glance"'));
    const actions = head.slice(head.indexOf('data-case-actions'));
    expect(text(head.slice(0, head.indexOf('data-case-actions')).replace(/<div $/, ''))).toBe(
      'AI writing tools sometimes state things their source never said. Docproof is a tool I designed and built against that: AI agents draft and review a document, and ordinary code checks every figure against one approved list of facts, and blocks the claims that list rules out, before anything is released.',
    );
    expect(actions).toContain('href="https://github.com/MaHmOuDeB/docproof"');
    expect(text(actions.slice(actions.indexOf('>') + 1))).toBe('See the code on GitHub');
  });

  it('says "No users yet" once in Scope and once in Limits, and never says pair programmer', () => {
    expect(text(PAGE).match(/No users yet/g)).toHaveLength(2);
    expect(text(section(PAGE, 'limits'))).toContain('No users yet');
    expect(text(PAGE)).not.toMatch(/pair/i);
    expect(text(PAGE)).not.toContain('not who uses it');
    expect(text(PAGE)).not.toMatch(/job|CV|résumé|resume/);
  });

  it('puts the sections in the build-note order, each named by its own h2', () => {
    const sections = [...PAGE.matchAll(/<section id="([^"]+)" aria-labelledby="([^"]+)"[^>]*>\s*<h2 id="([^"]+)"[^>]*>([^<]+)<\/h2>/g)].map(
      (m) => [m[1], m[2], m[3], decode(m[4]!)],
    );
    expect(sections.map(([id, , , title]) => [id, title])).toEqual(ORDER.map(([id, title]) => [id, title]));
    for (const [id, labelledBy, headingId] of sections) {
      expect(labelledBy).toBe(`${id}-title`);
      expect(headingId).toBe(`${id}-title`);
    }
    expect(DOCPROOF_SECTIONS.map((s) => [s.id, s.title, s.link])).toEqual(ORDER.map((row) => [...row]));
    // the sections, then the close
    expect([...PAGE.matchAll(/<h2[\s>]/g)]).toHaveLength(ORDER.length + 1);
  });

  it('has section links whose targets exist, in page order, under a named navigation', () => {
    const nav = /<nav aria-label="On this page"[^>]*>([\s\S]*?)<\/nav>/.exec(PAGE);
    expect(nav).not.toBeNull();
    const links = [...nav![1]!.matchAll(/<a [^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(links).toEqual(ORDER.map(([id, , link]) => [id, link]));
    expect(PAGE.indexOf('<nav aria-label="On this page"')).toBeLessThan(PAGE.indexOf('<section id="how-i-checked-this"'));
  });

  it('keeps every element id unique, prose in the readable column, and no motion or card grid', () => {
    const ids = [...PAGE.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [id] of ORDER) expect(section(PAGE, id), id).toMatch(/class="[^"]*max-w-text/);
    // No motion: the only transition is the buttons' colour change on hover.
    expect(PAGE.replace(/transition-colors/g, '')).not.toMatch(/animate-|transition|fade|slide-in/);
  });

  it('links only to the code, its own sections, the Work page and its neighbours', () => {
    const hrefs = [...PAGE.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
    const REPO = 'https://github.com/MaHmOuDeB/docproof';
    expect(hrefs).toEqual([REPO, ...ORDER.map(([id]) => `#${id}`), REPO, '/work', REPO, '/work/weather', '/work/n8n']);
    // every link is a 44 px target
    for (const a of PAGE.match(/<a [^>]*>/g)!) expect(a).toContain('data-touch-target');
  });
});

describe('the architecture diagram', () => {
  const s = section(PAGE, 'architecture');

  it('is the one Figure on the page: a diagram with no badge, table or controls', () => {
    expect([...PAGE.matchAll(/<figure [^>]*data-figure="/g)]).toHaveLength(1);
    expect(s).toContain('data-figure="docproof-architecture"');
    expect(s.indexOf('<p')).toBeLessThan(s.indexOf('data-figure="docproof-architecture"'));
    expect(PAGE).not.toContain('data-provenance');
    expect(PAGE).not.toContain('<table');
    expect(PAGE).not.toContain('data-figure-controls');
  });

  it('draws the stages as one column of steps joined by hidden connectors, as Weather does', () => {
    const fig = s.slice(s.indexOf('<figure'), s.indexOf('</figure>'));
    const list = /<ol ([^>]*)>/.exec(fig)![1]!;
    expect(list).toContain('max-w-text');
    expect(list).not.toMatch(/grid-cols/);
    const items = [...fig.matchAll(/<li data-stage="[^"]+"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]!);
    expect(items[0]).not.toContain('data-connector');
    for (const item of items.slice(1)) expect(item).toMatch(/^<span aria-hidden="true" data-connector=""/);
  });

  it('shows the four stages in order: input, orchestration, checks, report', () => {
    const fig = s.slice(s.indexOf('<figure'), s.indexOf('</figure>'));
    expect(text(fig.slice(0, fig.indexOf('</h3>')))).toBe('Agents propose changes; deterministic checks decide what reaches the reader');
    const stages = [...fig.matchAll(/<li data-stage="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(stages).toEqual([
      ['input', 'Input One fact base in Markdown, with its known gaps, and the document as a Word file.'],
      [
        'orchestration',
        'Orchestration An author agent drafts and edits, a claim auditor checks each claim, a context-free reviewer reads it cold, and the orchestrator applies only the true fixes.',
      ],
      [
        'checks',
        'Checks Every edit touches only its target, every figure is in the fact base, no known gap is claimed and every word reaches the PDF.',
      ],
      ['report', 'Report Pass or fail, naming each failing line, with the PDF and page images to look at.'],
    ]);
    expect(text(fig.slice(fig.indexOf('<figcaption')))).toBe(
      'A failed check sends the document back to the orchestrator, never on to the reader.',
    );
  });
});

describe('the copy', () => {
  it('states the problem', () => {
    expect(text(section(PAGE, 'problem')).replace(/^The problem /, '')).toBe(
      'Language models are good at rewriting text and poor at staying true to a source. When a model drafts or edits a document, it can drift into claims the source never made, and doing that work by hand is slow. Docproof splits the work in two: deterministic tools do the parts that must be exact and can show what they changed, and agents with separate roles make the judgement calls. Nothing an agent writes reaches the reader without passing the tools’ checks.',
    );
  });

  it('describes the architecture', () => {
    const s = section(PAGE, 'architecture');
    expect(text(s.slice(0, s.indexOf('<figure'))).replace(/^Architecture /, '')).toBe(
      'One Markdown file, the fact base, is the only source of truth. It also lists known gaps: things a document must never claim. A Python command-line tool builds Word files from structured data, writes surgical edits to a new file that leaves everything else byte for byte the same, and typesets designed PDFs with headless Chrome. Claude Code agents work through that tool. An author drafts and edits; a claim auditor checks every claim against the fact base and never edits; a context-free reviewer reads the result without the fact base, as a stranger would. The orchestrator, a person or a Claude Code command, weighs their findings, applies only the true fixes through the tool and runs the checks again.',
    );
  });

  it('leads with the recorded run: what to look at, the run in its sheet, what it means', () => {
    const s = section(PAGE, 'how-i-checked-this');
    expect(text(s.slice(0, s.indexOf('<div data-figure-sheet')))).toBe(
      'How I checked this What to look at A made-up garden notice with two planted errors: it says 4 evenings where the facts say 3, and it mentions a greenhouse the facts rule out.',
    );
    expect(s.indexOf('data-figure-sheet')).toBeLessThan(s.indexOf('<h3 id="verify-run-title"'));
    const after = s.slice(s.indexOf('<div data-takeaway'));
    expect(text(after.slice(0, after.indexOf('<details')))).toBe(
      'What it means The check failed the notice and named both lines. No model was asked whether the text was true; code compared it with the facts.',
    );
  });

  it('keeps how the tools are tested one click deeper, word for word', () => {
    const s = section(PAGE, 'how-i-checked-this');
    const details = s.slice(s.indexOf('<details'), s.indexOf('</details>'));
    expect(text(details)).toBe(
      'How the tools themselves are tested The tools are ordinary code, so they are tested like code: unit tests, and a GitHub Actions run on every push that renders a real PDF in headless Chrome and runs the demo. Each editing command compares the document before and after and fails if anything other than its target changed. The rendered pages are still looked at, by the author agent or whoever runs the tools; no check replaces that.',
    );
  });

  it('closes on what it shows about how I work', () => {
    const close = PAGE.slice(PAGE.indexOf('<section data-page-close'));
    expect(text(close.slice(0, close.indexOf('</section>')))).toBe(
      'What this shows about how I work I build AI tools in which code, not the model, has the last word on facts. See the code on GitHub',
    );
  });

  it('states the outcome without users or adoption', () => {
    expect(text(section(PAGE, 'outcome')).replace(/^Outcome /, '')).toBe(
      'A public command-line tool and its Claude Code agent definitions, under the MIT licence, with unit tests and continuous integration.',
    );
  });

  it('gives five concrete limits', () => {
    const items = [...section(PAGE, 'limits').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]!));
    expect(items).toEqual([
      'The checks are mechanical. The verify check passes a number if it appears anywhere in the fact base, so a true number attached to the wrong claim passes too, and it skips dates and years. Judging wording and scope is left to the auditor agent and to the orchestrator.',
      'A passing run shows only that the document agrees with the fact base, not that the fact base is true.',
      'No users yet; this page shows what it does and how it is checked.',
      'The tools read and write Word files in their own structure; a document made elsewhere works if it follows that structure, and the editing commands expect it.',
      'It was tested with Claude models. Other assistants are supported by design, through a plain-text prompt and a JSON reply, but not tested.',
    ]);
  });

  it('links to the repository and to the Work page', () => {
    expect(text(section(PAGE, 'sources')).replace(/^Sources and links /, '')).toBe('The Docproof repository All my work');
  });
});

describe('the recorded verify run', () => {
  const run = VERIFY_RUN!;

  it('was captured on a fictional document with the README verify subcommand', () => {
    expect(run).not.toBeNull();
    expect(run.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(run.commit).toMatch(/^[0-9a-f]{7}$/);
    // the README's verify subcommand and arguments (`verify <doc.docx> --facts <fact-base.md>`), run
    // through the package's module entry point
    expect(run.command).toBe('python3 -m docproof verify notice.docx --facts fact-base.md');
    expect(run.factBase).toBe(
      [
        '# Riverside Community Garden (fictional)',
        '',
        '## Facts',
        '- The garden has 24 raised beds.',
        '- Members water the beds on 3 evenings a week.',
        '- Compost is turned once a month.',
        '',
        '## Known gaps',
        '- Greenhouse',
      ].join('\n'),
    );
    expect(run.document).toEqual([
      'Riverside Community Garden: season notice',
      'The garden has 24 raised beds, shared by its members.',
      'Members water the beds on 4 evenings a week.',
      'Seedlings are raised in the greenhouse before planting.',
      'Compost is turned once a month.',
    ]);
    // nothing that could reach a person: no address, link, phone number or path
    const inputs = [run.factBase, ...run.document, run.command, run.output].join('\n');
    expect(inputs).not.toMatch(/@|https?:|www\.|\+?\d[\d\s()/-]{7,}\d|\/Users\/|~\//);
  });

  it('prints the output exactly as captured, consistent with its inputs', () => {
    expect(run.output).toBe(
      [
        'numbers   : 2 checked, 1 not in the fact base',
        "  FAIL      '4'  …Members water the beds on 4 evenings a week.…",
        'known gaps: 1 claimed',
        "  FAIL 'Greenhouse' in: Seedlings are raised in the greenhouse before planting.",
        "skills    : 0 item(s) with words the fact base doesn't mention",
        'VERIFY FAILED',
      ].join('\n'),
    );
    // every failing line quotes a paragraph of the document; the failing number is not in the fact
    // base, and the known gap is listed in it
    for (const m of run.output.matchAll(/…(.+)…|in: (.+)$/gm)) expect(run.document).toContain(m[1] ?? m[2]);
    expect(run.factBase).not.toMatch(/(?<![\d.])4(?!\d)/);
    expect(run.factBase.split('## Known gaps')[1]).toContain('Greenhouse');
  });

  it('shows the inputs, the command, the output and when and with which version it ran', () => {
    const s = section(PAGE, 'how-i-checked-this');
    const evidence = s.slice(s.indexOf('<h3'));
    expect(text(evidence.slice(0, evidence.indexOf('</h3>')))).toBe('A recorded run of the verify check');
    // Each block has a visible label above it, and that label is the block's accessible name.
    const blocks = [...evidence.matchAll(/<p id="([^"]+)"[^>]*>([^<]+)<\/p><pre [^>]*aria-labelledby="([^"]+)"[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/g)].map((m) => {
      expect(m[3]).toBe(m[1]);
      return [decode(m[2]!), decode(m[4]!)];
    });
    expect(evidence).not.toMatch(/<pre [^>]*aria-label=/);
    expect(blocks).toEqual([
      ['The fact base', run.factBase],
      ['The notice, one paragraph per line', run.document.join('\n')],
      ['The command and its output', `$ ${run.command}\n${run.output}`],
    ]);
    expect(text(evidence)).toContain(
      'Recorded on 12.11.2026 with docproof at commit b817cb1, run from its source. The notice is a Word file with the paragraphs above.',
    );
    expect(evidence).toContain('<time dateTime="2026-11-12"');
  });

  it('says "Not recorded" when there is no captured run, and prints no result', () => {
    const none = renderToStaticMarkup(<DocproofRunEvidence run={null} />);
    expect(text(none)).toBe('A recorded run of the verify check Not recorded.');
    expect(none).not.toContain('<pre');
    expect(none).not.toMatch(/PASSED|FAILED/);
  });
});

describe('truth', () => {
  it('passes the truth audit: every numeral is marked, and only the recorded run (and its lead-in) carries numbers', () => {
    expect(auditHtml(PAGE, ctx)).toEqual([]);
    expect(PAGE).not.toContain('data-fact');
    const derived = [...PAGE.matchAll(/data-derived="([^"]+)"/g)].map((m) => m[1]);
    expect(derived.length).toBeGreaterThan(0);
    expect(new Set(derived)).toEqual(new Set(['build']));
    // outside the recorded run and its lead-in the page has no numeral but the year, in the glance block
    const rest = PAGE.replace(section(PAGE, 'how-i-checked-this'), '');
    // (the next note's name, n8n, holds a digit but is no number)
    expect(text(rest).replace(/\bn8n\b/g, '').match(/\d+/g)).toEqual(['2026', '2026']);
  });
});

describe('the route', () => {
  it('renders the page with its own title and description', () => {
    expect(withoutCta(renderToStaticMarkup(<DocproofRoute />))).toBe(PAGE);
    expect(metadata.title).toBe(`${DOCPROOF_TITLE} | Mahmoud El Bergui`);
    expect(metadata.description).toBe(
      'An open-source pipeline in which one agent writes, one audits every claim and one reviews cold, and automated checks decide what reaches the reader.',
    );
  });

  it('ships at /work/docproof', () => {
    expect(LIVE_ROUTES).toContain('/work/docproof');
  });
});
