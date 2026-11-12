// The kit's form fields, rendered to static HTML: the server markup a visitor without JavaScript
// gets. The live counter and the pending button are exercised in tests/e2e/kit-form.spec.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFragment } from 'parse5';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import { CharacterCount } from '@/components/kit/CharacterCount';
import { Field, fieldControlClass } from '@/components/kit/Field';
import { SelectField } from '@/components/kit/SelectField';
import { SubmitButton } from '@/components/kit/SubmitButton';
import { TextArea } from '@/components/kit/TextArea';
import { TextField } from '@/components/kit/TextField';
import { countState, shouldAnnounce } from '@/lib/form/count';

type Node = { nodeName: string; value?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: Node[] };
const parse = (html: string) => parseFragment(html) as unknown as Node;
const text = (node: Node): string => (node.nodeName === '#text' ? (node.value ?? '') : (node.childNodes ?? []).map(text).join(''));
const find = (node: Node, test: (n: Node) => boolean): Node[] =>
  (test(node) ? [node] : []).concat((node.childNodes ?? []).flatMap((c) => find(c, test)));
const attr = (n: Node, name: string) => n.attrs?.find((a) => a.name === name)?.value;
const hasAttr = (n: Node, name: string) => n.attrs?.some((a) => a.name === name) ?? false;
const byTag = (root: Node, tag: string) => find(root, (n) => n.nodeName === tag);
const byId = (root: Node, id: string) => find(root, (n) => attr(n, 'id') === id)[0];
const classes = (n: Node | undefined) => (attr(n!, 'class') ?? '').split(/\s+/);
const render = (el: React.ReactElement) => {
  const html = renderToStaticMarkup(el);
  return { html, root: parse(html) };
};
const audit = (html: string) =>
  auditHtml(html, { route: '/kitchen-sink', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] });

describe('TextField', () => {
  it('labels the control, is required, and has no placeholder or colon', () => {
    const { root } = render(<TextField id="name" name="name" label="Name" autoComplete="name" maxLength={100} />);
    const input = byTag(root, 'input')[0]!;
    expect(attr(input, 'id')).toBe('name');
    expect(attr(input, 'name')).toBe('name');
    expect(attr(input, 'type')).toBe('text');
    expect(hasAttr(input, 'required')).toBe(true);
    expect(attr(input, 'maxlength')).toBe('100');
    expect(attr(input, 'autocomplete')).toBe('name');
    expect(hasAttr(input, 'placeholder')).toBe(false);
    expect(hasAttr(input, 'aria-invalid')).toBe(false);
    expect(hasAttr(input, 'aria-describedby')).toBe(false);
    const label = byTag(root, 'label')[0]!;
    expect(attr(label, 'for')).toBe('name');
    expect(text(label)).toBe('Name');
    expect(classes(label)).toEqual(expect.arrayContaining(['text-sm', 'font-medium', 'text-ink']));
  });

  it('draws the control box from tokens: muted border, ink on hover, 44 px, 18 px text, no shadow', () => {
    const { root } = render(<TextField id="name" name="name" label="Name" />);
    const c = classes(byTag(root, 'input')[0]);
    for (const cls of ['block', 'w-full', 'min-h-(--size-target)', 'rounded-md', 'border', 'border-muted', 'bg-bg', 'px-3', 'py-2', 'text-base', 'text-ink', 'hover:border-ink', 'aria-invalid:border-warn']) {
      expect(c, cls).toContain(cls);
    }
    expect(c.join(' ')).not.toMatch(/shadow|ring-|outline|focus:border/);
    expect(fieldControlClass).toContain('disabled:border-line');
  });

  it('ties the hint and the error to the control in order, and marks it invalid only with an error', () => {
    const { root } = render(<TextField id="email" name="email" type="email" label="E-mail address" hint="I reply to this address." error="Enter your e-mail address, so I can reply" />);
    const input = byTag(root, 'input')[0]!;
    expect(attr(input, 'aria-describedby')).toBe('email-hint email-error');
    expect(attr(input, 'aria-invalid')).toBe('true');
    expect(text(byId(root, 'email-hint')!)).toBe('I reply to this address.');
    const error = byId(root, 'email-error')!;
    expect(text(error)).toBe('Error: Enter your e-mail address, so I can reply');
    // The prefix is read, not seen; the alert icon beside it is decorative.
    expect(text(find(error, (n) => classes(n).includes('sr-only'))[0]!)).toBe('Error: ');
    expect(attr(byTag(error, 'svg')[0]!, 'aria-hidden')).toBe('true');
    expect(classes(error)).toEqual(expect.arrayContaining(['text-sm', 'font-medium', 'text-warn']));
    // The error sits above the control (the GOV.UK order): label, hint, error, control.
    const order = find(root, (n) => ['label', 'p', 'input'].includes(n.nodeName)).map((n) => attr(n, 'id') ?? n.nodeName);
    expect(order).toEqual(['label', 'email-hint', 'email-error', 'email']);
    // The error state adds a rule at the left: a shape cue as well as a colour.
    const wrapper = find(root, (n) => hasAttr(n, 'data-field'))[0]!;
    expect(classes(wrapper)).toEqual(expect.arrayContaining(['border-l-2', 'border-warn', 'pl-4']));
    expect(classes(wrapper)).not.toContain('overflow-hidden');
  });

  it('is an e-mail field without spell check when asked, keeps its value, and can be disabled', () => {
    const { root } = render(<TextField id="email" name="email" type="email" label="E-mail address" autoComplete="email" spellCheck={false} defaultValue="Ada" disabled />);
    const input = byTag(root, 'input')[0]!;
    expect(attr(input, 'type')).toBe('email');
    expect(attr(input, 'spellcheck')).toBe('false');
    expect(attr(input, 'value')).toBe('Ada');
    expect(hasAttr(input, 'disabled')).toBe(true);
    expect(hasAttr(input, 'inputmode')).toBe(false);
  });
});

