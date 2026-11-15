// The in-page links of a long page: a navigation landmark with a compact row of chips. Each link is a
// 44 px target around a smaller chip, with no underline; the row wraps and never scrolls sideways.
// Link only to headings that are visible, never to one inside a closed details row.
import type { ReactNode } from 'react';
import { FrameLink } from './FrameLink';

export type SectionNavItem = { href: string; label: ReactNode };

export type SectionNavProps = {
  items: readonly SectionNavItem[];
  /** The landmark's accessible name. */
  label?: string;
};

export function SectionNav({ items, label = 'On this page' }: SectionNavProps) {
  return (
    <nav aria-label={label} data-section-nav="">
      {/* role="list": WebKit drops the list role from a list drawn without bullets. */}
      <ul role="list">
        {items.map((item, i) => (
          <li key={i}>
            <FrameLink href={item.href} data-touch-target="">
              <span>{item.label}</span>
            </FrameLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
