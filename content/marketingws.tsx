// The MarketingWS build note's sourced prose: the intro, the problem, the architecture and its
// steps, how I checked it, the outcome, the limits and the links. Each export is a server section
// without its own heading, so the page decides the outline and the anchors
// (src/components/marketingws/MarketingwsPage.tsx). The note has no figures to print: every claim
// is in words, and the repository links are pinned to the commits the text was checked against.
import type { ReactNode } from 'react';
import type { GlanceParts } from '@/components/depth/GlanceBlock';
import type { Items } from '@/components/build-notes/slots';
import { TextLink } from '@/components/kit/TextLink';

// The words are a `MarketingwsCopy`: MARKETINGWS_EN here, the German twin in content/de/marketingws.tsx
// typed by the same type, so a missing key fails the typecheck. The note has no figures, so its copy
// needs no slots. Server only: no client file imports it.
export type MarketingwsCopy = {
  /** The h1, in two tones. The tool flags what it cannot support; it does not guarantee. */
  h1: string;
  quiet: string;
  /** The plain opening under the title (one paragraph). */
  intro: ReactNode;
  glance: GlanceParts;
  problem: Items;
  /** The service around the steps of the diagram (one paragraph). */
  architecture: ReactNode;
  shots: { leadIn: string; takeaway: string };
  steps: {
    title: string;
    caption: string;
    /** The steps of one request, in order: the diagram's text, which is also its accessible content. */
    items: readonly { id: string; name: string; text: string }[];
  };
  checks: Items;
  outcome: Items;
  limits: Items;
  close: string;
  links: {
    repo: string;
    thesis: (tag: string) => ReactNode;
    demo: string;
    /** The sentence that always stands beside the demo link. */
    groq: string;
    offline: string;
  };
};

/** The public repository, at the commit of its README and code that this note describes. */
export const MARKETINGWS_REPO = 'https://github.com/MaHmOuDeB/MarketingWS';
export const MARKETINGWS_COMMIT = 'ab61983188d9d9fa5b04b2c4d1b67b1fbcd91d80';
/** The commit the annotated tag of the evaluated thesis version points to (the tag peeled, not the tag object). */
export const MARKETINGWS_THESIS_TAG = 'thesis-2025';
export const MARKETINGWS_THESIS_COMMIT = 'dfcc064955f4511ccc1d1b1e4de6626fc3b2759f';
/** The live demo, another site. It was checked to answer before this link was added. */
export const MARKETINGWS_DEMO = 'https://marketing-ws.vercel.app/';

/** The sentence that always stands beside the demo link. */
export const GROQ_NOTE = "The live demo depends on Groq's free tier.";

