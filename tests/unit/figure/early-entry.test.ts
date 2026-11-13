import { describe, expect, it } from 'vitest';
import { earlyTyped, hasEntry, type ControlState } from '@/lib/figure/early-entry';

const control = (overrides: Partial<ControlState>): ControlState => ({
  type: 'number',
  value: '20',
  defaultValue: '20',
  checked: false,
  defaultChecked: false,
  step: '1',
  ...overrides,
});

describe('hasEntry', () => {
  it('sees text typed in a number input, an emptied one, and nothing in an untouched one', () => {
    expect(hasEntry(control({ value: '999' }))).toBe(true);
    expect(hasEntry(control({ value: '' }))).toBe(true);
    expect(hasEntry(control({}))).toBe(false);
    expect(hasEntry(control({ value: '17.2', defaultValue: '17.2' }))).toBe(false);
  });

  it('sees a range input moved by a step, but not one the browser rounded onto its own grid', () => {
    expect(hasEntry(control({ type: 'range', value: '23' }))).toBe(true);
    expect(hasEntry(control({ type: 'range', value: '19' }))).toBe(true);
    expect(hasEntry(control({ type: 'range', value: '0.29', defaultValue: '0.29', step: '0.01' }))).toBe(false);
    expect(hasEntry(control({ type: 'range', value: '0.3', defaultValue: '0.30000000000000004', step: '0.01' }))).toBe(false);
    expect(hasEntry(control({ type: 'range', value: '0.31', defaultValue: '0.3', step: '0.01' }))).toBe(true);
  });

  it('counts any move of a range input whose step is not a positive number', () => {
    expect(hasEntry(control({ type: 'range', value: '20.5', step: 'any' }))).toBe(true);
    expect(hasEntry(control({ type: 'range', step: 'any' }))).toBe(false);
    expect(hasEntry(control({ type: 'range', value: 'x' }))).toBe(false);
  });

  it('sees a radio picked or left by the reader, and not one as rendered', () => {
    expect(hasEntry(control({ type: 'radio', checked: true, defaultChecked: false }))).toBe(true);
    expect(hasEntry(control({ type: 'radio', checked: false, defaultChecked: true }))).toBe(true);
    expect(hasEntry(control({ type: 'radio', checked: true, defaultChecked: true }))).toBe(false);
    expect(hasEntry(control({ type: 'radio' }))).toBe(false);
  });
});

describe('earlyTyped', () => {
  const grid = { min: 1, max: 50, step: 1 };

  it('commits the clamped, snapped value once focus has left, as blur does', () => {
    expect(earlyTyped('999', false, grid)).toEqual({ kind: 'commit', value: 50 });
    expect(earlyTyped('-3', false, grid)).toEqual({ kind: 'commit', value: 1 });
    expect(earlyTyped('12.4', false, grid)).toEqual({ kind: 'commit', value: 12 });
    expect(earlyTyped(' 7 ', false, grid)).toEqual({ kind: 'commit', value: 7 });
  });

  it('reverts an empty or unreadable entry once focus has left', () => {
    expect(earlyTyped('', false, grid)).toEqual({ kind: 'revert' });
    expect(earlyTyped('  ', false, grid)).toEqual({ kind: 'revert' });
    expect(earlyTyped('abc', false, grid)).toEqual({ kind: 'revert' });
  });

  it('keeps the entry as a draft while focused, applied at once only when it is on the grid', () => {
    expect(earlyTyped('999', true, grid)).toEqual({ kind: 'draft', text: '999', live: null });
    expect(earlyTyped('35', true, grid)).toEqual({ kind: 'draft', text: '35', live: 35 });
    expect(earlyTyped('12.4', true, grid)).toEqual({ kind: 'draft', text: '12.4', live: null });
    expect(earlyTyped('', true, grid)).toEqual({ kind: 'draft', text: '', live: null });
  });

  it('reads a decimal grid as the input prints it', () => {
    const rates = { min: 0.05, max: 0.5, step: 0.01 };
    expect(earlyTyped('0.3', true, rates)).toEqual({ kind: 'draft', text: '0.3', live: 0.3 });
    expect(earlyTyped('0.333', false, rates)).toEqual({ kind: 'commit', value: 0.33 });
  });
});
