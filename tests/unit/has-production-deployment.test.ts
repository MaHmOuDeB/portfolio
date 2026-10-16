import { spawnSync } from 'node:child_process';
import { hasProductionDeployment } from '../../scripts/has-production-deployment.ts';

describe('hasProductionDeployment', () => {
  it('is true when the API lists at least one production deployment, whatever its state', () => {
    const errored = JSON.stringify({ deployments: [{ uid: 'dpl_1', target: 'production', state: 'ERROR' }] });
    expect(hasProductionDeployment(errored)).toBe(true);
  });

  it('is false when the list is empty', () => {
    expect(hasProductionDeployment(JSON.stringify({ deployments: [] }))).toBe(false);
  });

  it('is false for anything that is not the expected shape, so the caller fails closed', () => {
    for (const body of ['', 'not json', '{}', '[]', '{"deployments":null}', '{"error":{"code":"forbidden"}}']) {
      expect(hasProductionDeployment(body)).toBe(false);
    }
  });
});

describe('has-production-deployment CLI', () => {
  function run(stdin: string): string {
    const result = spawnSync(
      process.execPath,
      ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/has-production-deployment.ts'],
      { input: stdin, encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    return result.stdout.trim();
  }

  it('prints yes or no', () => {
    expect(run('{"deployments":[{"uid":"dpl_1"}]}')).toBe('yes');
    expect(run('{"deployments":[]}')).toBe('no');
    expect(run('garbage')).toBe('no');
  });
});
