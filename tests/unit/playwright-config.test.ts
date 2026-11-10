import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { devices } from '@playwright/test';
import config from '../../playwright.config.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PLAYWRIGHT = fileURLToPath(new URL('../../node_modules/.bin/playwright', import.meta.url));

type ListedSpec = { title: string; tags?: string[]; tests: { projectName: string }[] };
type ListedSuite = { title: string; file: string; specs?: ListedSpec[]; suites?: ListedSuite[] };

/** The tests Playwright discovers for one project, as "file > title" ids with their tags. */
function discover(project: string): { id: string; tags: string[] }[] {
  const run = spawnSync(PLAYWRIGHT, ['test', '--list', `--project=${project}`, '--reporter=json'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, CI: '' },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error(`playwright --list failed for ${project}:\n${run.stderr}`);
  const report = JSON.parse(run.stdout) as { suites: ListedSuite[] };
  const found: { id: string; tags: string[] }[] = [];
  const walk = (suite: ListedSuite, path: string[]) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        if (t.projectName === project) {
          found.push({ id: [suite.file, ...path, spec.title].join(' > '), tags: spec.tags ?? [] });
        }
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...path, child.title]);
  };
  for (const suite of report.suites) walk(suite, []);
  return found;
}

const projectNamed = (name: string) => config.projects?.find((p) => p.name === name);

describe('playwright.config.ts browser projects', () => {
  it('has a named desktop Firefox project on the Desktop Firefox device at the desktop viewport', () => {
    const firefox = projectNamed('desktop-firefox');
    expect(firefox).toBeDefined();
    expect(firefox?.use?.defaultBrowserType).toBe('firefox');
    expect(firefox?.use?.defaultBrowserType).toBe(devices['Desktop Firefox'].defaultBrowserType);
    expect(firefox?.use?.userAgent).toBe(devices['Desktop Firefox'].userAgent);
    expect(firefox?.use?.viewport).toEqual({ width: 1440, height: 900 });
  });

  it('gives Firefox the same non-visual policy as WebKit: every test except @visual ones', () => {
    const firefox = projectNamed('desktop-firefox');
    const webkit = projectNamed('desktop-webkit');
    expect(webkit?.grepInvert).toEqual(/@visual/);
    expect(firefox?.grepInvert).toEqual(webkit?.grepInvert);
    expect(firefox?.grep).toBeUndefined();
    expect(webkit?.grep).toBeUndefined();
  });

  it('keeps Chromium, Firefox and WebKit desktop projects, each named once', () => {
    const names = (config.projects ?? []).map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of ['desktop-chromium', 'mobile-chromium', 'desktop-firefox', 'desktop-webkit']) {
      expect(names).toContain(name);
    }
  });
});

describe('Playwright test discovery per engine', () => {
  it(
    'discovers desktop-firefox tests, none of them @visual, exactly the set desktop-webkit discovers',
    () => {
      const firefox = discover('desktop-firefox');
      const webkit = discover('desktop-webkit');
      expect(firefox.length).toBeGreaterThan(0);
      for (const t of firefox) {
        expect(t.id).not.toMatch(/@visual/);
        expect(t.tags).not.toContain('@visual');
      }
      expect(firefox.map((t) => t.id).sort()).toEqual(webkit.map((t) => t.id).sort());
    },
    60_000,
  );

  it(
    'still discovers tests for desktop Chromium',
    () => {
      expect(discover('desktop-chromium').length).toBeGreaterThan(0);
    },
    60_000,
  );
});
