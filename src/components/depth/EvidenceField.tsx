// The hero's evidence field: a confidence band on a ground plane, drawn with CSS 3D. Decorative, so
// it is hidden from assistive technology. The rows come from fieldRows(); the motion lives in CSS,
// keyed on the data attributes. No SVG and no text beyond the three axis words.
import type { CSSProperties } from 'react';
import { fieldRows } from '@/lib/depth/field';

const px = (v: number) => `${v.toFixed(1)}px`;

export function EvidenceField() {
  return (
    <div data-depth-field="" aria-hidden="true">
      <div data-depth-tilt="">
        <div data-depth-plane="">
          <span data-depth-zero="" />
          <div data-depth-axis="">
            <span>B lower</span>
            <span>no difference</span>
            <span>B higher</span>
          </div>
          {fieldRows().map((r) => (
            <span
              key={r.i}
              data-depth-row=""
              style={{ '--i': r.i, top: px(r.top), width: px(r.width), marginLeft: px(r.shift), '--e': '50%' } as CSSProperties}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
