import { parseFragment } from 'parse5';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ResetButton } from '@/components/kit/ResetButton';
import { Segmented } from '@/components/kit/Segmented';
import { Slider, type SliderProps } from '@/components/kit/Slider';

type Node = {
  nodeName: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: Node[];
};

const parse = (html: string) => parseFragment(html) as unknown as Node;
const text = (node: Node): string =>
  node.nodeName === '#text' ? (node.value ?? '') : (node.childNodes ?? []).map(text).join('');
const find = (node: Node, test: (n: Node) => boolean): Node[] =>
  (test(node) ? [node] : []).concat((node.childNodes ?? []).flatMap((c) => find(c, test)));
const attr = (n: Node, name: string) => n.attrs?.find((a) => a.name === name)?.value;
const hasAttr = (n: Node, name: string) => n.attrs?.some((a) => a.name === name) ?? false;
const byTag = (root: Node, tag: string) => find(root, (n) => n.nodeName === tag);
const input = (root: Node, type: string) => byTag(root, 'input').find((n) => attr(n, 'type') === type)!;
const labelFor = (root: Node, id: string) => byTag(root, 'label').find((n) => attr(n, 'for') === id);

const noop = () => {};
const looks = (overrides: Partial<SliderProps> = {}) =>
  parse(
    renderToStaticMarkup(
      <Slider
        id="looks"
        label="Looks"
        min={1}
        max={50}
        step={1}
        value={20}
        onChange={noop}
        valueText={(n) => `${n} looks`}
        refs={['simulated']}
        {...overrides}
      />,
    ),
  );

