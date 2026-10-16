import { spawnSync } from 'node:child_process';
import { parseTarget } from '../../scripts/parse-inspect-target.ts';

// Real `vercel inspect` output (Vercel CLI 62.2.0) for the first, failed deployment, which was
// created as a production deployment although `vercel deploy` was run without --prod. The
// `General` block is indented with spaces and uses a tab between the key and the value.
const REAL_INSPECT_OUTPUT = [
  'Vercel CLI 62.2.0',
  'Fetching deployment "portfolio-hv3cuioer-mahmoud-s-team.vercel.app" in mahmoud-s-team',
  '> Fetched deployment "portfolio-hv3cuioer-mahmoud-s-team.vercel.app" in mahmoud-s-team [908ms]',
  '',
  '  General',
  '',
  '    id\t\tdpl_g3arKp9zCBG61EA7C4ym2bEXhp3S',
  '    name\tportfolio',
  '    target\tproduction',
  '    status\t● Error',
  '    url\t\thttps://portfolio-hv3cuioer-mahmoud-s-team.vercel.app',
  '    created\tTue Oct 06 2026 11:53:12 GMT+0200 (Central European Summer Time) [4m ago]',
  '',
  '',
  '  Build Machine',
  '',
  '    requested build machine basic',
  '    actual assigned cores   2 vCPU (actual assignment)',
  '    memory                  8192 MiB',
  '    selection type          fixed',
  '    selection source        plan-default',
  '',
  '',
  '  Duration',
  '',
  '    build duration\t2s',
  '    post-build duration\t6s',
  '    billable duration\t1m',
  '    CPU Minutes Usage\t2 minutes (1m x 2vCPU)',
  '',
  '',
  '  Aliases',
  '',
  '    ╶ https://portfolio-mahmoud-s-team.vercel.app',
  '',
  '',
  '  Builds',
  '',
  '    ╶ .        [0ms]',
  '',
  '',
].join('\n');

describe('parseTarget', () => {
  it('reads the production target from the real inspect output', () => {
    expect(parseTarget(REAL_INSPECT_OUTPUT)).toBe('production');
  });

  it('reads the preview target from the same output with the target swapped', () => {
    const preview = REAL_INSPECT_OUTPUT.replace('target\tproduction', 'target\tpreview');
    expect(parseTarget(preview)).toBe('preview');
  });

  it('parses a bare tab-separated line', () => {
    expect(parseTarget('target\tpreview')).toBe('preview');
  });

  it('tolerates extra spaces and tabs around the tokens', () => {
    expect(parseTarget('   target \t  preview   \n')).toBe('preview');
  });

  it('tolerates CRLF line endings', () => {
    expect(parseTarget('name\tportfolio\r\ntarget\tpreview\r\nstatus\tReady\r\n')).toBe('preview');
  });

  it('returns null when there is no target line', () => {
    expect(parseTarget('name\tportfolio\nstatus\tReady\n')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseTarget('')).toBeNull();
    expect(parseTarget('\n\n')).toBeNull();
  });

  it('returns null when the target line has no value', () => {
    expect(parseTarget('target\n')).toBeNull();
    expect(parseTarget('target   \n')).toBeNull();
  });

  it('does not match lines that merely mention a target or start with a longer word', () => {
    expect(parseTarget('targets\tpreview\nnote target production\n')).toBeNull();
  });

  it('uses the first target line', () => {
    expect(parseTarget('target\tpreview\ntarget\tproduction\n')).toBe('preview');
  });
});

describe('parse-inspect-target CLI', () => {
  function run(input: string): { status: number | null; stdout: string } {
    const result = spawnSync(
      process.execPath,
      ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/parse-inspect-target.ts'],
      { encoding: 'utf8', input },
    );
    return { status: result.status, stdout: result.stdout };
  }

  it('prints the target read from stdin', () => {
    expect(run(REAL_INSPECT_OUTPUT)).toEqual({ status: 0, stdout: 'production\n' });
  });

  it('prints an empty line and exits 0 when there is no target', () => {
    expect(run('')).toEqual({ status: 0, stdout: '\n' });
  });
});
