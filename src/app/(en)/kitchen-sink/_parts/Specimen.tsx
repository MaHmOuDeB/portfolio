// One labelled example on the kitchen sink. `id` is kebab-case and unique across the page
// ('glyph--inline'); the Playwright specs and the visual baselines select a specimen by it.
import type { ReactNode } from 'react';

type Props = {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
};

export function Specimen({ id, title, note, children }: Props) {
  const headingId = `specimen-${id}`;
  return (
    <section data-specimen={id} aria-labelledby={headingId} className="border-t border-line py-6">
      <h3 id={headingId} className="text-lg font-semibold">
        {title}
      </h3>
      {note ? <p className="mt-1 max-w-text text-sm text-muted">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
