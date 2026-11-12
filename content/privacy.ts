// The privacy notice, as data. Every sentence that states a fact about the code is backed by a test
// (tests/unit/privacy.test.tsx, tests/unit/privacy-claims.test.ts, tests/e2e/privacy-claims.spec.ts).
// Any new request, storage, embed or provider changes this file, its `updatedOn` and those tests in
// the same change. Numbers are `derived` blocks read from the pre-registered configuration. The
// controller's name, city and LinkedIn address are read from src/lib/site.ts, never retyped.
//
// Imports are relative with the .ts extension, so scripts run with Node's type stripping
// (scripts/launch-check.ts) can read LAUNCH_FACTS.
import { EXPERIMENT } from '../src/experiment.values.ts';
import { CONTACT, CONTACT_HREF, SITE } from '../src/lib/site.ts';

export type PrivacyBlock =
  | string
  | { derived: number; unit: 'count' }
  /** A link; `external` for one that leaves the site. */
  | { link: { href: string; text: string; external?: true } }
  /** The id of a fact in LAUNCH_FACTS that is not verified yet; renders data-launch-placeholder. */
  | { launchPlaceholder: string }
  /** This version's date (PRIVACY.updatedOn), in a <time> element. */
  | { updatedOn: true };
/** `id`, when set, is the heading's anchor (the contact form links to /privacy#contact-form). */
export type PrivacySection = { heading: string; id?: string; paragraphs: PrivacyBlock[][] };

/**
 * The provider facts the notice states, each with where and when it was checked. A fact that is not
 * verified yet has `verified: null`: the page shows a launch placeholder in its place, and the
 * launch check (`npm run launch:check`) fails until it is verified and written into the copy.
 */
export type LaunchFact = { id: string; question: string; verified: { on: string; source: string } | null };

export const LAUNCH_FACTS: readonly LaunchFact[] = [
  {
    id: 'vercel-request-logs',
    question: "Which fields Vercel's request logs hold for a visitor",
    verified: {
      on: '2026-10-22',
      source:
        'Vercel privacy notice (IP address, browser type, referring page, city and country for customer sites; no retention period published) and https://vercel.com/docs/logs/runtime (request path, user agent), rechecked 2026-10-26',
    },
  },
  {
    id: 'vercel-log-retention',
    question: 'How long the runtime logs in the Vercel account are kept on the Hobby plan',
    verified: { on: '2026-10-26', source: 'https://vercel.com/docs/logs/runtime, Limits: Hobby, 1 hour of logs' },
  },
  {
    id: 'vercel-regions',
    question: 'Where the functions and the proxy run',
    verified: {
      on: '2026-10-26',
      source:
        'vercel.json regions ["fra1"] (tests/unit/privacy-claims.test.ts); https://vercel.com/docs/routing-middleware: Routing Middleware "runs globally before the cache"',
    },
  },
  {
    id: 'vercel-transfers',
    question: 'The transfer mechanism in Vercel’s data processing terms',
    verified: { on: '2026-10-22', source: 'Vercel terms of service s.11.1 and data processing addendum: 2021 standard contractual clauses, processing in the US' },
  },
  {
    id: 'upstash-transfers',
    question: 'The transfer mechanism in Upstash’s data processing terms, and the store region',
    verified: { on: '2026-10-22', source: 'https://upstash.com/trust/dpa.pdf (April 2025): EU-US Data Privacy Framework, standard contractual clauses as fallback; the store runs in Frankfurt with no read regions (the store settings)' },
  },
  {
    id: 'resend-transfers',
    question: 'Who Resend is, where it processes the messages, and the transfer mechanism in its data processing terms',
    verified: {
      on: '2026-11-12',
      source:
        'https://resend.com/legal/dpa (updated 2025-12-31): Plus Five Five, Inc., San Francisco, processor for the e-mails a customer sends (Exhibit B, s.9.1), primary processing in the US (s.6.1), EU SCCs of 4 June 2021 Module Two (s.1.16, 6.2.2), DPF certification stated (s.11.1); Resend changelog "Data Privacy Framework certification" (13 March 2025). Not checked: the entry on dataprivacyframework.gov',
    },
  },
  {
    id: 'resend-retention',
    question: 'How long Resend keeps the e-mails it delivered on the Free plan',
    verified: { on: '2026-11-12', source: 'https://resend.com/pricing (plan table: Free, data retention 30 days); https://resend.com/legal/dpa Exhibit A' },
  },
  {
    id: 'google-transfers',
    question: 'Whether Google states that Google LLC is certified under the EU-US Data Privacy Framework',
    verified: { on: '2026-11-12', source: 'https://policies.google.com/privacy/frameworks (fact first checked 2026-10-26)' },
  },
  {
    id: 'upstash-backups',
    question: 'Whether the counter database keeps backups, and for how long',
    verified: null,
  },
];