describe('TextArea and its counter', () => {
  const area = (props: Partial<React.ComponentProps<typeof TextArea>> = {}) =>
    render(<TextArea id="message" name="message" label="Message" limit={4000} refs={['build']} {...props} />);

  it('has eight rows, resizes vertically, and no native maxLength (a paste is never cut off)', () => {
    const { root } = area();
    const textarea = byTag(root, 'textarea')[0]!;
    expect(attr(textarea, 'rows')).toBe('8');
    expect(classes(textarea)).toContain('resize-y');
    expect(hasAttr(textarea, 'maxlength')).toBe(false);
    expect(hasAttr(textarea, 'required')).toBe(true);
  });

  it('server-renders "Up to <limit> characters" with the number marked, and describes the control with it', () => {
    const { root, html } = area({ hint: 'Plain text.', error: 'Enter your message' });
    const textarea = byTag(root, 'textarea')[0]!;
    expect(attr(textarea, 'aria-describedby')).toBe('message-hint message-error message-count');
    const count = byId(root, 'message-count')!;
    expect(count.nodeName).toBe('p');
    expect(text(count)).toBe('Up to 4,000 characters');
    const n = byTag(count, 'data')[0]!;
    expect(attr(n, 'data-derived')).toBe('build');
    expect(hasAttr(n, 'data-num')).toBe(true);
    expect(attr(n, 'value')).toBe('4000');
    expect(classes(count)).toEqual(expect.arrayContaining(['mt-2', 'text-sm', 'text-muted']));
    // The counter is described, not live; the one polite node beside it starts empty.
    expect(hasAttr(count, 'aria-live')).toBe(false);
    const live = find(root, (x) => attr(x, 'aria-live') === 'polite');
    expect(live).toHaveLength(1);
    expect(text(live[0]!)).toBe('');
    expect(audit(html)).toEqual([]);
  });

  it('keeps a value it was given', () => {
    const { root } = area({ defaultValue: 'Hello there' });
    expect(text(byTag(root, 'textarea')[0]!)).toBe('Hello there');
  });

  it('CharacterCount takes its refs from the caller', () => {
    const { root } = render(<CharacterCount id="m-count" controlId="m" limit={200} refs={['simulated']} />);
    expect(attr(byTag(root, 'data')[0]!, 'data-derived')).toBe('simulated');
  });
});

describe('the counter text', () => {
  it('counts down, says when none are left, and how many too many', () => {
    expect(countState(0, 4000)).toEqual({ kind: 'left', n: 4000 });
    expect(countState(588, 4000)).toEqual({ kind: 'left', n: 3412 });
    expect(countState(4000, 4000)).toEqual({ kind: 'none', n: 0 });
    expect(countState(4012, 4000)).toEqual({ kind: 'over', n: 12 });
  });

  it('announces only in the last 10% and over the limit', () => {
    expect(shouldAnnounce(0, 4000)).toBe(false);
    expect(shouldAnnounce(3600, 4000)).toBe(false);
    expect(shouldAnnounce(3601, 4000)).toBe(true);
    expect(shouldAnnounce(4000, 4000)).toBe(true);
    expect(shouldAnnounce(4500, 4000)).toBe(true);
  });
});

