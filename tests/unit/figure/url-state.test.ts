import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assertFigureId,
  figureUrl,
  readFigureParams,
  resetFigureParams,
  URL_DEBOUNCE_MS,
  writeFigureParams,
  type Presets,
} from '@/lib/figure/url-state';

const schema = {
  baseline: { kind: 'number', min: 0.01, max: 0.5, step: 0.01 },
  power: { kind: 'enum', values: ['0.8', '0.9'] },
} as const;

const presets: Presets<typeof schema> = {
  default: { baseline: 0.29, power: '0.8' },
  interview: { baseline: 0.1, power: '0.9' },
};

const read = (query: string) => readFigureParams(new URLSearchParams(query), 'demo', schema, presets);

describe('readFigureParams', () => {
  it('gives the default preset when the URL has no keys of its own', () => {
    expect(read('')).toEqual({ values: { baseline: 0.29, power: '0.8' }, preset: 'default' });
    expect(read('other.baseline=0.4&other.preset=interview')).toEqual({
      values: { baseline: 0.29, power: '0.8' },
      preset: 'default',
    });
  });

  it('reads valid explicit values', () => {
    expect(read('demo.baseline=0.2&demo.power=0.9').values).toEqual({ baseline: 0.2, power: '0.9' });
  });

  it('falls back to the preset value when a number does not parse', () => {
    expect(read('demo.baseline=abc').values.baseline).toBe(0.29);
    expect(read('demo.baseline=NaN').values.baseline).toBe(0.29);
  });

  it('falls back to the preset value for an empty or blank number, which Number reads as 0', () => {
    expect(read('demo.baseline=').values.baseline).toBe(0.29);
    expect(read('demo.baseline=%20%20').values.baseline).toBe(0.29);
    expect(read('demo.preset=interview&demo.baseline=').values.baseline).toBe(0.1);
  });

  it('clamps numbers to the range', () => {
    expect(read('demo.baseline=1e9').values.baseline).toBe(0.5);
    expect(read('demo.baseline=-5').values.baseline).toBe(0.01);
    expect(read('demo.baseline=Infinity').values.baseline).toBe(0.5);
    expect(read('demo.baseline=-Infinity').values.baseline).toBe(0.01);
  });

  it('snaps numbers to the step', () => {
    expect(read('demo.baseline=0.123').values.baseline).toBe(0.12);
    expect(read('demo.baseline=0.1250001').values.baseline).toBe(0.13);
  });

  it('uses the first of repeated keys', () => {
    expect(read('demo.baseline=0.2&demo.baseline=0.4').values.baseline).toBe(0.2);
    expect(read('demo.power=0.9&demo.power=0.8').values.power).toBe('0.9');
    expect(read('demo.preset=interview&demo.preset=default').preset).toBe('interview');
  });

  it('falls back to the preset value for an enum value outside its values', () => {
    expect(read('demo.power=0.7').values.power).toBe('0.8');
    expect(read('demo.preset=interview&demo.power=0.7').values.power).toBe('0.9');
    expect(read('demo.power=').values.power).toBe('0.8');
  });

  it('gives the default preset for an unknown preset name, including inherited object keys', () => {
    for (const name of ['nope', '', 'toString', '__proto__', 'constructor', 'hasOwnProperty']) {
      expect(read(`demo.preset=${encodeURIComponent(name)}`)).toEqual({
        values: { baseline: 0.29, power: '0.8' },
        preset: 'default',
      });
    }
  });

  it('lets explicit keys override the preset', () => {
    expect(read('demo.preset=interview&demo.baseline=0.3')).toEqual({
      values: { baseline: 0.3, power: '0.9' },
      preset: 'interview',
    });
    expect(read('demo.baseline=0.3&demo.preset=interview').preset).toBe('interview');
  });

  it("never reads another Figure's keys, even one whose id starts the same", () => {
    expect(read('demo-b.baseline=0.4&demob.power=0.9&demo-b.preset=interview').values).toEqual({
      baseline: 0.29,
      power: '0.8',
    });
  });

  it('ignores unknown keys of its own Figure', () => {
    expect(read('demo.looks=20&demo.baseline.x=0.4').values).toEqual({ baseline: 0.29, power: '0.8' });
  });

  it('never throws, whatever the query string', () => {
    const keys = fc.constantFrom(
      'demo.baseline',
      'demo.power',
      'demo.preset',
      'demo.',
      'demo',
      'other.baseline',
      '__proto__',
      'demo.__proto__',
      'demo.constructor',
    );
    const values = fc.oneof(
      fc.string(),
      fc.constantFrom('abc', '1e9', '-5', 'NaN', 'Infinity', '', ' ', '0x10', 'interview', 'toString', '__proto__'),
      fc.double().map(String),
    );
    const pair = fc.tuple(keys, values).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    const query = fc.oneof(fc.string(), fc.array(pair).map((pairs) => pairs.join('&')));
    fc.assert(
      fc.property(query, (q) => {
        const { values: v, preset } = read(q);
        expect(Object.keys(presets)).toContain(preset);
        expect(v.baseline).toBeGreaterThanOrEqual(0.01);
        expect(v.baseline).toBeLessThanOrEqual(0.5);
        expect(schema.power.values).toContain(v.power);
      }),
    );
  });
});

