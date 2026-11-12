// The interview page's copy and links, as typed TSX. The page lists the links I open when I share my
// screen in an interview: the home page in each group, and two Lab Figures with their URL state.
//
// The home-page links force a group with `?variant=`, the existing contract of the proxy and the
// beacon (src/proxy.ts, src/lib/experiment/assign.ts): the proxy serves the asked group, and the
// beacon reports the view as forced, so it is left out of the live test. Nothing else is needed to
// keep these views out, and this page adds no override of its own.
//
// The Lab links reuse the Lab's routes and its Figures' URL namespaces (`peeking.*`, `planner.*`,
// `duration.*`). The peeking link asks for the Figure's `interview` preset, which is also its default
// view. The planner link sets values other than the presets; a server render cannot read them (the
// pages are static), so they apply once the planner's island loads, and the page says so.
//
// Plain words only: the link values live in the URLs, never in the text.
import type { ReactNode } from 'react';
import type { ExperimentPhase } from '@/experiment.values';
import { DURATION_ID, FULL_PLANNER_ID } from '@/lib/lab/full-planner-values';
import { PEEK_ID } from '@/lib/lab/peeking-values';
import { LAB_SECTIONS } from './lab';

export const DEMO_COPY = {
  title: 'Interview links',
  description: 'The links I open when I share my screen in an interview.',
  forcedTitle: 'The home page in each group',
  labTitle: 'Lab examples',
} as const;

/** The page's opening, under its heading. */
export function DemoIntro(): ReactNode {
  return (
    <p>
      I open these links when I share my screen in an interview. This page is not in the menu, and search engines
      are asked not to list it.
    </p>
  );
}

export type DemoLink = { href: string; label: string };
export type LabLink = DemoLink & { purpose: string };

/** One link per group, forced with the address the proxy already understands. */
export const FORCED_LINKS: readonly DemoLink[] = [
  { href: '/?variant=a', label: "Group A's home page" },
  { href: '/?variant=b', label: "Group B's home page" },
];

/** What the forced links open. */
export function ForcedLead(): ReactNode {
  return <p>Each link opens the home page as one group of the live test sees it.</p>;
}

/**
 * Which headlines the forced links show, by the configured phase: group A's in both groups until the
 * A/B starts (the calibration shows everyone the same page), each group's own once it has started.
 */
export function ForcedNote({ phase }: { phase: ExperimentPhase }): ReactNode {
  return phase === 'calibration' ? (
    <p>Until the A/B test starts, both groups see group A&apos;s headlines, so both links show the same headlines.</p>
  ) : (
    <p>Once the A/B test has started, each link shows its own group&apos;s headlines.</p>
  );
}

/** Why a forced view never counts, and that this page sends nothing. */
export function ForcedExclusion(): ReactNode {
  return (
    <p>
      Views opened through these links are never counted in the live test. The home page reports each one as a view
      whose group was chosen in the address, and the server leaves it out of the results. This page itself sends
      nothing to the live test.
    </p>
  );
}

type PlannerSettings = { baseline: number; risePoints: number; traffic: number };

/** The Lab address that opens the planner pair with these settings, at the planner's section. */
function plannerHref(s: PlannerSettings): string {
  const section = LAB_SECTIONS.find((entry) => entry.figure === FULL_PLANNER_ID);
  if (!section) throw new Error(`demo: the Lab has no section for the ${FULL_PLANNER_ID} Figure`);
  const search = new URLSearchParams([
    [`${FULL_PLANNER_ID}.baseline`, String(s.baseline)],
    [`${FULL_PLANNER_ID}.risePoints`, String(s.risePoints)],
    [`${DURATION_ID}.traffic`, String(s.traffic)],
  ]);
  return `/lab?${search.toString()}#${section.id}`;
}

/**
 * The planner link's settings: a small rise (one point) on a low baseline (five percent), and more
 * daily visitors than the default. The unit points stays the preset's, so the link does not set it.
 */
const PLANNER_SETTINGS: PlannerSettings = { baseline: 0.05, risePoints: 1, traffic: 1000 };
export const PLANNER_LINK: PlannerSettings & { href: string } = { ...PLANNER_SETTINGS, href: plannerHref(PLANNER_SETTINGS) };

/** The Lab links, each with one plain sentence on what it opens. */
export const LAB_LINKS: readonly LabLink[] = [
  {
    href: `/lab/peeking?${PEEK_ID}.preset=interview`,
    label: 'Peeking at results',
    purpose: 'The peeking example on its own page: what checking a running test every day does to its false positives.',
  },
  {
    href: PLANNER_LINK.href,
    label: 'Sample size for a small rise',
    purpose:
      "The Lab's sample-size planner and its duration, set to a small rise on a low baseline and more daily visitors than its default.",
  },
  {
    href: '/lab',
    label: 'All the examples in the Lab',
    purpose: 'The whole Lab: sample size, peeking, the split check and exaggeration.',
  },
];

/** What a visitor without JavaScript gets from the planner link. */
export function LabNote(): ReactNode {
  return (
    <p>
      The planner link&apos;s settings apply once the planner&apos;s controls load. Without JavaScript, the planner
      shows its default settings instead.
    </p>
  );
}
