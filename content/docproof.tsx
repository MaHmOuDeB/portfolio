// The Docproof build note's prose: the line under the title, the problem, the architecture and its
// diagram stages, how I checked this, the outcome, the limits and the links, plus one recorded run
// of its verify check. Each export is a server section without its own heading, so the page decides
// the outline and the anchors (src/components/docproof/DocproofPage.tsx). The description follows
// the tool's source (README, docs/architecture.md and src/docproof/verify.py at the commit below).
//
// The recorded run was captured on a fictional document written for this page and is printed
// exactly as captured; its numbers carry data-derived "build", because they are part of the
// site's source, not of a vendored export. Without a captured run the evidence says "Not recorded".
import type { ReactNode } from 'react';
import type { GlanceParts } from '@/components/depth/GlanceBlock';
import type { Items } from '@/components/build-notes/slots';
import { derivedAttr } from '@/components/kit/Derived';
import { TextLink } from '@/components/kit/TextLink';
import type { Locale } from '@/lib/i18n/locale';

// The words are a `DocproofCopy`: DOCPROOF_EN here, the German twin in content/de/docproof.tsx typed by
// the same type, so a missing key fails the typecheck. The recorded run itself (VERIFY_RUN: the fact
// base, the notice, the command and its output) is data as captured and stays English in both
// languages; only the words around it are copy. Server only: no client file imports it.
export type DocproofCopy = {
  /** The h1, in two tones: the name and what it does, then the quiet clause. */
  h1: string;
  quiet: string;
  /** The plain opening under the title (one paragraph). */
  intro: ReactNode;
  glance: GlanceParts;
  problem: Items;
  architecture: Items;
  diagram: {
    title: string;
    caption: string;
    /** The stages, in the order a document passes them. */
    stages: readonly { id: string; name: string; body: string }[];
  };
  /** How the tools themselves are checked (one paragraph, inside the row below). */
  verification: ReactNode;
  verificationSummary: string;
  run: {
    title: string;
    /** The label of the figure sheet that holds the recorded run. */
    sheetLabel: string;
    /** What to look at in the recorded run; its two numbers are the run's own, passed in as elements. */
    leadIn: (n: { planted: ReactNode; fact: ReactNode }) => ReactNode;
    takeaway: string;
    notRecorded: string;
    labels: { factBase: string; notice: string; output: string };
    /** The line under the run: its date and the commit, passed in as elements. */
    recorded: (p: { date: ReactNode; commit: ReactNode }) => ReactNode;
  };
  outcome: ReactNode;
  limits: Items;
  links: { repo: string; work: string };
  close: string;
};

const BUILD = derivedAttr(['build']);

/** The public repository (the README's verify subcommand is the one recorded below). */
export const DOCPROOF_REPO = 'https://github.com/MaHmOuDeB/docproof';

