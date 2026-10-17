import { parseFragment } from 'parse5';
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
        {...overrides}
      />,
    ),
  );

describe('Slider', () => {
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
      expect(attr(byTag(label, 'input')[0]!, 'class')).toContain('sr-only');
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
    expect(html).toContain('max-xs:flex-col');
    expect(html).not.toMatch(/overflow-(hidden|clip)/);
    expect(hasAttr(byTag(parse(html), 'fieldset')[0]!, 'data-js-only')).toBe(true);
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
