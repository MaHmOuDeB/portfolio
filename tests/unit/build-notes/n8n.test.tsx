// The n8n build note at /work/n8n: document and process automation (an e-invoice intake for
// XRechnung and ZUGFeRD, and error alerts), its tests and how it ships, and what it is not. The one
// figure is the test count, through its profile fact. The note is the last Work item and links the
// public repository at a fixed commit.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { N8N_SECTIONS, N8N_TITLE, N8nPage } from '@/components/n8n/N8nPage';
import { LIVE_ROUTES } from '@/lib/site';
import { N8N_REPO } from '../../../content/n8n.tsx';
import { WORK_GROUPS } from '../../../content/work.tsx';
import {
  BUILD_NOTE_LINKS,
  BUILD_NOTE_SECTIONS,
  audit,
  decode,
  outline,
  proseWords,
  section,
  sectionLinks,
  text,
} from './helpers';

const repo = join(import.meta.dirname, '../../..');
const ROUTE = '/work/n8n';
const PAGE = renderToStaticMarkup(<N8nPage />);
const PAGE_TEXT = text(PAGE);
const COMMIT = '626a254fdccb2ee558dca1f371fdcaa3a4523d8c';
const BASE = 'https://github.com/MaHmOuDeB/n8n-workflow-library';