const n = (value: number): PrivacyBlock => ({ derived: value, unit: 'count' });
const PV_MINUTES = n(EXPERIMENT.pvTtlSeconds / 60);
const HASH_MINUTES = n(EXPERIMENT.rateLimit.keyTtlSeconds / 60);

export const PRIVACY: { title: 'Privacy'; updatedOn: string; sections: PrivacySection[] } = {
  title: 'Privacy',
  updatedOn: '2026-11-12',
  sections: [
    {
      heading: 'Who is responsible',
      paragraphs: [
        ['I am responsible for this site and for the data described here: ', SITE.name, ', ', SITE.city, '.'],
        ['You can reach me through the contact form on this site or through my LinkedIn profile:'],
        [{ link: { href: CONTACT_HREF, text: 'Contact form' } }],
        [{ link: { href: CONTACT.linkedin, text: CONTACT.linkedin.replace(/^https:\/\/www\./, ''), external: true } }],
      ],
    },
    {
      heading: 'What a page view sends',
      paragraphs: [
        [
          "The home page runs a small experiment on its card headlines. When you open it, the page's script sends a few short messages to this site's own server. Each message holds a random id made for that one view, a label for the round of the experiment, the group you were shown, and which of these happened: the page was opened from outside the site; the cards came into view; you interacted with the page or stayed ",
          n(EXPERIMENT.guardrail.quickExitSeconds),
          ' seconds; you clicked a featured card, a case study or the Lab, the CV page or the CV PDF, or a contact link (LinkedIn, GitHub or this site’s contact form).',
        ],
        [
          'If the view cannot count, the script sends one message instead, which says why: an automated browser, a group chosen through the page address, or not a fresh visit from outside the site.',
        ],
        [
          "The script does not send the referring site or the address of a link you click (your browser sends the page address and the referring page with each request, see 'Your IP address and browser type'). What the server keeps is tallies per day and per group. It stores no page address, referring site, IP address or browser type. It keeps the per-view id only to count each view once, and deletes it from the database at most ",
          PV_MINUTES,
          ' minutes after your browser first sent it.',
        ],
        ['Before the experiment starts, the server stores nothing from these messages.'],
      ],
    },
    {
      heading: 'What the script reads in your browser',
      paragraphs: [
        [
          "To decide whether a view counts, the script reads how the page was opened, the page's own address, the referring page, whether the page and the cards are visible, whether the browser is automated, and whether your browser sends Global Privacy Control or Do Not Track. To know whether you interacted, it notices presses of a mouse button or a finger, scrolling, key presses and touches. When you click a link, it reads the link's address, to know which kind of link it was. It sends only the outcome.",
        ],
        ['If your browser sends Global Privacy Control or Do Not Track, the page sends no experiment data at all.'],
        ['I consider this part of showing you the page, and I ask no consent. Nothing is stored on your device.'],
      ],
    },
    {
      heading: 'Cookies and storage',
      paragraphs: [
        ['This site sets no cookies in your browser, and writes nothing to its storage.'],
        ['The only cookie it ever sets is one I set on my own devices, through a private link, to leave my own visits out of the counts.'],
      ],
    },
    {
      heading: 'Your IP address and browser type',
      paragraphs: [
        ['Your browser sends both with every request, to any site.'],
        [
          'Vercel, which hosts this site, processes them to deliver it. Its request logs include your IP address, browser type, the page address, the referring page and your approximate location (city and country). The logs I can see in my Vercel account are kept for one hour on my plan (Hobby). Vercel publishes no retention period for its own records, and may keep security records longer under its own terms.',
        ],
        ['This site checks the browser type to filter out bots, and does not store it.'],
        [
          "To limit abuse of the experiment's messages, the server turns your IP address (for IPv6, its network part) into a keyed hash, which is deleted at most ",
          HASH_MINUTES,
          ' minutes after it is made. The address itself is never stored by this site. With the key, the hash could in principle be traced back to the address, so I treat it as personal data for those ',
          HASH_MINUTES,
          ' minutes.',
        ],
      ],
    },
    {
      heading: 'The contact form',
      id: 'contact-form',
      paragraphs: [
        [
          'If you write to me through the contact form, your browser sends what you enter to this site’s server: your name, your e-mail address, why you are getting in touch, a subject and your message. It also sends the time the form was shown to you, and a hidden field that a person leaves empty, so the server can turn away forms filled in by bots. Like every request, it carries your IP address and browser type (see ‘Your IP address and browser type’).',
        ],
        [
          'The server checks the form and passes it to Resend, which delivers it to my e-mail inbox as a plain-text e-mail, with your e-mail address as the one I reply to. Your browser sends the form only to this site, never to Resend, and the page loads nothing from another site.',
        ],
        [
          'This site stores nothing from the form. It keeps no copy in a database or a file, sets no cookie, and does not write what you entered to its logs. If the message cannot be sent, the page says so and nothing is kept.',
        ],
        [
          'To limit abuse, the server keeps a keyed hash of your IP address (for IPv6, its network part) in its memory for at most an hour, to count how many messages come from one address. The hash is never written to a database, a file or a log, and the address itself is never stored. With the key, the hash could in principle be traced back to the address, so I treat it as personal data for that hour.',
        ],
        ['Please do not send me health or other sensitive information through the form.'],
      ],
    },
    {
      heading: 'Purposes and legal bases',
      paragraphs: [
        ["Delivering and securing the site, including Vercel's logs and the rate limits: Art. 6(1)(f) GDPR. My legitimate interest is a site that works and is not abused."],
        ["Running and publishing this site's own experiment: Art. 6(1)(f) GDPR. My legitimate interest is to measure, in the open, which card headlines work better."],
        ['Passing a message from the contact form on to my inbox, and the form’s checks against spam and abuse: Art. 6(1)(f) GDPR. My legitimate interest is to receive the messages people choose to send me, and to keep the form free of spam.'],
        ['Replying to your messages, on LinkedIn or by e-mail: Art. 6(1)(b) GDPR when we talk about a job, and Art. 6(1)(f) GDPR otherwise.'],
        ['The cookie on my own devices: §25(2) No. 2 TDDDG.'],
      ],
    },
    {
      heading: 'Who processes the data',
      paragraphs: [
        [
          "Vercel Inc., USA, hosts the site. The site's functions run in Frankfurt. The code that picks your group for the home page, and Vercel's network that serves the pages, can run at the location nearest you, which can be outside the EU. Vercel's published data processing terms use the EU standard contractual clauses of 2021 for processing in the US. The experiment's pause switch is kept in Vercel's Edge Config.",
        ],
        [
          "Upstash, Inc., USA, runs the counter database, which is stored in Frankfurt. Upstash's published data processing terms rely on the EU-US Data Privacy Framework, with the standard contractual clauses as a fallback.",
        ],
        [
          'Resend (Plus Five Five, Inc.), USA, delivers the messages from the contact form to my inbox, and processes them in the USA. Resend’s published data processing terms use the EU standard contractual clauses of 2021 and state that Resend is certified under the EU-US Data Privacy Framework.',
        ],
        [
          'My inbox is a Gmail account, so Google processes the messages there under its own terms. Google states that Google LLC, USA, is certified under the EU-US Data Privacy Framework.',
        ],
        ['Messages you send me on LinkedIn are processed by LinkedIn under its own terms.'],
        [
          'No third-party analytics, advertising or social-media service runs on this site, and nothing loads from another site. The only measurement is the experiment’s own counts described above. The links to LinkedIn and GitHub take you to those sites, under their own terms.',
        ],
      ],
    },
    {
      heading: 'How long',
      paragraphs: [
        ['Per-view ids: at most ', PV_MINUTES, ' minutes.'],
        ['IP address hashes for the experiment’s rate limit: at most ', HASH_MINUTES, ' minutes.'],
        ['IP address hashes for the contact form’s limit: at most an hour, in the server’s memory only.'],
        ["Vercel's logs: as described above."],
        ['Messages, on LinkedIn or in my inbox, including those from the contact form: kept until I delete them, which I do when the conversation is over, unless I need to keep them, for example for an application that is still open.'],
        ['Resend keeps the e-mail it delivered in my Resend account for thirty days, the retention of my plan, and may keep records longer under its own terms.'],
        [
          'The counts, including those of earlier rounds of the experiment, are kept as its public record. They are published on this site at /experiment/data.json as aggregated daily counts with no identifiers, added up over time, and any count above zero and below ',
          n(EXPERIMENT.smallCellBelow),
          ' is shown as "<',
          n(EXPERIMENT.smallCellBelow),
          '". Clicks on the CV page or the CV PDF and on contact links are published only as final totals, after the experiment ends.',
        ],
        ['Edge Config holds no personal data: only whether the experiment is paused or its calibration failed, with a short reason and date.'],
        [{ launchPlaceholder: 'upstash-backups' }],
      ],
    },
    {
      heading: 'Your rights',
      paragraphs: [
        [
          'You have the right to access (Art. 15 GDPR), rectification (Art. 16 GDPR), erasure (Art. 17 GDPR), restriction (Art. 18 GDPR), portability (Art. 20 GDPR) and objection (Art. 21 GDPR). You can also complain to a supervisory authority (Art. 77 GDPR), for example the Berlin Commissioner for Data Protection and Freedom of Information.',
        ],
        [
          'To use these rights, write to me through the contact form (choose "Privacy or data request") or on LinkedIn. For a message you sent through the form, tell me the e-mail address you used, so I can find it, and I will reply to that address.',
        ],
        [
          'You can object at any time to processing based on Art. 6(1)(f) GDPR (Art. 21 GDPR). For the experiment, the simplest way is to have your browser send Global Privacy Control or Do Not Track; otherwise send me a message on LinkedIn or through the contact form.',
        ],
        [
          'I cannot tell which counts come from you, so there is nothing about you to look up (Art. 11(2) GDPR). To stop your views being counted, have your browser send Global Privacy Control or Do Not Track.',
        ],
        ["You don't have to provide any of this: the site works the same if the experiment's messages are blocked."],
        ['Writing to me is up to you. The contact form needs all five fields to send a message; if you would rather not give them, write to me on LinkedIn instead.'],
        ['There are no automated decisions about you and no profiling. The group is drawn at random, and it changes nothing but the card headlines.'],
      ],
    },
    {
      heading: 'Changes',
      paragraphs: [
        ['When what this site collects changes, I update this page and its date.'],
        ['This version is dated ', { updatedOn: true }, '.'],
      ],
    },
  ],
};
