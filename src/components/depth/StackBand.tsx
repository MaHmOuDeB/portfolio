// The Home band: a framed stage under the hero with three sheets (a test, the agents that check the
// work, the recommendation) and two links between them. Decorative, so the stack is hidden from
// assistive technology; the visible caption under it says what it shows (how I work). No digits. The
// motion lives in globals.css, keyed on the data attributes: the sheets arrive once on load; on a
// wide screen the stack rests in an isometric pose and leans to a fine pointer (Lean writes --mx and
// --my on [data-depth-stack]); with scroll timelines, a tall enough screen and motion allowed the band
// pins and the stack unfolds into a row; below lg the sheets are a static column. Server-safe.
import type { CSSProperties } from 'react';
import { HOME_BAND } from '../../../content/home.ts';
import { IntervalMark, MiniRow, Tag, Tick } from '@/components/frame/marks';

const order = (n: number) => ({ '--n': n }) as CSSProperties;

/** Where the two groups' intervals sit on the test sheet (percent of the track). */
const MARKS = [
  { left: 10, width: 46, dot: 32 },
  { left: 38, width: 44, dot: 61 },
] as const;

function Head({ title, note }: { title: string; note: string }) {
  return (
    <div data-depth-sheet-head="">
      <b>{title}</b>
      <span>{note}</span>
    </div>
  );
}

export function StackBand() {
  const { test, agents, recommendation, caption } = HOME_BAND;
  return (
    <div data-depth-band="">
      <div data-depth-pin="">
        <div data-depth-stack="" aria-hidden="true">
          <div data-depth-tilt="">
            <div data-depth-rig="">
              <div data-depth-sheet="1">
                <span data-depth-arrive="" style={order(2)}>
                  <Head title={test.title} note={test.note} />
                  <div data-depth-table="" data-depth-close="">
                    {test.rows.map((r, i) => (
                      <MiniRow key={r.label} label={r.label} tag={<Tag tone={i === 0 ? 'plain' : 'tint'}>{r.tag}</Tag>}>
                        <IntervalMark {...MARKS[i]!} />
                      </MiniRow>
                    ))}
                  </div>
                  <div data-depth-foot="">
                    {test.foot.map((f) => (
                      <span key={f}>{f}</span>
                    ))}
                  </div>
                </span>
              </div>
              <div data-depth-sheet="2">
                <span data-depth-arrive="" style={order(1)}>
                  <Head title={agents.title} note={agents.note} />
                  <ul data-depth-log="">
                    {agents.steps.map((s) => (
                      <li key={s.step}>
                        <Tick />
                        {s.step}
                        <em>{s.note}</em>
                      </li>
                    ))}
                  </ul>
                </span>
              </div>
              <div data-depth-sheet="3">
                {/* A soft light under the content that follows a fine pointer across the ink. */}
                <span data-depth-glow="" />
                <span data-depth-arrive="" style={order(0)}>
                  <Head title={recommendation.title} note={recommendation.note} />
                  <p data-depth-verdict="">{recommendation.verdict}</p>
                  <p data-depth-why="">{recommendation.why}</p>
                  <span data-depth-toast="">{recommendation.toast}</span>
                </span>
              </div>
              <span data-depth-link="1" />
              <span data-depth-link="2" />
            </div>
          </div>
        </div>
        <p data-depth-caption="">{caption}</p>
      </div>
    </div>
  );
}
