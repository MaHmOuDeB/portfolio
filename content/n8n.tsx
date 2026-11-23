// The n8n build note's prose: document and process automation for accounts payable (an e-invoice
// intake for XRechnung and ZUGFeRD) and for operations (error alerts), how it is tested and how it
// ships, and what it is not. The one figure is the test count, a profile fact. A portfolio project:
// no customer, no production use and no invoice volumes, so the outcome is the engineering only.
// The repository links point at the commit whose README this page was checked against; the README
// says which tests run on every push and which are run by hand.
import type { ReactNode } from 'react';
import type { GlanceParts } from '@/components/depth/GlanceBlock';
import type { Items, NoteSlots } from '@/components/build-notes/slots';
import { TextLink } from '@/components/kit/TextLink';

// The words are an `N8nCopy`: N8N_EN here, the German twin in content/de/n8n.tsx typed by the same type,
// so a missing key fails the typecheck. A sentence with the test count is a function of the slots, which
// hold the number as an element in the page's language. Server only: no client file imports it.
export type N8nStep = { name: string; detail: string };
export type N8nTrack = { id: 'intake' | 'alerts'; label: string; steps: readonly (N8nStep | readonly N8nStep[])[] };

export type N8nCopy = {
  /** The h1 and the document title (content/seo.ts); the h1 adds its quiet clause. */
  title: string;
  /** The quiet second clause of the h1: the test count, a profile fact. */
  quiet: (s: NoteSlots) => ReactNode;
  /** The plain opening under the title: the one paragraph that says what this is. */
  intro: () => ReactNode;
  glance: (s: NoteSlots) => GlanceParts;
  problem: () => Items;
  architecture: () => Items;
  flow: {
    /** The intake's steps (its last step ends in two outcomes), then the alerts. */
    tracks: readonly N8nTrack[];
    title: string;
    leadIn: string;
    takeaway: string;
    caption: string;
  };
  checks: (s: NoteSlots) => Items;
  /** The summary of the row that holds the failure cases and what runs on every push. */
  checksSummary: string;
  outcome: () => Items;
  limits: () => Items;
  /** The summary of the row that holds what it needs to run. */
  needsSummary: string;
  close: string;
  sources: { repo: string; tests: string; licence: string };
};

/** The h1 and the document title (content/seo.ts); the h1 adds its quiet clause. */
export const N8N_TITLE = 'E-invoice intake and error alerts in n8n';

/** The public repository and the commit this page describes (its default branch head, 2026-10-16). */
export const N8N_REPO = {
  base: 'https://github.com/MaHmOuDeB/n8n-workflow-library',
  commit: '626a254fdccb2ee558dca1f371fdcaa3a4523d8c',
} as const;