export const DOCPROOF_EN: DocproofCopy = {
  h1: 'Docproof: agents write,',
  quiet: 'checks decide.',
  intro: (
    <p>
      AI writing tools sometimes state things their source never said. Docproof is a tool I designed and built against
      that: AI agents draft and review a document, and ordinary code checks every figure against one approved list of
      facts, and blocks the claims that list rules out, before anything is released.
    </p>
  ),
  /** The 20-second top of the page, under the head: one sentence and the facts (Docproof has no Facts). */
  glance: {
    outcome: 'Agents propose the changes; deterministic checks decide what reaches the reader.',
    role: 'Designed and built.',
    methods:
      'Single fact base, claim verification, multi-agent orchestration (author, auditor, context-free reviewer), rendering checks.',
    tools: 'Python, Claude Code agents and skills, headless Chrome, GitHub Actions.',
    when: '2026.',
    scope: 'Open source (MIT), built in 2026. No users yet.',
  },
  /** What the tool removes: a model's drift away from its source, and slow checking by hand. */
  problem: [
    [
      'drift',
      <>
        Language models are good at rewriting text and poor at staying true to a source. When a model drafts or edits a
        document, it can drift into claims the source never made, and doing that work by hand is slow.
      </>,
    ],
    [
      'split',
      <>
        Docproof splits the work in two: deterministic tools do the parts that must be exact and can show what they
        changed, and agents with separate roles make the judgement calls. Nothing an agent writes reaches the reader
        without passing the tools’ checks.
      </>,
    ],
  ],
  /** The parts and the roles, before the diagram. */
  architecture: [
    [
      'tool',
      <>
        One Markdown file, the fact base, is the only source of truth. It also lists known gaps: things a document must
        never claim. A Python command-line tool builds Word files from structured data, writes surgical edits to a new
        file that leaves everything else byte for byte the same, and typesets designed PDFs with headless Chrome.
      </>,
    ],
    [
      'agents',
      <>
        Claude Code agents work through that tool. An author drafts and edits; a claim auditor checks every claim
        against the fact base and never edits; a context-free reviewer reads the result without the fact base, as a
        stranger would. The orchestrator, a person or a Claude Code command, weighs their findings, applies only the
        true fixes through the tool and runs the checks again.
      </>,
    ],
  ],
  diagram: {
    title: 'Agents propose changes; deterministic checks decide what reaches the reader',
    caption: 'A failed check sends the document back to the orchestrator, never on to the reader.',
    stages: [
      { id: 'input', name: 'Input', body: 'One fact base in Markdown, with its known gaps, and the document as a Word file.' },
      {
        id: 'orchestration',
        name: 'Orchestration',
        body: 'An author agent drafts and edits, a claim auditor checks each claim, a context-free reviewer reads it cold, and the orchestrator applies only the true fixes.',
      },
      {
        id: 'checks',
        name: 'Checks',
        body: 'Every edit touches only its target, every figure is in the fact base, no known gap is claimed and every word reaches the PDF.',
      },
      {
        id: 'report',
        name: 'Report',
        body: 'Pass or fail, naming each failing line, with the PDF and page images to look at.',
      },
    ],
  },
  /** How the tools themselves are checked, and the human step no check replaces. */
  verification: (
    <p>
      The tools are ordinary code, so they are tested like code: unit tests, and a GitHub Actions run on every push
      that renders a real PDF in headless Chrome and runs the demo. Each editing command compares the document before
      and after and fails if anything other than its target changed. The rendered pages are still looked at, by the
      author agent or whoever runs the tools; no check replaces that.
    </p>
  ),
  verificationSummary: 'How the tools themselves are tested',
  run: {
    title: 'A recorded run of the verify check',
    sheetLabel: 'Recorded run',
    leadIn: (n) => (
      <>
        A made-up garden notice with two planted errors: it says {n.planted} evenings where the facts say{' '}
        {n.fact}, and it mentions a greenhouse the facts rule out.
      </>
    ),
    takeaway:
      'The check failed the notice and named both lines. No model was asked whether the text was true; code compared it with the facts.',
    notRecorded: 'Not recorded.',
    labels: {
      factBase: 'The fact base',
      notice: 'The notice, one paragraph per line',
      output: 'The command and its output',
    },
    recorded: (p) => (
      <>
        Recorded on{' '}
        {p.date}{' '}
        with docproof at commit {p.commit}, run from its source. The notice is a Word file
        with the paragraphs above.
      </>
    ),
  },
  /** What exists, without users or adoption. */
  outcome: (
    <p>
      A public command-line tool and its Claude Code agent definitions, under the MIT licence, with unit tests and
      continuous integration.
    </p>
  ),
  /** What the checks cannot show. */
  limits: [
    [
      'mechanical',
      <>
        The checks are mechanical. The verify check passes a number if it appears anywhere in the fact base, so a true
        number attached to the wrong claim passes too, and it skips dates and years. Judging wording and scope is left
        to the auditor agent and to the orchestrator.
      </>,
    ],
    ['source', <>A passing run shows only that the document agrees with the fact base, not that the fact base is true.</>],
    ['users', <>No users yet; this page shows what it does and how it is checked.</>],
    [
      'format',
      <>
        The tools read and write Word files in their own structure; a document made elsewhere works if it follows that
        structure, and the editing commands expect it.
      </>,
    ],
    [
      'models',
      <>
        It was tested with Claude models. Other assistants are supported by design, through a plain-text prompt and a
        JSON reply, but not tested.
      </>,
    ],
  ],
  links: { repo: 'The Docproof repository', work: 'All my work' },
  close: 'I build AI tools in which code, not the model, has the last word on facts.',
};

/** One captured run of `docproof verify`: its inputs, the exact command and the exact output. */
export type RecordedRun = {
  /** The local date of the run, yyyy-mm-dd. */
  recordedOn: string;
  /** The docproof commit the run used. */
  commit: string;
  command: string;
  /** The fact base file, as written. */
  factBase: string;
  /** The document's paragraphs, in order: the Word file holds one paragraph per entry. */
  document: readonly string[];
  /** Standard output and error, exactly as captured. */
  output: string;
};

