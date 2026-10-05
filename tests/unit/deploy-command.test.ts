import { spawnSync } from 'node:child_process';
import { deployCommand } from '../../scripts/deploy-command.ts';

describe('deployCommand', () => {
  it('never contains --prod when the site is not launched', () => {
    const argv = deployCommand({ launched: false });
    expect(argv).toEqual(['deploy', '--prebuilt']);
    expect(argv).not.toContain('--prod');
  });

  it('ends with --prod once the site is launched', () => {
    const argv = deployCommand({ launched: true });
    expect(argv).toEqual(['deploy', '--prebuilt', '--prod']);
    expect(argv.at(-1)).toBe('--prod');
  });
});

describe('deploy-command CLI', () => {
  function run(env: Record<string, string>, args: string[] = []): string {
    const base = { ...process.env };
    delete base.LAUNCHED;
    const result = spawnSync(
      process.execPath,
      ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/deploy-command.ts', ...args],
      { encoding: 'utf8', env: { ...base, ...env } },
    );
    expect(result.status).toBe(0);
    return result.stdout.trim();
  }

  it('omits --prod when LAUNCHED is unset', () => {
    expect(run({})).toBe('deploy --prebuilt');
  });

  it('omits --prod when LAUNCHED is "false"', () => {
    expect(run({ LAUNCHED: 'false' })).toBe('deploy --prebuilt');
  });

  it('adds --prod when LAUNCHED is "true"', () => {
    expect(run({ LAUNCHED: 'true' })).toBe('deploy --prebuilt --prod');
  });

  it('adds --prod for the --launched flag even when LAUNCHED is unset', () => {
    expect(run({}, ['--launched'])).toBe('deploy --prebuilt --prod');
  });

  it('only counts the exact string "true", so "True" omits --prod', () => {
    expect(run({ LAUNCHED: 'True' })).toBe('deploy --prebuilt');
  });
});