describe('SelectField', () => {
  const OPTIONS = [
    { value: 'job', label: 'Job opportunity' },
    { value: 'project', label: 'Question about a project' },
  ];

  it('is a native select with "Choose one" first, selected while empty, neither disabled nor hidden', () => {
    const { root } = render(<SelectField id="reason" name="reason" label="Why are you getting in touch?" options={OPTIONS} />);
    const select = byTag(root, 'select')[0]!;
    expect(hasAttr(select, 'required')).toBe(true);
    const options = byTag(select, 'option');
    expect(options.map(text)).toEqual(['Choose one', 'Job opportunity', 'Question about a project']);
    expect(attr(options[0]!, 'value')).toBe('');
    expect(hasAttr(options[0]!, 'selected')).toBe(true);
    expect(hasAttr(options[0]!, 'disabled')).toBe(false);
    expect(hasAttr(options[0]!, 'hidden')).toBe(false);
    expect(classes(select)).toEqual(expect.arrayContaining(['appearance-none', 'pr-11', 'rounded-md', 'border-muted']));
  });

  it('draws its chevron as a decorative, muted icon that never takes a click', () => {
    const { root } = render(<SelectField id="reason" name="reason" label="Reason" options={OPTIONS} />);
    const chevron = find(root, (n) => n.nodeName === 'span' && attr(n, 'aria-hidden') === 'true' && byTag(n, 'svg').length === 1)[0]!;
    expect(classes(chevron)).toEqual(expect.arrayContaining(['pointer-events-none', 'absolute', 'text-muted']));
  });

  it('keeps a chosen reason, shows an error, and can be disabled', () => {
    const { root } = render(<SelectField id="reason" name="reason" label="Reason" options={OPTIONS} defaultValue="project" error="Choose why you are getting in touch" disabled />);
    const select = byTag(root, 'select')[0]!;
    const chosen = byTag(select, 'option').find((o) => hasAttr(o, 'selected'))!;
    expect(attr(chosen, 'value')).toBe('project');
    expect(attr(select, 'aria-invalid')).toBe('true');
    expect(attr(select, 'aria-describedby')).toBe('reason-error');
    expect(hasAttr(select, 'disabled')).toBe(true);
  });
});

describe('Field', () => {
  it('lists only the description parts that exist', () => {
    const { root } = render(
      <Field id="x" label="X" counterId="x-count">
        {(describedBy) => <input id="x" aria-describedby={describedBy} />}
      </Field>,
    );
    expect(attr(byTag(root, 'input')[0]!, 'aria-describedby')).toBe('x-count');
  });
});

describe('SubmitButton', () => {
  it('is a submit button drawn as the primary button, at least 44 px, with no icon', () => {
    const { root } = render(<SubmitButton>Send message</SubmitButton>);
    const button = byTag(root, 'button')[0]!;
    expect(attr(button, 'type')).toBe('submit');
    expect(hasAttr(button, 'data-touch-target')).toBe(true);
    expect(classes(button)).toEqual(expect.arrayContaining(['bg-ink', 'text-bg', 'min-h-(--size-target)', 'min-w-36']));
    expect(byTag(button, 'svg')).toHaveLength(0);
    expect(text(button)).toBe('Send message');
    expect(hasAttr(button, 'aria-disabled')).toBe(false);
  });

  it('while pending, says so and is aria-disabled (never disabled, so focus stays), keeping the ink fill', () => {
    const { root } = render(<SubmitButton pending pendingLabel="Sending…">Send message</SubmitButton>);
    const button = byTag(root, 'button')[0]!;
    expect(text(button)).toBe('Sending…');
    expect(attr(button, 'aria-disabled')).toBe('true');
    expect(hasAttr(button, 'disabled')).toBe(false);
    expect(classes(button)).toEqual(expect.arrayContaining(['bg-ink', 'cursor-progress']));
  });

  it('disabled: the disabled state from the tokens', () => {
    const { root } = render(<SubmitButton disabled>Send message</SubmitButton>);
    const button = byTag(root, 'button')[0]!;
    expect(hasAttr(button, 'disabled')).toBe(true);
    expect(classes(button)).toEqual(expect.arrayContaining(['bg-bg', 'border', 'border-line', 'text-muted', 'cursor-not-allowed']));
    expect(classes(button)).not.toContain('bg-ink');
  });
});

describe('the form-field sources', () => {
  const kit = join(import.meta.dirname, '../../../src/components/kit');
  const read = (f: string) => readFileSync(join(kit, f), 'utf8');

  it('are server-safe except the live counter', () => {
    for (const f of ['Field.tsx', 'TextField.tsx', 'TextArea.tsx', 'SelectField.tsx', 'SubmitButton.tsx']) {
      expect(read(f), f).not.toMatch(/^'use client'/);
      expect(read(f), f).not.toMatch(/\buse(State|Effect|Ref)\b/);
    }
    expect(read('CharacterCount.tsx').startsWith("'use client';")).toBe(true);
  });

  it('draw no chevron as a CSS background image and read no storage', () => {
    for (const f of ['Field.tsx', 'TextField.tsx', 'TextArea.tsx', 'SelectField.tsx', 'SubmitButton.tsx', 'CharacterCount.tsx']) {
      expect(read(f), f).not.toMatch(/background-image|bg-\[url|localStorage|sessionStorage|document\.cookie/);
    }
  });
});
