import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Derived, derivedAttr } from '../../../src/components/kit/Derived.tsx';
import { Fact } from '../../../src/components/kit/Fact.tsx';
import { FACTS, FACT_DISPLAYS, formatFact, formatValue, getFact, type FactId } from '../../../src/lib/facts/index.ts';

describe('Fact', () => {
  it('renders the one <data> markup with the raw value and the formatted text', () => {
    expect(renderToStaticMarkup(createElement(Fact, { id: 'profile.audible.experiments' }))).toBe(
      '<data value="25" data-fact="profile.audible.experiments">25+</data>',
    );
  });

  it('keeps the raw value unrounded and formats a share as a percentage', () => {
    expect(renderToStaticMarkup(createElement(Fact, { id: 'profile.audible.setup_time_cut' }))).toBe(
      '<data value="0.85" data-fact="profile.audible.setup_time_cut">85%</data>',
    );
  });

  it('lets the caller override the decimals shown but not the raw value', () => {
    expect(renderToStaticMarkup(createElement(Fact, { id: 'profile.audible.setup_time_cut', decimals: 1 }))).toBe(
      '<data value="0.85" data-fact="profile.audible.setup_time_cut">85.0%</data>',
    );
  });

  it('throws on an unknown id at runtime', () => {
    const bad = 'profile.nope.nothing' as FactId;
    expect(() => renderToStaticMarkup(createElement(Fact, { id: bad }))).toThrow('unknown fact profile.nope.nothing');
  });

  it('does not resolve ids through the prototype chain', () => {
    expect(() => getFact('constructor' as FactId)).toThrow(new Error('unknown fact constructor'));
  });
});

describe('Derived', () => {
  it('renders the refs in data-derived and the formatted value', () => {
    const html = renderToStaticMarkup(
      createElement(Derived, {
        value: 0.34,
        unit: 'share',
        refs: ['profile.n8n.automated_tests', 'simulated'],
        decimals: 0,
      }),
    );
    expect(html).toBe('<data value="0.34" data-derived="profile.n8n.automated_tests simulated">34%</data>');
  });

  it('passes suffix and scale through to the formatter', () => {
    const html = renderToStaticMarkup(
      createElement(Derived, { value: 12500, unit: 'count', refs: ['source:retail'], scale: 'k', decimals: 1, suffix: '+' }),
    );
    expect(html).toBe('<data value="12500" data-derived="source:retail">12.5k+</data>');
  });

  it('throws on an empty refs list', () => {
    expect(() => renderToStaticMarkup(createElement(Derived, { value: 1, unit: 'count', refs: [] }))).toThrow();
  });
});

describe('derivedAttr', () => {
  it('joins refs with one space', () => {
    expect(derivedAttr(['live', 'build'])).toEqual({ 'data-derived': 'live build' });
  });

  it('throws on an empty list', () => {
    expect(() => derivedAttr([])).toThrow();
  });
});

describe('facts index', () => {
  it('re-exports the generated data and the formatters', () => {
    expect(getFact('profile.audible.teams')).toBe(FACTS['profile.audible.teams']);
    expect(formatFact(getFact('profile.audible.teams'))).toBe('3');
    expect(formatValue(1, 'count')).toBe('1');
    expect(FACT_DISPLAYS).toContain('25+');
  });
});
