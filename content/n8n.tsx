// The n8n build note's prose: document and process automation for accounts payable (an e-invoice
// intake for XRechnung and ZUGFeRD) and for operations (error alerts), how it is tested and how it
// ships, and what it is not. The one figure is the test count, a profile fact. A portfolio project:
// no customer, no production use and no invoice volumes, so the outcome is the engineering only.
// The repository links point at the commit whose README this page was checked against; the README
// says which tests run on every push and which are run by hand.
import type { ReactNode } from 'react';
import { Fact } from '@/components/kit/Fact';
import { TextLink } from '@/components/kit/TextLink';

export const N8N_TITLE = 'n8n Workflow Library';

/** The public repository and the commit this page describes (its default branch head, 2026-10-16). */
export const N8N_REPO = {
  base: 'https://github.com/MaHmOuDeB/n8n-workflow-library',
  commit: '626a254fdccb2ee558dca1f371fdcaa3a4523d8c',
} as const;

/** The line under the title: the Work page's description, word for word. */
export function N8nIntro(): ReactNode {
  return (
    <>
      Document and process automation in n8n: e-invoice intake (XRechnung, ZUGFeRD) and error alerts, with{' '}
      <Fact id="profile.n8n.automated_tests" /> automated tests. A portfolio project with no production use.
    </>
  );
}

/** The line on my role under the intro. */
export function N8nRole(): ReactNode {
  return (
    <>
      A personal project, built in 2026: three automations for a self-hosted n8n in a public, MIT-licensed repository,
      with no real customer, no production use and no real invoices. I set the requirements and made the design
      decisions; Claude Code was my pair programmer.
    </>
  );
}

export const N8N_PROBLEM: readonly [key: string, body: ReactNode][] = [
  [
    'einvoice',
    <>
      Since January 2025, German companies must be able to receive structured e-invoices. Someone has to read and check
      the XML and catch risky cases, such as changed bank details.
    </>,
  ],
  [
    'alerts',
    <>
      A failing workflow is easy to miss. I wanted tested automations for both, installed with one command.
    </>,
  ],
];

export const N8N_ARCHITECTURE: readonly [key: string, body: ReactNode][] = [
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
];

type Step = { name: string; detail: string };

/** The flow diagram: the intake's steps (its last step ends in two outcomes), then the alerts. */
export const N8N_FLOW: readonly { id: 'intake' | 'alerts'; label: string; steps: readonly (Step | readonly Step[])[] }[] = [
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
];

export const N8N_FLOW_TITLE = 'Every invoice is checked and archived, and anything unusual goes to a person';
export const N8N_FLOW_CAPTION =
  'The e-invoice intake and the error alerts, step by step. Mail from the Gmail intake enters the same steps as an upload.';

export const N8N_CHECKS: readonly [key: string, body: ReactNode][] = [
  [
    'suites',
    <>
      <Fact id="profile.n8n.automated_tests" /> automated tests cover the workflows, the installer, the invoice logic, end-to-end uploads, the mail intake and the alerts. The final
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
];

export const N8N_OUTCOME: readonly [key: string, body: ReactNode][] = [
  [
    'ships',
    <>
      It ships with an installer that has checks, a dry run and safe re-runs; a Docker Compose stack with PostgreSQL,
      HTTPS through Caddy and a pinned n8n version; and backup, restore and health-check scripts. A restore after
      losing all data volumes was verified. There is no adoption to report.
    </>,
  ],
];

export const N8N_LIMITS: readonly [key: string, body: ReactNode][] = [
  [
    'validation',
    <>
      No production or client validation: the stack ran with Docker on my own computer, not a hosted server, and every invoice it has seen was a generated sample.
    </>,
  ],
  [
    'scope',
    <>
      Not a certified XRechnung validator: the checks are structural, arithmetic and master-data only, with no OCR for scanned PDFs, no accounting-software link and no Outlook or IMAP intake.
    </>,
  ],
  [
    'needs',
    <>
      It needs a self-hosted n8n that allows the zlib module and an SMTP account, and its mails are English only. The
      Gmail intake was proven on one test mailbox, and while the Google app is in testing mode its sign-in expires
      after about a week.
    </>,
  ],
];

/** The repository, its list of what has been tested and its licence, all at the pinned commit. */
export function N8nSources(): ReactNode {
  const { base, commit } = N8N_REPO;
  const links: readonly [href: string, label: string][] = [
    [`${base}/tree/${commit}`, 'The repository, at a fixed commit'],
    [`${base}/blob/${commit}/README.md#what-has-been-tested`, 'Its test results'],
    [`${base}/blob/${commit}/LICENSE`, 'Its licence, MIT'],
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