describe('the outline', () => {
  it('has one h1, the Work title, and the Work line under it', () => {
    expect([...PAGE.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    expect(PAGE).toMatch(/<h1 id="n8n-title"[^>]*>n8n Workflow Library<\/h1>/);
    expect(N8N_TITLE).toBe('n8n Workflow Library');
    const work = WORK_GROUPS.flatMap((g) => g.items).find((i) => i.href === ROUTE)!;
    expect(work.title).toBe(N8N_TITLE);
    const intro = /<h1[\s\S]*?<\/h1>\s*<div[^>]*>([\s\S]*?)<\/div>/.exec(PAGE)![1]!;
    expect(text(intro)).toBe(text(renderToStaticMarkup(<>{work.description}</>)));
  });

  it('is the last Work item', () => {
    expect(WORK_GROUPS.flatMap((g) => g.items).at(-1)?.href).toBe(ROUTE);
  });

  it('follows the build-note template: summary, problem, architecture, checks, outcome, limits, links', () => {
    const sections = outline(PAGE);
    expect(sections.map(([id, , , title]) => [id, title])).toEqual(BUILD_NOTE_SECTIONS.map(([id, title]) => [id, title]));
    for (const [id, labelledBy, headingId] of sections) {
      expect(labelledBy).toBe(`${id}-title`);
      expect(headingId).toBe(`${id}-title`);
    }
    expect(N8N_SECTIONS.map((s) => s.id)).toEqual(BUILD_NOTE_SECTIONS.map(([id]) => id));
    expect([...PAGE.matchAll(/<h2[\s>]/g)]).toHaveLength(BUILD_NOTE_SECTIONS.length);
  });

  it('has section links to every section after the summary, in page order', () => {
    const links = sectionLinks(PAGE);
    expect(links.map(([href]) => href)).toEqual(BUILD_NOTE_SECTIONS.slice(1).map(([id]) => `#${id}`));
    expect(links.map(([, label]) => label)).toEqual(BUILD_NOTE_LINKS);
  });

  it('keeps every element id unique', () => {
    const ids = [...PAGE.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is about 400 words of prose', () => {
    const words = proseWords(PAGE);
    expect(words).toBeGreaterThanOrEqual(330);
    expect(words).toBeLessThanOrEqual(480);
  });

  it('has no motion and no card grid of its own', () => {
    expect(PAGE).not.toMatch(/animate-|transition|fade|slide-in/);
    expect(PAGE).not.toMatch(/grid-cols-[3-9]/);
  });
});

describe('the copy, word for word', () => {
  it('summary', () => {
    const s = section(PAGE, 'summary');
    expect([...s.matchAll(/<dt[^>]*>([^<]*)<\/dt>/g)].map((m) => decode(m[1]!))).toEqual(['My role', 'Where it stands']);
    expect(text(s)).toBe(
      [
        'Summary',
        'My role A personal project, built in 2026. I set the requirements and made the design decisions; Claude Code was my pair programmer.',
        'Where it stands A public, MIT-licensed repository of three automations for a self-hosted n8n; no real customer, no production use, no real invoices.',
      ].join(' '),
    );
  });

  it.each([
    [
      'problem',
      'The problem Since January 2025, German companies must be able to receive structured e-invoices. Someone has to read and check the XML and catch risky cases, such as changed bank details. A failing workflow is easy to miss. I wanted tested automations for both, installed with one command.',
    ],
    [
      'how-i-checked-this',
      'How I checked this 270+ automated tests cover the workflows, the installer, the invoice logic, end-to-end uploads, the mail intake and the alerts. The final run installed everything on a brand-new n8n, with smoke tests and a customer-style acceptance test. I tested failure on purpose too: XML with entity definitions, duplicates sent in parallel, and a server without the zlib permission, where every upload failed until I fixed it. Part of the suite runs in GitHub Actions on every push; the tests that need a running n8n, real web calls or a Gmail mailbox are run by hand.',
    ],
    [
      'outcome',
      'Outcome It ships with an installer that has checks, a dry run and safe re-runs; a Docker Compose stack with PostgreSQL, HTTPS through Caddy and a pinned n8n version; and backup, restore and health-check scripts. A restore after losing all data volumes was verified. There is no adoption to report.',
    ],
    [
      'limits',
      'Limits No production or client validation: the stack ran with Docker on my own computer, not a hosted server, and every invoice it has seen was a generated sample. Not a certified XRechnung validator: the checks are structural, arithmetic and master-data only, with no OCR for scanned PDFs, no accounting-software link and no Outlook or IMAP intake. It needs a self-hosted n8n that allows the zlib module and an SMTP account, and its mails are English only. The Gmail intake was proven on one test mailbox, and while the Google app is in testing mode its sign-in expires after about a week.',
    ],
    [
      'sources',
      'Sources and links The repository, at a fixed commit Its test results Its licence, MIT',
    ],
  ])('%s', (id, expected) => {
    expect(text(section(PAGE, id))).toBe(expected);
  });

  it('architecture: the formats, the checks, the routing and the alerts, then the diagram', () => {
    const s = section(PAGE, 'architecture');
    expect(text(s.replace(/<figure [\s\S]*?<\/figure>/, ''))).toBe(
      'Architecture Invoices arrive by upload or from a Gmail mailbox, as XRechnung (CII or UBL), ZUGFeRD or Factur-X. The intake checks totals, VAT, dates, tax IDs, the IBAN checksum and the currency, finds duplicates even across formats, flags changed bank details and archives the original byte for byte. Known-good invoices are approved automatically; the rest go to a person. The error alerts turn any failing workflow into one readable e-mail, with secrets and personal data removed where possible and repeats throttled.',
    );
    expect(s.indexOf('<p')).toBeLessThan(s.indexOf('data-figure="n8n-flow"'));
  });
});

describe('figures', () => {
  it('prints the test count through its profile fact, in the intro and the checks', () => {
    expect(PAGE.match(/data-fact="profile\.n8n\.automated_tests"/g)).toHaveLength(2);
    expect(section(PAGE, 'how-i-checked-this')).toContain('data-fact="profile.n8n.automated_tests"');
  });

  it('prints no other figure: the only digits are the fact, the years and the name n8n', () => {
    const unmarked = text(PAGE.replace(/<data [^>]*>[^<]*<\/data>/g, ' ')).replace(/\bn8n\b/g, '').replace(/\b20(25|26)\b/g, '');
    expect(unmarked).not.toMatch(/\d/);
  });

  it('passes the truth audit with the name n8n in its title and text', () => {
    expect(audit(PAGE, ROUTE)).toEqual([]);
  });
});

describe('the flow diagram', () => {
  const fig = /<figure [^>]*data-figure="n8n-flow"[\s\S]*?<\/figure>/.exec(PAGE)![0];

  it('is a diagram Figure with a finding title and no badge, table or controls', () => {
    expect(text(/<h3[\s\S]*?<\/h3>/.exec(fig)![0])).toBe('Every invoice is checked and archived, and anything unusual goes to a person');
    expect(fig).not.toMatch(/<table|data-provenance|<input|<button/);
    expect(text(/<figcaption[\s\S]*?<\/figcaption>/.exec(fig)![0])).toBe(
      'The e-invoice intake and the error alerts, step by step. Mail from the Gmail intake enters the same steps as an upload.',
    );
  });

  it('is its own text alternative: two ordered lists of steps in words, connectors hidden', () => {
    const lists = [...fig.matchAll(/<ol[^>]*aria-label="([^"]+)"[^>]*>([\s\S]*?)<\/ol>/g)].map((m) => [decode(m[1]!), text(m[2]!)]);
    expect(lists).toEqual([
      [
        'E-invoice intake',
        'Arrives Upload address or Gmail mailbox Read and check Totals, VAT, dates, tax IDs, IBAN, currency Compare Duplicates and changed bank details Archive The original, byte for byte Approved automatically Known-good invoices Sent to a person Everything else, to approve or decline',
      ],
      ['Error alerts', 'Any workflow fails In the same n8n One readable e-mail Secrets removed where possible, repeats throttled'],
    ]);
    expect(fig).not.toMatch(/<svg|<text/);
    for (const m of fig.matchAll(/<(?:span|div)[^>]*data-connector[^>]*>/g)) expect(m[0]).toContain('aria-hidden="true"');
  });
});

describe('truth', () => {
  it('frames it as document and process automation', () => {
    expect(PAGE_TEXT).toContain('Document and process automation in n8n: e-invoice intake (XRechnung, ZUGFeRD) and error alerts');
  });
});

describe('links', () => {
  it('links the repository, its test list and its licence at one fixed commit, never a branch', () => {
    expect(N8N_REPO).toEqual({ base: BASE, commit: COMMIT });
    const hrefs = [...section(PAGE, 'sources').matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual([`${BASE}/tree/${COMMIT}`, `${BASE}/blob/${COMMIT}/README.md#what-has-been-tested`, `${BASE}/blob/${COMMIT}/LICENSE`]);
    for (const m of PAGE.matchAll(/href="([^"]+)"/g)) expect(m[1]).not.toMatch(/\/(tree|blob)\/(main|master|HEAD)\b/);
  });

  it('makes every link a 44 px target and marks the repository links as another site', () => {
    const anchors = [...PAGE.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
    expect(anchors.length).toBe(BUILD_NOTE_LINKS.length + 3);
    for (const a of anchors) expect(a, a).toContain('data-touch-target=""');
    for (const a of anchors.filter((x) => x.includes('github.com'))) expect(a).toContain('rel="noopener"');
  });
});

describe('the route', () => {
  const route = readFileSync(join(repo, 'src/app/work/n8n/page.tsx'), 'utf8');

  it('is a plain static page that renders the composition, and it is live', async () => {
    expect(route).toMatch(/<N8nPage \/>/);
    expect(route).not.toMatch(/revalidate|dynamic|searchParams|cookies\(|headers\(/);
    const mod = (await import('@/app/work/n8n/page')) as {
      default: () => React.ReactNode;
      metadata: { title?: unknown; description?: unknown };
    };
    expect(mod.metadata.title).toBe('n8n Workflow Library');
    expect(mod.metadata.description).toBe(
      'Document and process automation in n8n: an e-invoice intake for XRechnung and ZUGFeRD, error alerts, and how it is tested. A portfolio project with no production use.',
    );
    expect(renderToStaticMarkup(<>{mod.default()}</>)).toBe(PAGE);
    expect(LIVE_ROUTES).toContain(ROUTE);
  });
});