describe('Slider', () => {
  it('can show a visible readout with the unit beside the number input, inside the marker', () => {
    const root = looks({ min: 0.05, max: 0.5, step: 0.01, value: 0.1, readout: (v) => `${Math.round(v * 100)}%` });
    const readout = find(root, (n) => hasAttr(n, 'data-slider-readout'))[0]!;
    expect(text(readout)).toBe('10%');
    // It is inside the Slider root, whose data-derived covers it.
    const rootEl = find(root, (n) => hasAttr(n, 'data-slider'))[0]!;
    expect(find(rootEl, (n) => n === readout)).toHaveLength(1);
    expect(attr(rootEl, 'data-derived')).toBe('simulated');
    // No readout, no extra element.
    expect(find(looks(), (n) => hasAttr(n, 'data-slider-readout'))).toHaveLength(0);
  });

  it('is a native range input named by a visible label, with a spoken value', () => {
    const root = looks();
    const range = input(root, 'range');
    expect(attr(range, 'id')).toBe('looks');
    expect(attr(range, 'min')).toBe('1');
    expect(attr(range, 'max')).toBe('50');
    expect(attr(range, 'step')).toBe('1');
    expect(attr(range, 'value')).toBe('20');
    expect(attr(range, 'aria-valuetext')).toBe('20 looks');
    const label = labelFor(root, 'looks')!;
    expect(text(label)).toBe('Looks');
    expect(attr(label, 'class')).not.toContain('sr-only');
  });

  it('joins a number input with its own label and the same min, max and step', () => {
    const root = looks();
    const number = input(root, 'number');
    const id = attr(number, 'id')!;
    expect(id).not.toBe('looks');
    expect(text(labelFor(root, id)!)).toBe('Looks, exact value');
    expect(attr(number, 'value')).toBe('20');
    expect(attr(number, 'min')).toBe('1');
    expect(attr(number, 'max')).toBe('50');
    expect(attr(number, 'step')).toBe('1');
    expect(attr(number, 'class')).toContain('border-muted');
    expect(attr(number, 'class')).toContain('rounded-md');
  });

  it('uses numberLabel as the number input name when given', () => {
    const root = looks({ numberLabel: 'Number of looks' });
    expect(text(labelFor(root, attr(input(root, 'number'), 'id')!)!)).toBe('Number of looks');
  });

  it('clamps and snaps a hostile value instead of throwing', () => {
    expect(attr(input(looks({ value: 999 }), 'range'), 'value')).toBe('50');
    expect(attr(input(looks({ value: -5 }), 'range'), 'value')).toBe('1');
    expect(attr(input(looks({ value: Number.NaN }), 'range'), 'value')).toBe('1');
    const snapped = looks({ value: 20.4 });
    expect(attr(input(snapped, 'range'), 'value')).toBe('20');
    expect(attr(input(snapped, 'range'), 'aria-valuetext')).toBe('20 looks');
    expect(attr(input(snapped, 'number'), 'value')).toBe('20');
  });

  it('has a 44 px hit area marked as a touch target and an accent active track', () => {
    const root = looks();
    const range = input(root, 'range');
    expect(attr(range, 'class')).toContain('min-h-(--size-target)');
    expect(attr(range, 'class')).toContain('appearance-none');
    expect(hasAttr(range, 'data-kit-range')).toBe(true);
    expect(find(root, (n) => hasAttr(n, 'data-touch-target') && byTag(n, 'input').includes(range))).toHaveLength(1);
    const fill = find(root, (n) => hasAttr(n, 'data-slider-fill'))[0]!;
    expect(attr(fill, 'class')).toContain('bg-accent');
    const track = find(root, (n) => hasAttr(n, 'data-slider-track'))[0]!;
    expect(attr(track, 'aria-hidden')).toBe('true');
    expect(attr(track, 'class')).toContain('border-muted');
    expect(attr(track, 'class')).toContain('bg-line');
  });

  it('is hidden without JavaScript', () => {
    expect(hasAttr(find(looks(), (n) => hasAttr(n, 'data-slider'))[0]!, 'data-js-only')).toBe(true);
  });

  it('marks its root with data-derived from the caller refs', () => {
    const root = find(looks({ refs: ['simulated', 'live'] }), (n) => hasAttr(n, 'data-slider'))[0]!;
    expect(attr(root, 'data-derived')).toBe('simulated live');
  });

  it('throws on empty refs, like every derived figure', () => {
    expect(() => looks({ refs: [] })).toThrow('a derived figure needs at least one ref');
  });

  it('passes the truth audit with its marker, and would fail without it', () => {
    const page = (body: string) => `<!DOCTYPE html><html lang="en"><head><title>Page</title></head><body>${body}</body></html>`;
    const ctx = { route: '/lab', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };
    const markup = renderToStaticMarkup(
      <Slider id="looks" label="Looks" min={1} max={50} step={1} value={20} onChange={noop} valueText={(n) => `${n} looks`} refs={['simulated']} />,
    );
    expect(auditHtml(page(markup), ctx)).toEqual([]);
    const unmarked = markup.replace(' data-derived="simulated"', '');
    expect(unmarked).not.toContain('data-derived');
    // The range input and the number input each hold the value too.
    expect(auditHtml(page(unmarked), ctx)).toEqual([
      { route: '/lab', kind: 'stray-number', detail: '"20" in aria-valuetext' },
      { route: '/lab', kind: 'stray-number', detail: '"20" in value' },
      { route: '/lab', kind: 'stray-number', detail: '"20" in value' },
    ]);
  });

  it('disables both inputs when disabled', () => {
    const root = looks({ disabled: true });
    expect(hasAttr(input(root, 'range'), 'disabled')).toBe(true);
    expect(hasAttr(input(root, 'number'), 'disabled')).toBe(true);
  });
});

const FIX = [
  { value: 'none', label: 'None' },
  { value: 'obf', label: "O'Brien-Fleming" },
  { value: 'cs', label: 'Confidence sequence' },
] as const;

const fix = (value: (typeof FIX)[number]['value'], disabled?: boolean) =>
  parse(
    renderToStaticMarkup(
      <Segmented name="fix" legend="Fix" options={FIX} value={value} onChange={noop} disabled={disabled} />,
    ),
  );

