// The MarketingWS build note's sourced prose: the intro, the problem, the architecture and its
// steps, how I checked it, the outcome, the limits and the links. Each export is a server section
// without its own heading, so the page decides the outline and the anchors
// (src/components/marketingws/MarketingwsPage.tsx). The note has no figures to print: every claim
// is in words, and the repository links are pinned to the commits the text was checked against.
import type { ReactNode } from 'react';
import { TextLink } from '@/components/kit/TextLink';

/** The public repository, at the commit of its README and code that this note describes. */
export const MARKETINGWS_REPO = 'https://github.com/MaHmOuDeB/MarketingWS';
export const MARKETINGWS_COMMIT = 'ab61983188d9d9fa5b04b2c4d1b67b1fbcd91d80';
/** The commit the tag of the evaluated thesis version points to. */
export const MARKETINGWS_THESIS_TAG = 'thesis-2025';
export const MARKETINGWS_THESIS_COMMIT = '36f65252fcd81f81b388f3a64067a0be1db172cf';
/** The live demo, another site. It was checked to answer before this link was added. */
export const MARKETINGWS_DEMO = 'https://marketing-ws.vercel.app/';

/** The sentence that always stands beside the demo link. */
export const GROQ_NOTE = "The live demo depends on Groq's free tier.";

const ITEM = 'mt-4 first:mt-0';

/** The line under the page title. */
export function MarketingwsIntro(): ReactNode {
  return <p>My Master&apos;s thesis, a generative AI web service for content marketing, rebuilt in 2026 as a live web app.</p>;
}

/** What the tool is for. */
export function MarketingwsProblem(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        Marketing copy starts from a brief: the campaign, the channel, the tone and the audience. A language model can
        draft from it, but it can also add figures and promises the brief never gave it.
      </p>
      <p className={ITEM}>
        I built MarketingWS for my Master&apos;s thesis in 2025 and rebuilt it in 2026. The rebuild drafts social posts,
        emails and ads from a brief, revises the current draft with the marketer&apos;s feedback instead of starting
        again, and turns figures and promises it cannot support into placeholders.
      </p>
    </>
  );
}

/** The service around the steps of the diagram. */
export function MarketingwsArchitecture(): ReactNode {
  return (
    <p>
      The rebuild is a FastAPI service with a web app, deployed on Vercel. The model provider is a setting.
    </p>
  );
}

/** The steps of one request, in order: the diagram's text, which is also its accessible content. */
export const MARKETINGWS_STEPS: readonly { id: string; name: string; text: string }[] = [
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
    text: 'Figures and promises the brief does not support become placeholders such as [X%]; a short model review catches invented features.',
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
];

export const STEPS_TITLE = 'Every draft is checked against the brief';
export const STEPS_CAPTION = 'One request, step by step. Translation starts from the current draft rather than writing a new one.';

/** The tests and the evaluation. */
export function MarketingwsChecks(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        Offline tests cover the service and its API with the model replaced by stand-ins, so they run in GitHub Actions
        without an API key.
      </p>
      <p className={ITEM}>
        A separate behavioural evaluation calls the real model: each refinement must change the draft as asked,
        translations must keep placeholders and hashtags, and the copy variants must differ. It costs model calls, so
        it is not part of CI.
      </p>
    </>
  );
}

/** What exists, and what the thesis evaluation does and does not cover. */
export function MarketingwsOutcome(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        The rebuild has been live since September 2026. The thesis version is kept in the repository under its own
        tag.
      </p>
      <p className={ITEM}>
        Professional marketers evaluated the thesis version in two rounds. That evaluation does not cover what the
        rebuild added: revising the current draft, translating it, the copy variants and the check.
      </p>
    </>
  );
}

/** What this tool cannot promise. */
export function MarketingwsLimits(): ReactNode {
  const limits: readonly [key: string, body: ReactNode][] = [
    ['free-tier', <>The live demo depends on Groq&apos;s free tier, so I cannot promise it answers when you try it.</>],
    [
      'soft-claims',
      <>The check in code looks for figures and promises; softer claims can slip through the model review.</>,
    ],
    [
      'translations',
      <>I have no evaluation of the translated copy by native readers, so I make no claim about its quality.</>,
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

/** The repository and the thesis tag at their pinned commits, and the live demo with its note. */
export function MarketingwsLinks(): ReactNode {
  return (
    <>
      <ul>
        <li>
          <TextLink href={`${MARKETINGWS_REPO}/tree/${MARKETINGWS_COMMIT}`} standalone external>
            <span>The MarketingWS repository, at the commit this page describes</span>
          </TextLink>
        </li>
        <li>
          <TextLink href={`${MARKETINGWS_REPO}/tree/${MARKETINGWS_THESIS_COMMIT}`} standalone external>
            <span>The thesis version, under the tag {MARKETINGWS_THESIS_TAG}</span>
          </TextLink>
        </li>
        <li>
          <TextLink href={MARKETINGWS_DEMO} standalone external>
            <span>The live demo, on another site</span>
          </TextLink>
          <p data-demo-note="">{GROQ_NOTE}</p>
        </li>
      </ul>
      <p className="mt-4">
        Without an API key it runs in an offline demo mode; the repository&apos;s README explains how to run it locally.
      </p>
    </>
  );
}
