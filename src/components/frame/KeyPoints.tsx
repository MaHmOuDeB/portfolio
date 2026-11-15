// What a reader with two minutes must take away: a labelled list of three or four statement cards
// (white hairline cards; one column on a phone, two from sm, as many columns as items from lg). A
// card is a small kicker, a title and a body, all optional but the body. They are statements, not
// sections, so none is a heading. A figure comes in as a <Fact> or a Derived from the caller.
import type { ReactNode } from 'react';

export type KeyPoint = {
  id: string;
  /** A small word above the title, such as "Result". */
  kicker?: ReactNode;
  /** The statement's short form, or its figure. Inline content. */
  title?: ReactNode;
  /** One or two short sentences. Inline content. */
  body: ReactNode;
};

export type KeyPointsProps = {
  items: readonly KeyPoint[];
  /** The list's accessible name. */
  label?: string;
};

export function KeyPoints({ items, label = 'Key points' }: KeyPointsProps) {
  return (
    // role="list": WebKit drops the list role from a list drawn without bullets.
    <ul role="list" data-key-points="" data-count={items.length} aria-label={label}>
      {items.map((item) => (
        <li key={item.id} data-key-point="">
          {item.kicker ? <p data-key-kicker="">{item.kicker}</p> : null}
          {item.title ? <p data-key-title="">{item.title}</p> : null}
          <p data-key-body="" data-lead={item.title ? undefined : ''}>
            {item.body}
          </p>
        </li>
      ))}
    </ul>
  );
}
