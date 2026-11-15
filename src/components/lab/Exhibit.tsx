// One exhibit of the Lab in the reading model: the sentence above the Figure (what to look at), the
// Figure on its white sheet, the sentence below it (what it means) and the method row, one click
// deeper. A Figure's view renders it, so the server's preset and the island draw the same markup and
// the method row always describes the setting on screen. Shared and hook-free.
//
// On a phone the control rows of a Figure fill a screen, so the point comes before them: the view
// passes PhonePoint as the Figure's `lead`, shown under 640 px, and the sentence below the sheet is
// shown from 640 px. Only one of the two is ever displayed.
import type { ReactNode } from 'react';
import { FigureSheet, LeadIn, MethodDetails, Takeaway } from '@/components/frame';

export type ExhibitProps = {
  leadIn: ReactNode;
  takeaway: ReactNode;
  /** The method row's content: block children. */
  method: ReactNode;
  /** The Figure. */
  children: ReactNode;
};

export function Exhibit({ leadIn, takeaway, method, children }: ExhibitProps) {
  return (
    <div data-lab-exhibit="">
      <LeadIn>{leadIn}</LeadIn>
      <FigureSheet>{children}</FigureSheet>
      <div data-lab-point="wide" className="max-sm:hidden">
        <Takeaway>{takeaway}</Takeaway>
      </div>
      <MethodDetails>{method}</MethodDetails>
    </div>
  );
}

/** The takeaway as a Figure's `lead`: before the controls, on a phone only. */
export function PhonePoint({ children }: { children: ReactNode }) {
  return (
    <div data-lab-point="phone" className="sm:hidden">
      <Takeaway>{children}</Takeaway>
    </div>
  );
}
