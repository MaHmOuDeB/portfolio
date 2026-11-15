// The white card around a figure, a table, a diagram or a screenshot on an inner page. The Figure kit
// is frozen, so the frame draws the card: under 640 px it runs edge to edge over the frame's rails, so
// a chart keeps the full column's width for its axis labels; from 640 px it is a hairline card with
// the card radius. An optional small label ("Screenshot") says what the sheet holds. It never clips, so a control's focus ring inside it is whole.
import type { ReactNode } from 'react';

export type FigureSheetProps = {
  label?: ReactNode;
  children: ReactNode;
};

export function FigureSheet({ label, children }: FigureSheetProps) {
  return (
    <div data-figure-sheet="">
      {label ? <p data-figure-sheet-label="">{label}</p> : null}
      {children}
    </div>
  );
}
