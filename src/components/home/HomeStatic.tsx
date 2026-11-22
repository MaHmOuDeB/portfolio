// The Home page outside the experiment (the German Home), in the same order as HomeBody: the live bar
// with a fixed note, the hero with the stack band, the experience band, the proof row, the automation
// track, the cards (one fixed headline each, never watched) and the call to action. It takes no Home
// model and renders no beacon, phase line or group: a page here is never assigned, counted or analysed.
// Server only.
import { AutomationTrack } from './AutomationTrack';
import { ExperienceBand } from './ExperienceBand';
import { ExperimentsTrack } from './ExperimentsTrack';
import { Hero } from './Hero';
import { HomeCallToAction } from './HomeCallToAction';
import { LiveBar } from './LiveBar';
import { ProofRow } from './ProofRow';
import { StaticNote } from './StaticNote';
import type { Locale } from '@/lib/i18n/locale';

export function HomeStatic({ locale }: { locale: Locale }) {
  return (
    <>
      <LiveBar note={<StaticNote locale={locale} />} locale={locale} />
      <Hero locale={locale} />
      <ExperienceBand locale={locale} />
      <ProofRow locale={locale} />
      <AutomationTrack locale={locale} />
      <ExperimentsTrack headlineArm="a" locale={locale} />
      <HomeCallToAction locale={locale} />
    </>
  );
}