export const N8N_EN: N8nCopy = {
  title: N8N_TITLE,
  quiet: (s) => (
    <>
      with {s.fact('profile.n8n.automated_tests')} automated tests.
    </>
  ),
  intro: () => (
    <p>
      Since January 2025 German companies must be able to receive electronic invoices. I built automations that read
      each invoice, check its sums and bank details, approve the routine ones and send anything unusual to a person.
    </p>
  ),
  glance: (s) => ({
    points: [{ id: 'tests', figure: s.fact('profile.n8n.automated_tests'), label: 'automated tests' }],
    outcome: 'Document and process automation in n8n that installs with one command, restored and checked after a full wipe of its data.',
    role: 'I set the requirements and made the design decisions.',
    methods:
      'Structural/arithmetic/master-data checks, duplicate and changed-bank-detail flags, restore test, clean-install test.',
    tools: 'n8n, Node.js, REST/webhooks, Gmail API, Docker, PostgreSQL, Caddy, GitHub Actions.',
    when: '2026.',
    scope: 'Personal project, 2026. No client and no production use; every invoice was a generated sample.',
  }),
  problem: () => [
    [
      'einvoice',
      <>
        Each structured e-invoice arrives as XML. Someone has to read and check it and catch risky cases, such as changed
        bank details.
      </>,
    ],
    [
      'alerts',
      <>
        A failing workflow is easy to miss. I wanted tested automations for both, installed with one command.
      </>,
    ],
  ],
  architecture: () => [
    [
      'intake',
      <>
        Invoices arrive by upload or from a Gmail mailbox, as XRechnung (CII or UBL), ZUGFeRD or Factur-X. The intake
        checks totals, VAT, dates, tax IDs, the IBAN checksum and the currency, finds duplicates even across formats,
        flags changed bank details and archives the original byte for byte. Known-good invoices are approved
        automatically; the rest go to a person.
      </>,
    ],
    [
      'alerts',
      <>
        The error alerts turn any failing workflow into one readable e-mail, with secrets and personal data removed where
        possible and repeats throttled.
      </>,
    ],
  ],
  flow: {
    tracks: [
      {
        id: 'intake',
        label: 'E-invoice intake',
        steps: [
          { name: 'Arrives', detail: 'Upload address or Gmail mailbox' },
          { name: 'Read and check', detail: 'Totals, VAT, dates, tax IDs, IBAN, currency' },
          { name: 'Compare', detail: 'Duplicates and changed bank details' },
          { name: 'Archive', detail: 'The original, byte for byte' },
          [
            { name: 'Approved automatically', detail: 'Known-good invoices' },
            { name: 'Sent to a person', detail: 'Everything else, to approve or decline' },
          ],
        ],
      },
      {
        id: 'alerts',
        label: 'Error alerts',
        steps: [
          { name: 'Any workflow fails', detail: 'In the same n8n' },
          { name: 'One readable e-mail', detail: 'Secrets removed where possible, repeats throttled' },
        ],
      },
    ],
    title: 'Every invoice is checked and archived, and anything unusual goes to a person',
    leadIn: 'Follow one invoice from the moment it arrives to its outcome.',
    takeaway: 'Only invoices that match what is already known pass on their own; everything else waits for a person.',
    caption:
      'The e-invoice intake and the error alerts, step by step. Mail from the Gmail intake enters the same steps as an upload.',
  },
  checks: (s) => [
    [
      'suites',
      <>
        {s.fact('profile.n8n.automated_tests')} automated tests cover the workflows, the installer, the invoice logic, end-to-end uploads, the mail intake and the alerts. The final
        run installed everything on a brand-new n8n, with smoke tests and a customer-style acceptance test.
      </>,
    ],
    [
      'failure',
      <>
        I tested failure on purpose too: XML with entity definitions, duplicates sent in parallel, and a server without the zlib permission, where every upload failed until I fixed it.
      </>,
    ],
    [
      'ci',
      <>
        Part of the suite runs in GitHub Actions on every push; the tests that need a running n8n, real web calls or a
        Gmail mailbox are run by hand.
      </>,
    ],
  ],
  checksSummary: 'The failure cases and what runs on every push',
  outcome: () => [
    [
      'ships',
      <>
        It ships with an installer that has checks, a dry run and safe re-runs; a Docker Compose stack with PostgreSQL,
        HTTPS through Caddy and a pinned n8n version; and backup, restore and health-check scripts. A restore after
        losing all data volumes was verified.
      </>,
    ],
  ],
  limits: () => [
    [
      'validation',
      <>
        No client and no production use; every invoice was a generated sample. The stack ran with Docker on my own
        computer, not a hosted server.
      </>,
    ],
    [
      'scope',
      <>
        Not a certified XRechnung validator: the checks are structural, arithmetic and master-data only, with no OCR for scanned PDFs, no accounting-software link and no Outlook or IMAP intake.
      </>,
    ],
    [
      'tested',
      <>
        Its mails are English only. The Gmail intake was proven on one test mailbox, and while the Google app is in
        testing mode its sign-in expires after about a week.
      </>,
    ],
    [
      'needs',
      <>
        It expects a self-hosted n8n that allows the zlib module (without it, PDF invoices go to a person) and an SMTP
        account.
      </>,
    ],
  ],
  needsSummary: 'What it needs to run',
  close: 'I can automate a back-office process and prove it works with tests.',
  sources: {
    repo: 'The repository, at a fixed commit',
    tests: 'Its test results',
    licence: 'Its licence, MIT',
  },
};

/** The repository, its list of what has been tested and its licence, all at the pinned commit. */
export function N8nSources({ copy }: { copy: N8nCopy['sources'] }): ReactNode {
  const { base, commit } = N8N_REPO;
  const links: readonly [href: string, label: string][] = [
    [`${base}/tree/${commit}`, copy.repo],
    [`${base}/blob/${commit}/README.md#what-has-been-tested`, copy.tests],
    [`${base}/blob/${commit}/LICENSE`, copy.licence],
  ];
  return (
    <ul>
      {links.map(([href, label]) => (
        <li key={href}>
          <TextLink href={href} standalone external>
            <span>{label}</span>
          </TextLink>
        </li>
      ))}
    </ul>
  );
}
