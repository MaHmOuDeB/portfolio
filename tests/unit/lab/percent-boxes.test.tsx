// The number boxes beside the share sliders take whole percents, as every label and readout says:
// the planner's baseline (on the Lab and the Retention page) and the exaggeration Figure's power.
// Typing "30" means 30%, never a share of 0.30 that a reader would have to type as "0.3". The URL
// and the views still hold a proportion, so the controls divide what the Slider reports by 100.
//
// There is no DOM here: the controls are called as functions and their Slider elements read. A
// typed entry reaches the caller as the Slider's onChange and onCommit with the snapped number, so
// calling those with 30 is what typing "30" and pressing Enter does.
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Slider, type SliderProps } from '@/components/kit/Slider';
import { CurseControls, InertCurseControls } from '@/components/lab/CurseFigureClient';
import { InertLabPlannerControls, InertSizingControls, LabPlannerControls, SizingControls } from '@/components/lab/FullPlannerControls';
import { snapToStep } from '@/lib/figure/snap';
import { CURSE_PRESETS, CURSE_SCHEMA } from '@/lib/lab/diagnostics-values';
import { FULL_PLAN_PRESETS, FULL_PLAN_SCHEMA, LAB_PLAN_PRESETS } from '@/lib/lab/full-planner-values';

const noop = () => {};

/** Every Slider element in a tree of plain elements (the controls render no other components with children). */
function sliders(node: ReactNode): ReactElement<SliderProps>[] {
  if (Array.isArray(node)) return node.flatMap(sliders);
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (el.type === Slider) return [node as ReactElement<SliderProps>];
  return sliders(el.props.children);
}
const slider = (node: ReactNode, id: string) => {
  const found = sliders(node).find((s) => s.props.id === id);
  expect(found, id).toBeDefined();
  return found!.props;
};
/** What a typed entry reports: the Slider snaps it to its own grid first. */
const typed = (p: SliderProps, entry: number) => snapToStep(entry, p.min, p.max, p.step);

describe('the Lab planner: the sign-up rate box takes whole percents', () => {
  const calls: [string, number][] = [];
  const el = LabPlannerControls({
    id: 'planner',
    values: LAB_PLAN_PRESETS.default,
    onBaseline: (v) => calls.push(['change', v]),
    onBaselineCommit: (v) => calls.push(['commit', v]),
    onRise: noop,
    onRiseCommit: noop,
    onTraffic: noop,
    onTrafficCommit: noop,
    onReset: noop,
  });
  const box = slider(el, 'planner-baseline');

  it('shows the preset as 29, from 1 to 98 in steps of 1, and names its unit', () => {
    expect({ value: box.value, min: box.min, max: box.max, step: box.step }).toEqual({ value: 29, min: 1, max: 98, step: 1 });
    expect(box.numberLabel).toBe('Sign-up rate today, percent');
    expect(box.readout?.(29)).toBe('29% of visitors');
    expect(box.valueText(29)).toBe('29% of visitors');
  });

  it('typing 30 sets a baseline of 0.30, on change and on commit', () => {
    calls.length = 0;
    box.onChange(typed(box, 30));
    box.onCommit?.(typed(box, 30));
    expect(calls).toEqual([
      ['change', 0.3],
      ['commit', 0.3],
    ]);
  });

  it('every whole percent maps back to the proportion on the schema grid', () => {
    const s = FULL_PLAN_SCHEMA.baseline;
    for (let p = box.min; p <= box.max; p += box.step) {
      calls.length = 0;
      box.onChange(p);
      expect(calls[0]![1]).toBe(snapToStep(p / 100, s.min, s.max, s.step));
    }
  });

  it('the server draws the box with 29 in it', () => {
    const html = renderToStaticMarkup(<InertLabPlannerControls id="planner" values={LAB_PLAN_PRESETS.default} />);
    expect(html).toMatch(/id="planner-baseline-exact"[^>]*min="1"[^>]*max="98"[^>]*step="1"[^>]*value="29"/);
    expect(html).toContain('>Sign-up rate today, percent<');
  });
});

describe('the Retention planner: the baseline box takes whole percents too', () => {
  const calls: [string, number][] = [];
  const el = SizingControls({
    id: 'winback',
    context: 'retention',
    values: FULL_PLAN_PRESETS.default,
    onBaseline: (v) => calls.push(['change', v]),
    onBaselineCommit: (v) => calls.push(['commit', v]),
    onRise: noop,
    onRiseCommit: noop,
    onMode: noop,
    onReset: noop,
  });
  const box = slider(el, 'winback-baseline');

  it('shows 29 from 1 to 98, says percent, and typing 30 sets 0.30', () => {
    expect({ value: box.value, min: box.min, max: box.max, step: box.step }).toEqual({ value: 29, min: 1, max: 98, step: 1 });
    expect(box.numberLabel).toBe('Baseline conversion, percent');
    expect(box.readout?.(29)).toBe('29%');
    expect(box.valueText(29)).toBe('29% baseline conversion');
    box.onChange(typed(box, 30));
    box.onCommit?.(typed(box, 30));
    expect(calls).toEqual([
      ['change', 0.3],
      ['commit', 0.3],
    ]);
    const html = renderToStaticMarkup(<InertSizingControls id="winback" context="retention" values={FULL_PLAN_PRESETS.default} />);
    expect(html).toMatch(/id="winback-baseline-exact"[^>]*value="29"/);
  });
});

describe('the exaggeration Figure: the power box takes whole percents', () => {
  const calls: [string, string, number][] = [];
  const el = CurseControls({
    values: CURSE_PRESETS.default,
    onChange: (k, v) => calls.push(['change', k, v]),
    onCommit: (k, v) => calls.push(['commit', k, v]),
    onReset: noop,
  });
  const box = slider(el, 'curse-power');

  it('shows the preset as 17, from 10 to 99 in steps of 1, and names its unit', () => {
    expect({ value: box.value, min: box.min, max: box.max, step: box.step }).toEqual({ value: 17, min: 10, max: 99, step: 1 });
    expect(box.numberLabel).toBe('How often the test clears the bar, percent');
    expect(box.readout?.(17)).toBe('17% of the time');
    expect(box.valueText(17)).toBe('17% of the time');
  });

  it('typing 50 sets a power of 0.50, on change and on commit', () => {
    calls.length = 0;
    box.onChange(typed(box, 50));
    box.onCommit?.(typed(box, 50));
    expect(calls).toEqual([
      ['change', 'power', 0.5],
      ['commit', 'power', 0.5],
    ]);
  });

  it('every whole percent maps back to the proportion on the schema grid', () => {
    const s = CURSE_SCHEMA.power;
    for (let p = box.min; p <= box.max; p += box.step) {
      calls.length = 0;
      box.onChange(p);
      expect(calls[0]![2]).toBe(snapToStep(p / 100, s.min, s.max, s.step));
    }
  });

  it('the server draws the box with 17 in it', () => {
    const html = renderToStaticMarkup(<InertCurseControls values={CURSE_PRESETS.default} />);
    expect(html).toMatch(/id="curse-power-exact"[^>]*min="10"[^>]*max="99"[^>]*step="1"[^>]*value="17"/);
  });
});