describe('Segmented', () => {
  it('is a fieldset with a visible legend and one checked native radio', () => {
    const root = fix('obf');
    const [fieldset] = byTag(root, 'fieldset');
    expect(fieldset).toBeDefined();
    const [legend] = byTag(fieldset!, 'legend');
    expect(text(legend!)).toBe('Fix');
    expect(attr(legend!, 'class')).toContain('text-sm');
    expect(attr(legend!, 'class')).toContain('text-muted');
    const radios = byTag(root, 'input').filter((n) => attr(n, 'type') === 'radio');
    expect(radios.map((r) => attr(r, 'value'))).toEqual(['none', 'obf', 'cs']);
    expect(radios.every((r) => attr(r, 'name') === 'fix')).toBe(true);
    expect(radios.filter((r) => hasAttr(r, 'checked')).map((r) => attr(r, 'value'))).toEqual(['obf']);
  });

  it('wraps each radio in a 44 px label that never breaks a word', () => {
    const labels = byTag(fix('none'), 'label');
    expect(labels.map(text)).toEqual(['None', "O'Brien-Fleming", 'Confidence sequence']);
    for (const label of labels) {
      expect(hasAttr(label, 'data-touch-target')).toBe(true);
      expect(attr(label, 'class')).toContain('min-h-(--size-target)');
      expect(attr(label, 'class')).toContain('whitespace-nowrap');
      // The radio is invisible but fills its option, so keyboard focus scrolls the whole option (and its ring) into view.
      const radioClass = attr(byTag(label, 'input')[0]!, 'class') ?? '';
      expect(radioClass).toContain('opacity-0');
      expect(radioClass).toContain('absolute');
      expect(radioClass).toContain('inset-0');
      expect(radioClass).not.toContain('sr-only');
    }
  });

  it('fills only the selected segment in ink', () => {
    const labels = byTag(fix('cs'), 'label');
    expect(labels.map((l) => attr(l, 'class')!.includes('bg-ink text-bg'))).toEqual([false, false, true]);
  });

  it('stacks under xs, never hides overflow, and is hidden without JavaScript', () => {
    const html = renderToStaticMarkup(
      <Segmented name="fix" legend="Fix" options={FIX} value="none" onChange={noop} />,
    );
    // Stacked by default, one joined row from xs up.
    expect(html).toContain('flex flex-col gap-2 xs:inline-flex xs:flex-row xs:gap-0');
    expect(html).not.toMatch(/overflow-(hidden|clip)/);
    expect(hasAttr(byTag(parse(html), 'fieldset')[0]!, 'data-js-only')).toBe(true);
  });

  it('is exactly one touch target tall (44 px): no padding or border round the options', () => {
    const root = parse(renderToStaticMarkup(<Segmented name="fix" legend="Fix" options={FIX} value="none" onChange={noop} />));
    const group = byTag(root, 'fieldset')[0]!.childNodes!.find((n) => n.nodeName === 'div')!;
    expect(attr(group, 'class')).not.toMatch(/(^|\s)(p|px|py)-\d|(^|\s)border(\s|$)/);
    for (const label of byTag(root, 'label')) expect(attr(label, 'class')).toContain('min-h-(--size-target)');
  });

  it('gives a stacked option a radio mark: an empty ring, a dot when chosen, hidden from xs up', () => {
    const root = parse(renderToStaticMarkup(<Segmented name="fix" legend="Fix" options={FIX} value="none" onChange={noop} />));
    const labels = byTag(root, 'label');
    const marks = labels.map((l) => byTag(l, 'span').find((sp) => attr(sp, 'aria-hidden') === 'true')!);
    for (const mark of marks) {
      expect(attr(mark, 'class')).toContain('rounded-full');
      expect(attr(mark, 'class')).toContain('xs:hidden');
    }
    expect(byTag(marks[0]!, 'span')).toHaveLength(2); // the ring and its dot
    expect(byTag(marks[1]!, 'span')).toHaveLength(1); // the empty ring
    for (const label of labels) expect(attr(label, 'class')).toContain('max-xs:w-full');
  });

  it('falls back to the first option when the value is not one of the options', () => {
    const root = parse(
      renderToStaticMarkup(
        <Segmented name="fix" legend="Fix" options={FIX} value={'bogus' as 'none'} onChange={noop} />,
      ),
    );
    const checked = byTag(root, 'input').filter((r) => hasAttr(r, 'checked'));
    expect(checked.map((r) => attr(r, 'value'))).toEqual(['none']);
  });

  it('disables the whole group when disabled', () => {
    expect(hasAttr(byTag(fix('none', true), 'fieldset')[0]!, 'disabled')).toBe(true);
  });
});

describe('ResetButton', () => {
  it('is a 44 px secondary button that says Reset', () => {
    const root = parse(renderToStaticMarkup(<ResetButton onReset={noop} />));
    const [button] = byTag(root, 'button');
    expect(attr(button!, 'type')).toBe('button');
    expect(text(button!)).toBe('Reset');
    expect(hasAttr(button!, 'data-touch-target')).toBe(true);
    expect(hasAttr(button!, 'data-js-only')).toBe(true);
    expect(attr(button!, 'class')).toContain('min-h-(--size-target)');
    expect(attr(button!, 'class')).toContain('border-muted');
  });
});
