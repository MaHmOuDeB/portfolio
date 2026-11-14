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
import { derivedAttr } from '@/components/kit/Derived';
import { TextLink } from '@/components/kit/TextLink';

const ITEM = 'mt-4 first:mt-0';
const BUILD = derivedAttr(['build']);

/** The line under the page title. */
export function DocproofIntro(): ReactNode {
  return (
    <p>
      Document verification with multi-agent orchestration and automated checks. An open-source project under the MIT
      licence that I designed and built in 2026, with Claude Code as pair-programmer.
    </p>
  );
}

/** The 20-second top of the page, under the title and its line. */
export const DOCPROOF_GLANCE: GlanceParts = {
  outcome:
    'Built an open-source tool where agents propose changes and deterministic checks decide what reaches the reader; no adoption claimed.',
  role: 'Designed and built, Claude Code as pair-programmer.',
  methods:
    'Single fact base, claim verification, multi-agent orchestration (author, auditor, context-free reviewer), rendering checks.',
  tools: 'Python, Claude Code agents and skills, headless Chrome, GitHub Actions.',
  when: '2026.',
};

/** What the tool removes: a model's drift away from its source, and slow checking by hand. */
export function DocproofProblem(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        Language models are good at rewriting text and poor at staying true to a source. When a model drafts or edits a
        document, it can drift into claims the source never made, and doing that work by hand is slow.
      </p>
      <p className={ITEM}>
        Docproof splits the work in two: deterministic tools do the parts that must be exact and can show what they
        changed, and agents with separate roles make the judgement calls. Nothing an agent writes reaches the reader
        without passing the tools’ checks.
      </p>
    </>
  );
}

/** The parts and the roles, before the diagram. */
export function DocproofArchitecture(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        One Markdown file, the fact base, is the only source of truth. It also lists known gaps: things a document must
        never claim. A Python command-line tool builds Word files from structured data, writes surgical edits to a new
        file that leaves everything else byte for byte the same, and typesets designed PDFs with headless Chrome.
      </p>
      <p className={ITEM}>
        Claude Code agents work through that tool. An author drafts and edits; a claim auditor checks every claim
        against the fact base and never edits; a context-free reviewer reads the result without the fact base, as a
        stranger would. The orchestrator, a person or a Claude Code command, weighs their findings, applies only the
        true fixes through the tool and runs the checks again.
      </p>
    </>
  );
}

export const ARCHITECTURE_TITLE = 'Agents propose changes; deterministic checks decide what reaches the reader';
export const ARCHITECTURE_CAPTION = 'A failed check sends the document back to the orchestrator, never on to the reader.';

/** The diagram's stages, in the order a document passes them. */
export const ARCHITECTURE_STAGES: readonly { id: string; name: string; body: string }[] = [
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
];

/** How the tools themselves are checked, and the human step no check replaces. */
export function DocproofVerification(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        The tools are ordinary code, so they are tested like code: unit tests, and a GitHub Actions run on every push
        that renders a real PDF in headless Chrome and runs the demo. Each editing command compares the document before
        and after and fails if anything other than its target changed. The rendered pages are still looked at, by the
        author agent or whoever runs the tools; no check replaces that.
      </p>
      <p className={ITEM}>
        Below is one run of the verify check, recorded for this page on a fictional notice from a community garden with
        two planted errors: a number the fact base does not hold and a known gap.
      </p>
    </>
  );
}

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

export const RUN_TITLE = 'A recorded run of the verify check';

/** "12.11.2026" for "2026-11-12". */
function versionDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** A recorded block under its visible label, which is also its accessible name. */
function Block({ id, label, children }: { id: string; label: string; children: string }) {
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
        className="mt-2 max-w-figure overflow-x-auto border-l border-line py-2 pl-4 text-sm"
      >
        <code {...BUILD}>{children}</code>
      </pre>
    </>
  );
}

/** The recorded run with its inputs, or "Not recorded" when no run was captured. */
export function DocproofRunEvidence({ run }: { run: RecordedRun | null }): ReactNode {
  return (
    <div className="mt-8 max-w-figure">
      <h3 id="verify-run-title" className="max-w-text text-xl font-semibold">
        {RUN_TITLE}
      </h3>
      {run === null ? (
        <p className="mt-3 max-w-text">Not recorded.</p>
      ) : (
        <>
          <Block id="fact-base" label="The fact base">{run.factBase}</Block>
          <Block id="notice" label="The notice, one paragraph per line">{run.document.join('\n')}</Block>
          <Block id="output" label="The command and its output">{`$ ${run.command}\n${run.output}`}</Block>
          <p className="mt-4 max-w-text text-sm text-muted">
            Recorded on{' '}
            <time dateTime={run.recordedOn} {...BUILD}>
              {versionDate(run.recordedOn)}
            </time>{' '}
            with docproof at commit <span {...BUILD}>{run.commit}</span>, run from its source. The notice is a Word file
            with the paragraphs above.
          </p>
        </>
      )}
    </div>
  );
}

/** What exists, without users or adoption. */
export function DocproofOutcome(): ReactNode {
  return (
    <p>
      A public command-line tool and its Claude Code agent definitions, under the MIT licence, with unit tests and
      continuous integration. This page describes what it does and how it is checked, not who uses it.
    </p>
  );
}

/** What the checks cannot show. */
export function DocproofLimits(): ReactNode {
  const limits: readonly [key: string, body: ReactNode][] = [
    [
      'mechanical',
      <>
        The checks are mechanical. The verify check passes a number if it appears anywhere in the fact base, so a true
        number attached to the wrong claim passes too, and it skips dates and years. Judging wording and scope is left
        to the auditor agent and to the orchestrator.
      </>,
    ],
    ['source', <>A passing run shows only that the document agrees with the fact base, not that the fact base is true.</>],
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
  ];
  return (
    <ul className="list-disc pl-6">
      {limits.map(([key, body]) => (
        <li key={key} className="mt-2 first:mt-0">
          {body}
        </li>
      ))}
    </ul>
  );
}

/** The page's one link: back to the Work directory. */
export function DocproofLinks(): ReactNode {
  return (
    <ul>
      <li>
        <TextLink href="/work" standalone>
          All my work
        </TextLink>
      </li>
    </ul>
  );
}
