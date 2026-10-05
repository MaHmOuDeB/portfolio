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