describe('writeFigureParams', () => {
  it("sets every own key, keeps the preset and leaves other Figures' keys alone", () => {
    const before = new URLSearchParams('other.x=1&demo.preset=interview');
    const after = writeFigureParams<typeof schema>(before, 'demo', { baseline: 0.3, power: '0.9' });
    expect(after.get('other.x')).toBe('1');
    expect(after.get('demo.preset')).toBe('interview');
    expect(after.get('demo.baseline')).toBe('0.3');
    expect(after.get('demo.power')).toBe('0.9');
    expect(after.toString()).toBe('other.x=1&demo.preset=interview&demo.baseline=0.3&demo.power=0.9');
  });

  it('replaces repeated own keys with one, and does not change its input', () => {
    const before = new URLSearchParams('demo.baseline=0.2&demo.baseline=0.4');
    const after = writeFigureParams<typeof schema>(before, 'demo', { baseline: 0.3, power: '0.8' });
    expect(after.getAll('demo.baseline')).toEqual(['0.3']);
    expect(before.toString()).toBe('demo.baseline=0.2&demo.baseline=0.4');
  });

  it('round-trips through readFigureParams', () => {
    const written = writeFigureParams<typeof schema>(new URLSearchParams('demo.preset=interview'), 'demo', {
      baseline: 0.42,
      power: '0.8',
    });
    expect(readFigureParams(written, 'demo', schema, presets)).toEqual({
      values: { baseline: 0.42, power: '0.8' },
      preset: 'interview',
    });
  });
});

describe('resetFigureParams', () => {
  it('removes its own keys but keeps a non-default preset and other Figures’ keys', () => {
    const before = new URLSearchParams('other.x=1&demo.baseline=0.3&demo.preset=interview');
    expect(resetFigureParams(before, 'demo', 'interview').toString()).toBe('other.x=1&demo.preset=interview');
    expect(before.toString()).toBe('other.x=1&demo.baseline=0.3&demo.preset=interview');
  });

  it('removes the preset key too when the preset is default', () => {
    const before = new URLSearchParams('other.x=1&demo.baseline=0.3&demo.preset=default&demo.power=0.9');
    expect(resetFigureParams(before, 'demo', 'default').toString()).toBe('other.x=1');
  });

  it('removes unknown and repeated own keys, never one of a Figure whose id starts the same', () => {
    const before = new URLSearchParams('demo.looks=2&demo.baseline=0.2&demo.baseline=0.4&demo-b.baseline=0.2');
    expect(resetFigureParams(before, 'demo', 'default').toString()).toBe('demo-b.baseline=0.2');
  });

  it('writes the loaded preset back when it was given as a repeated or stale key', () => {
    const before = new URLSearchParams('demo.preset=interview&demo.preset=nope');
    expect(resetFigureParams(before, 'demo', 'interview').toString()).toBe('demo.preset=interview');
  });
});

describe('figureUrl', () => {
  const at = (pathname: string, search = '', hash = '') => ({ pathname, search, hash });
  const write = (s: URLSearchParams) => writeFigureParams<typeof schema>(s, 'demo', { baseline: 0.3, power: '0.8' });

  it('applies the write to the current query and keeps the hash', () => {
    expect(figureUrl(at('/lab', '?other.x=1', '#peeking'), '/lab', write)).toBe(
      '/lab?other.x=1&demo.baseline=0.3&demo.power=0.8#peeking',
    );
  });

  it('drops a write scheduled on another page, so keys never land on the wrong URL', () => {
    expect(figureUrl(at('/about', '?x=1'), '/lab', write)).toBeNull();
  });

  it('gives null when the URL would not change, and drops an emptied query', () => {
    expect(figureUrl(at('/lab', '?demo.baseline=0.3&demo.power=0.8'), '/lab', write)).toBeNull();
    expect(figureUrl(at('/lab', '?demo.baseline=0.3', '#a'), '/lab', (s) => resetFigureParams(s, 'demo', 'default'))).toBe(
      '/lab#a',
    );
  });
});

describe('assertFigureId', () => {
  it('rejects ids that would break the namespace', () => {
    for (const id of ['Demo', 'a.b', '', '1demo', '-demo', 'demo_b', 'demo b']) {
      expect(() => assertFigureId(id)).toThrow();
    }
  });

  it('accepts lower-case kebab-case ids', () => {
    expect(() => assertFigureId('peeking')).not.toThrow();
    expect(() => assertFigureId('demo-b')).not.toThrow();
    expect(() => assertFigureId('a1')).not.toThrow();
  });

  it('is checked by every reader and writer', () => {
    const search = new URLSearchParams();
    expect(() => readFigureParams(search, 'a.b', schema, presets)).toThrow();
    expect(() => writeFigureParams(search, 'a.b', presets.default)).toThrow();
    expect(() => resetFigureParams(search, 'a.b', 'default')).toThrow();
  });
});

describe('a schema param named preset', () => {
  // `${id}.preset` names the preset, so a param of that name would read and write the same key.
  const clash = { preset: { kind: 'enum', values: ['a', 'b'] } } as const;
  const clashPresets: Presets<typeof clash> = { default: { preset: 'a' } };

  it('is refused with a TypeError by the reader and the writer', () => {
    expect(() => readFigureParams(new URLSearchParams(), 'demo', clash, clashPresets)).toThrow(TypeError);
    expect(() => readFigureParams(new URLSearchParams(), 'demo', clash, clashPresets)).toThrow(
      'a Figure param cannot be named "preset"',
    );
    expect(() => writeFigureParams<typeof clash>(new URLSearchParams(), 'demo', { preset: 'b' })).toThrow(TypeError);
  });
});

describe('URL_DEBOUNCE_MS', () => {
  it('is about a quarter of a second', () => {
    expect(URL_DEBOUNCE_MS).toBe(250);
  });
});