/**
 * Captured on 12.11.2026 from the docproof source at commit b817cb1 (its module entry point, which
 * runs the same `main` as the installed `docproof` command), in a folder holding only these two
 * inputs. The Word file was written from the paragraphs below, one paragraph each.
 */
export const VERIFY_RUN: RecordedRun | null = {
  recordedOn: '2026-11-12',
  commit: 'b817cb1',
  command: 'python3 -m docproof verify notice.docx --facts fact-base.md',
  factBase: [
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
  document: [
    'Riverside Community Garden: season notice',
    'The garden has 24 raised beds, shared by its members.',
    'Members water the beds on 4 evenings a week.',
    'Seedlings are raised in the greenhouse before planting.',
    'Compost is turned once a month.',
  ],
  output: [
    'numbers   : 2 checked, 1 not in the fact base',
    "  FAIL      '4'  …Members water the beds on 4 evenings a week.…",
    'known gaps: 1 claimed',
    "  FAIL 'Greenhouse' in: Seedlings are raised in the greenhouse before planting.",
    "skills    : 0 item(s) with words the fact base doesn't mention",
    'VERIFY FAILED',
  ].join('\n'),
};

/** The run's two numbers: the planted wrong one and the one the fact base holds. */
export const RUN_NUMBERS = { planted: '4', fact: '3' } as const;

/** "12.11.2026" for "2026-11-12". */
function versionDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** A recorded block under its visible label, which is also its accessible name. The block is as captured: English. */
function Block({ id, label, children, lang }: { id: string; label: string; children: string; lang?: 'en' }) {
  const labelId = `verify-run-${id}`;
  return (
    <>
      <p id={labelId} className="mt-6 max-w-text text-sm font-semibold">
        {label}
      </p>
      <pre
        tabIndex={0}
        role="region"
        aria-labelledby={labelId}
        lang={lang}
        className="mt-2 max-w-figure overflow-x-auto rounded-md border border-hairline-strong bg-surface p-3 text-xs max-sm:whitespace-pre-wrap max-sm:break-words"
      >
        <code {...BUILD}>{children}</code>
      </pre>
    </>
  );
}

/** What to look at in the recorded run, with the run's own two numbers. */
export function RunLeadIn({ copy = DOCPROOF_EN.run }: { copy?: DocproofCopy['run'] }): ReactNode {
  return copy.leadIn({
    planted: <span {...BUILD}>{RUN_NUMBERS.planted}</span>,
    fact: <span {...BUILD}>{RUN_NUMBERS.fact}</span>,
  });
}

/** The recorded run with its inputs, or "Not recorded" when no run was captured. */
export function DocproofRunEvidence({
  run,
  copy = DOCPROOF_EN.run,
  locale = 'en',
}: {
  run: RecordedRun | null;
  copy?: DocproofCopy['run'];
  locale?: Locale;
}): ReactNode {
  // The captured blocks are English whatever the page's language: say so to assistive technology.
  const lang = locale === 'en' ? undefined : 'en';
  return (
    <div className="max-w-figure">
      <h3 id="verify-run-title" className="max-w-text text-xl font-semibold">
        {copy.title}
      </h3>
      {run === null ? (
        <p className="mt-3 max-w-text">{copy.notRecorded}</p>
      ) : (
        <>
          <Block id="fact-base" label={copy.labels.factBase} lang={lang}>{run.factBase}</Block>
          <Block id="notice" label={copy.labels.notice} lang={lang}>{run.document.join('\n')}</Block>
          <Block id="output" label={copy.labels.output} lang={lang}>{`$ ${run.command}\n${run.output}`}</Block>
          <p className="mt-4 max-w-text text-sm text-muted">
            {copy.recorded({
              date: (
                <time dateTime={run.recordedOn} {...BUILD}>
                  {versionDate(run.recordedOn)}
                </time>
              ),
              commit: <span {...BUILD}>{run.commit}</span>,
            })}
          </p>
        </>
      )}
    </div>
  );
}

/** The repository, then back to the Work directory. */
export function DocproofLinks({ copy, workHref = '/work' }: { copy: DocproofCopy['links']; workHref?: string }): ReactNode {
  return (
    <ul>
      <li>
        <TextLink href={DOCPROOF_REPO} standalone external>
          <span>{copy.repo}</span>
        </TextLink>
      </li>
      <li>
        <TextLink href={workHref} standalone>
          {copy.work}
        </TextLink>
      </li>
    </ul>
  );
}