export const MARKETINGWS_EN: MarketingwsCopy = {
  h1: 'MarketingWS: marketing copy from one brief,',
  quiet: 'with a check for invented figures.',
  intro: (
    <p>
      A language model can write marketing copy in seconds, and it can also invent a discount nobody approved.
      MarketingWS, my Master&apos;s thesis rebuilt in 2026 as a live web app, drafts copy from a brief and turns figures
      and promises the brief does not support into visible placeholders.
    </p>
  ),
  /** The 20-second top of the page: one sentence and the facts (MarketingWS has no Facts). */
  glance: {
    outcome: 'It drafts from a brief, revises the current draft, and turns figures and promises it cannot support into placeholders.',
    role: 'Built independently (thesis 2025, rebuild 2026).',
    methods:
      'Brief-to-draft generation, revise/translate current draft, code plus model fact check, behavioural evals; thesis evaluated with marketers.',
    tools: 'Python, FastAPI, Streamlit, Vercel, Groq, OpenAI, Docker.',
    when: 'Thesis Apr to Nov 2025, rebuild live since Sep 2026.',
    scope: "Master's thesis (2025), rebuilt in 2026.",
  },
  problem: [
    [
      'brief',
      <>
        Marketing copy starts from a brief: the campaign, the channel, the tone and the audience. A language model can
        draft from it, but it can also add figures and promises the brief never gave it.
      </>,
    ],
    [
      'tool',
      <>
        I built MarketingWS for my Master&apos;s thesis in 2025 and rebuilt it in 2026. The rebuild drafts social posts,
        emails and ads from a brief, revises the current draft with the marketer&apos;s feedback instead of starting
        again, and turns figures and promises it cannot support into placeholders.
      </>,
    ],
  ],
  architecture: <p>The rebuild is a FastAPI service with a web app, deployed on Vercel. The model provider is a setting.</p>,
  shots: {
    /** What to look at in the two screenshots, and what they mean. */
    leadIn: 'Look for the placeholder in the draft: the brief gave no figure, so the tool left a gap instead of making one up.',
    takeaway: 'Where the brief gives no figure, the copy shows a gap for a person to fill, not a number nobody approved.',
  },
  steps: {
    title: 'Every draft is checked against the brief',
    caption: 'One request, step by step. Translation starts from the current draft rather than writing a new one.',
    items: [
      {
        id: 'input',
        name: 'Brief',
        text: 'Campaign type, platform, tone, audience and language.',
      },
      {
        id: 'draft',
        name: 'Draft',
        text: 'A first draft, a revision of the current draft with feedback, or copy variants from different angles.',
      },
      {
        id: 'check',
        name: 'Check',
        text: "Figures and promises that neither the brief nor the marketer's feedback supports become placeholders such as [X%]; a short model review catches invented features.",
      },
      {
        id: 'translate',
        name: 'Translate',
        text: 'On request, the current draft in German, French, Spanish, Italian, Portuguese or Dutch, keeping hashtags and placeholders.',
      },
      {
        id: 'output',
        name: 'Output',
        text: 'The copy, which the marketer can send back with new feedback.',
      },
    ],
  },
  checks: [
    [
      'offline',
      <>
        Offline tests cover the service and its API with the model replaced by stand-ins, so they run in GitHub Actions
        without an API key.
      </>,
    ],
    [
      'behaviour',
      <>
        A separate behavioural evaluation calls the real model: each refinement must change the draft as asked,
        translations must keep placeholders and hashtags, and the copy variants must differ. It costs model calls, so
        it is not part of CI.
      </>,
    ],
  ],
  outcome: [
    [
      'live',
      <>
        The rebuild has been live since September 2026. The thesis version is kept in the repository under its own
        tag.
      </>,
    ],
    [
      'thesis',
      <>
        Professional marketers evaluated the thesis version in two rounds. That evaluation does not cover what the
        rebuild added: revising the current draft, translating it, the copy variants and the check.
      </>,
    ],
  ],
  limits: [
    ['soft-claims', <>The check in code looks for figures and promises; softer claims can slip through the model review.</>],
    [
      'translations',
      <>I have no evaluation of the rebuild&apos;s translations by native readers, so I make no claim about their quality.</>,
    ],
  ],
  close: 'I took a generative AI idea from thesis to a live web app with checks.',
  links: {
    repo: 'The MarketingWS repository, at the commit this page describes',
    thesis: (tag) => <>The thesis version, under the tag {tag}</>,
    demo: 'The live demo, on another site',
    groq: GROQ_NOTE,
    offline: "Run locally without an API key, the app starts in an offline demo mode; the repository's README explains how.",
  },
};

/** The repository and the thesis tag at their pinned commits, and the live demo with its note. */
export function MarketingwsLinks({ copy }: { copy: MarketingwsCopy['links'] }): ReactNode {
  return (
    <>
      <ul>
        <li>
          <TextLink href={`${MARKETINGWS_REPO}/tree/${MARKETINGWS_COMMIT}`} standalone external>
            <span>{copy.repo}</span>
          </TextLink>
        </li>
        <li>
          <TextLink href={`${MARKETINGWS_REPO}/tree/${MARKETINGWS_THESIS_COMMIT}`} standalone external>
            <span>{copy.thesis(MARKETINGWS_THESIS_TAG)}</span>
          </TextLink>
        </li>
        <li>
          <TextLink href={MARKETINGWS_DEMO} standalone external>
            <span>{copy.demo}</span>
          </TextLink>
          <p data-demo-note="">{copy.groq}</p>
        </li>
      </ul>
      <p className="mt-4">{copy.offline}</p>
    </>
  );
}
