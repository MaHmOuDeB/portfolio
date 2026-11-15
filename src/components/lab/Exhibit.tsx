// One exhibit of the Lab in the reading model: the sentence above the Figure ("Try this"), the
// Figure on its white sheet, the sentence below it ("What I do about it") and the method row, one
// click deeper. The two labels are the Lab's own; other pages keep the frame's defaults. A Figure's view renders it, so the server's preset and the island draw the same markup and
// the method row always describes the setting on screen. Shared and hook-free.
//
// On a phone the control rows of a Figure fill a screen, so the point comes before them: the view
// passes PhonePoint as the Figure's `lead`, shown under 640 px, and the sentence below the sheet is
// shown from 640 px. Only one of the two is ever displayed.
import type { ReactNode } from 'react';
import { FigureSheet, LeadIn, MethodDetails, Takeaway } from '@/components/frame';

/** The Lab's labels for the sentence above an exhibit and the one below it. */
export const LAB_LEAD_IN_LABEL = 'Try this';
export const LAB_TAKEAWAY_LABEL = 'What I do about it';

export type ExhibitProps = {
  leadIn: ReactNode;
  takeaway: ReactNode;
  /** The method row's summary: names this Figure, so no two rows on the page read the same. */
  summary: string;
  /** The method row's content: block children. */
  method: ReactNode;
  /** The Figure. */
  children: ReactNode;
};

export function Exhibit({ leadIn, takeaway, summary, method, children }: ExhibitProps) {
  return (
    <div data-lab-exhibit="">
      <LeadIn label={LAB_LEAD_IN_LABEL}>{leadIn}</LeadIn>
      <FigureSheet>{children}</FigureSheet>
      <div data-lab-point="wide" className="max-sm:hidden">
        <Takeaway label={LAB_TAKEAWAY_LABEL}>{takeaway}</Takeaway>
      </div>
      <MethodDetails summary={summary}>{method}</MethodDetails>
    </div>
  );
}

/** The takeaway as a Figure's `lead`: before the controls, on a phone only. */
export function PhonePoint({ children }: { children: ReactNode }) {
  return (
    <div data-lab-point="phone" className="sm:hidden">
      <Takeaway label={LAB_TAKEAWAY_LABEL}>{children}</Takeaway>
    </div>
  );
}
