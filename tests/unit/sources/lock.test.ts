import { parseLock, serializeLock, sha256Hex } from '../../../scripts/sources/lock.ts';

const COMMIT = 'a'.repeat(40);
const SHA = 'b'.repeat(64);
const entry = () => ({
  commit: COMMIT,
  path: 'reports/site/retention.json',
  repo: 'mahmoud/customer-retention-rfm',
  schema: 'retention/1',
  sha256: SHA,
});
const lockText = (sources: Record<string, unknown>, version: unknown = 1) =>
  JSON.stringify({ sources, version });

describe('serializeLock / parseLock', () => {
  it('round-trips a canonical lock byte for byte', () => {
    const canonical = [
      '{',
      '  "sources": {',
      '    "retention": {',
      `      "commit": "${COMMIT}",`,
      '      "path": "reports/site/retention.json",',
      '      "repo": "mahmoud/customer-retention-rfm",',
      '      "schema": "retention/1",',
      `      "sha256": "${SHA}"`,
      '    }',
      '  },',
      '  "version": 1',
      '}',
      '',
    ].join('\n');
    expect(serializeLock(parseLock(canonical))).toBe(canonical);
  });

  it('sorts keys at every level whatever the input order', () => {
    const shuffled = '{"version":1,"sources":{"retention":' + JSON.stringify(entry()) + '}}';
    const out = serializeLock(parseLock(shuffled));
    expect(out.indexOf('"sources"')).toBeLessThan(out.indexOf('"version"'));
    expect(out.indexOf('"commit"')).toBeLessThan(out.indexOf('"sha256"'));
    expect(out.endsWith('}\n')).toBe(true);
  });

  it('serialises an empty lock', () => {
    expect(serializeLock({ version: 1, sources: {} })).toBe('{\n  "sources": {},\n  "version": 1\n}\n');
  });
});

describe('parseLock rejects', () => {
  it('a 39-hex commit, naming the field', () => {
    const bad = { ...entry(), commit: 'a'.repeat(39) };
    expect(() => parseLock(lockText({ retention: bad }))).toThrow(/sources\.retention\.commit/);
  });

  it('an unknown source id', () => {
    expect(() => parseLock(lockText({ hillstrom: entry() }))).toThrow(/hillstrom/);
  });

  it.each([
    ['sha256', { sha256: 'b'.repeat(63) }],
    ['repo', { repo: 'no-owner' }],
    ['schema', { schema: 'weather/1' }],
    ['path', { path: '../escape.json' }],
    ['path', { path: '%2e%2e/%2e%2e/%2e%2e/evil/repo/c/f.json' }],
    ['path', { path: 'reports/site/weather.json' }],
    ['path', { path: 'reports/other.json' }],
    ['repo', { repo: '../..' }],
    ['repo', { repo: './x' }],
    ['repo', { repo: 'x/..' }],
    ['repo', { repo: '../x' }],
    ['repo', { repo: 'x/.' }],
  ])('a malformed %s', (field, patch) => {
    const bad = { ...entry(), ...patch };
    expect(() => parseLock(lockText({ retention: bad }))).toThrow(new RegExp(`sources\\.retention\\.${field}`));
  });

  it('a missing field and an extra field', () => {
    const missing: Record<string, unknown> = entry();
    delete missing.sha256;
    expect(() => parseLock(lockText({ retention: missing }))).toThrow(/sources\.retention\.sha256/);
    expect(() => parseLock(lockText({ retention: { ...entry(), extra: 1 } }))).toThrow(/sources\.retention\.extra/);
  });

  it('a wrong version, invalid JSON and a non-object', () => {
    expect(() => parseLock(lockText({}, 2))).toThrow(/version/);
    expect(() => parseLock('{')).toThrow(/JSON/);
    expect(() => parseLock('[]')).toThrow(/object/);
    expect(() => parseLock('{"version":1,"sources":[]}')).toThrow(/sources/);
  });
});

describe('sha256Hex', () => {
  it('hashes strings and bytes alike', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(sha256Hex('abc'));
  });
});
