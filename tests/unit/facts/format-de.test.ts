import { describe, expect, it } from 'vitest';
import { formatFact, formatValue } from '@/lib/facts/format';
import { factText } from '@/lib/facts/text';
import { FACTS, FACT_DISPLAYS_DE } from '@/lib/facts';

const NB = ' ';
const M = '−';
const de = { locale: 'de' } as const;

describe('formatValue in German', () => {
  it('uses a decimal comma and dots for thousands', () => {
    expect(formatValue(1234567, 'count', de)).toBe('1.234.567');
    expect(formatValue(1067371, 'count', de)).toBe('1.067.371');
    expect(formatValue(1234, 'count', de)).toBe('1.234');
    expect(formatValue(1.5, 'decimal', { ...de, decimals: 1 })).toBe('1,5');
    expect(formatValue(0.71, 'decimal', { ...de, decimals: 3 })).toBe('0,710');
  });

  it('writes a percent as digits, a no-break space and the sign', () => {
    expect(formatValue(0.015, 'share', { ...de, decimals: 1 })).toBe(`1,5${NB}%`);
    expect(formatValue(0.85, 'share', de)).toBe(`85${NB}%`);
  });

  it('keeps the true minus and prints zero unsigned', () => {
    expect(formatValue(-1.5, 'pp', { ...de, decimals: 1 })).toBe(`${M}1,5`);
    expect(formatValue(-0.001, 'decimal', { ...de, decimals: 1 })).toBe('0,0');
    expect(formatValue(0, 'count', de)).toBe('0');
    expect(formatValue(-0.004, 'share', { ...de, decimals: 0 })).toBe(`0${NB}%`);
    expect(formatValue(-0.2, 'share', { ...de, decimals: 0 })).toBe(`${M}20${NB}%`);
  });

  it('writes pounds after the number, with the scale as a word', () => {
    expect(formatValue(77184, 'gbp', { ...de, scale: 'k' })).toBe(`77${NB}Tsd.${NB}£`);
    expect(formatValue(77184, 'gbp', { ...de, scale: 'k', decimals: 1 })).toBe(`77,2${NB}Tsd.${NB}£`);
    expect(formatValue(1500000, 'gbp', { ...de, scale: 'M', decimals: 1 })).toBe(`1,5${NB}Mio.${NB}£`);
    expect(formatValue(1234, 'gbp', de)).toBe(`1.234${NB}£`);
  });

  it('keeps the plus suffix and km/h', () => {
    expect(formatValue(25, 'count', { ...de, suffix: '+' })).toBe('25+');
    expect(formatValue(12.5, 'kmh', { ...de, decimals: 1 })).toBe('12,5 km/h');
  });

  it('formats dates with Intl de-DE', () => {
    expect(formatValue('2009-12-01', 'date', de)).toBe('1. Dez. 2009');
    expect(formatValue('2026-03-05', 'date', de)).toBe('5. März 2026');
    expect(formatValue('2026-05-02', 'date', de)).toBe('2. Mai 2026');
  });

  it('leaves English unchanged when no locale is given', () => {
    expect(formatValue(0.015, 'share', { decimals: 1 })).toBe('1.5%');
    expect(formatValue(77184, 'gbp', { scale: 'k' })).toBe('£77k');
    expect(formatValue('2009-12-01', 'date')).toBe('1 Dec 2009');
    expect(formatValue(1234567, 'count', { locale: 'en' })).toBe('1,234,567');
  });
});

describe('formatFact and factText in German', () => {
  it('format a fact and agree with each other', () => {
    const id = 'profile.audible.setup_time_cut' as const;
    expect(formatFact(FACTS[id], de)).toBe(`85${NB}%`);
    expect(factText(id, de)).toBe(`85${NB}%`);
    expect(factText(id)).toBe('85%');
    expect(factText('profile.audible.experiments', de)).toBe('25+');
  });
});

describe('FACT_DISPLAYS_DE', () => {
  it('lists the sorted unique German display of every fact', () => {
    expect(FACT_DISPLAYS_DE).toEqual([...FACT_DISPLAYS_DE].sort());
    expect(new Set(FACT_DISPLAYS_DE).size).toBe(FACT_DISPLAYS_DE.length);
    for (const f of Object.values(FACTS)) expect(FACT_DISPLAYS_DE, f.id).toContain(formatFact(f, de));
    expect(FACT_DISPLAYS_DE).toContain(`85${NB}%`);
  });
});
