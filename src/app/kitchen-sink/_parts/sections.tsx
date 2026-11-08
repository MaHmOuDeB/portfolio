// The kitchen sink is this list. Each entry becomes an h2 section on /kitchen-sink; a later task
// adds its section by appending one entry here. Every number in a specimen goes through Fact or
// carries data-derived with the ref 'simulated'.
import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { Icon, type IconName } from '@/components/kit/Icon';
import { IntervalGlyph } from '@/components/kit/IntervalGlyph';
import { TextLink } from '@/components/kit/TextLink';
import { ChartFrameSection } from './chartframe';
import { ControlsSection } from './controls';
import { FactsSection } from './facts';
import { FiguresSection } from './figures';
import { Specimen } from './Specimen';
import { StaticSection } from './static';
import { StepNavSection } from './stepnav';
import { UrlStateSection } from './url-state';

export type SinkSection = {
  /** Kebab-case, unique: the section's anchor and `data-section`. */
  id: string;
  title: string;
  render: () => ReactNode;
};

const ICON_LABELS: Record<IconName, string> = {
  mail: 'Mail',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  download: 'Download',
  external: 'External link',
  menu: 'Menu',
};

const row = 'flex flex-wrap items-center gap-x-6 gap-y-3';

export const SECTIONS: readonly SinkSection[] = [
  {
    id: 'glyph',
    title: 'Interval glyph',
    render: () => (
      <>
        <Specimen id="glyph--inline" title="Inline" note="Sits in a line of text. Decorative, so hidden from screen readers.">
          <p className="text-base">
            The estimate was inside its interval{' '}
            <span className="inline-block align-middle">
              <IntervalGlyph size="inline" />
            </span>{' '}
            in this fictional run.
          </p>
        </Specimen>
        <Specimen id="glyph--large" title="Large" note="The same mark, scaled up for a result line.">
          <IntervalGlyph size="large" />
        </Specimen>
        <Specimen
          id="glyph--hollow"
          title="Hollow"
          note="The grey form used while a test is collecting and has no estimate yet."
        >
          <div className={row}>
            <IntervalGlyph size="inline" variant="hollow" />
            <IntervalGlyph size="large" variant="hollow" />
          </div>
        </Specimen>
        <Specimen
          id="glyph--labelled"
          title="Labelled"
          note="Given a label, the glyph becomes an image with that name."
        >
          <IntervalGlyph size="large" label="Fictional estimate with its interval" />
        </Specimen>
      </>
    ),
  },
  {
    id: 'icons',
    title: 'Icons',
    render: () => (
      <Specimen
        id="icons--all"
        title="All six"
        note="One outline set in the current text colour. Always decorative: the label beside it names the action."
      >
        <ul className="grid grid-cols-2 gap-4 xs:grid-cols-3">
          {(Object.keys(ICON_LABELS) as IconName[]).map((name) => (
            <li key={name} className="flex flex-wrap items-center gap-2 text-sm wrap-anywhere">
              <Icon name={name} />
              {ICON_LABELS[name]}
            </li>
          ))}
        </ul>
      </Specimen>
    ),
  },
  {
    id: 'links',
    title: 'Links',
    render: () => (
      <>
        <Specimen
          id="links--button"
          title="Button links"
          note="Primary and secondary, with and without an icon. Hover changes colour only."
        >
          <div className={row}>
            <ButtonLink href="/" variant="primary">
              Primary link
            </ButtonLink>
            <ButtonLink href="/" variant="secondary">
              Secondary link
            </ButtonLink>
            <ButtonLink href="/kitchen-sink" variant="primary" icon="download">
              Primary with icon
            </ButtonLink>
            <ButtonLink href="/kitchen-sink" variant="secondary" icon="external">
              Secondary with icon
            </ButtonLink>
          </div>
        </Specimen>
        <Specimen
          id="links--text"
          title="Text links"
          note="Each standalone anchor is at least 44 by 44 CSS pixels. The links wrap onto additional rows as needed."
        >
          <div className={row}>
            <TextLink href="/" standalone>
              Home page
            </TextLink>
            <TextLink href="/" standalone>
              Standalone link
            </TextLink>
            <TextLink href="https://example.com" external standalone>
              External standalone link
            </TextLink>
            <TextLink href="mailto:hello@example.com" icon="mail" standalone>
              Standalone with icon
            </TextLink>
          </div>
        </Specimen>
      </>
    ),
  },
  {
    id: 'fact-and-stat',
    title: 'Fact and Stat',
    render: () => <FactsSection />,
  },
  {
    id: 'static-primitives',
    title: 'Static primitives',
    render: () => <StaticSection />,
  },
  {
    id: 'controls',
    title: 'Controls',
    render: () => <ControlsSection />,
  },
  {
    id: 'step-navigation',
    title: 'Step navigation',
    render: () => <StepNavSection />,
  },
  {
    id: 'url-state',
    title: 'URL state',
    render: () => <UrlStateSection />,
  },
  {
    id: 'chart-frame',
    title: 'Chart frame',
    render: () => <ChartFrameSection />,
  },
  {
    id: 'figures',
    title: 'Figures',
    render: () => <FiguresSection />,
  },
];
