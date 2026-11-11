import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { devices, type PlaywrightTestConfig } from '@playwright/test';
import { afterEach, vi } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PLAYWRIGHT = fileURLToPath(new URL('../../node_modules/.bin/playwright', import.meta.url));

// The projects of a default run, CI included. Desktop Firefox is added only with PLAYWRIGHT_FIREFOX=1.
const DEFAULT_PROJECTS = [
  'desktop-chromium',
  'mobile-chromium',
  'screenshare-chromium',
  'phone-390-chromium',
  'tablet-chromium',
  'laptop-chromium',
  'desktop-webkit',
];

type ListedSpec = { title: string; tags?: string[]; tests: { projectName: string }[] };
type ListedSuite = { title: string; file: string; specs?: ListedSpec[]; suites?: ListedSuite[] };
type Listed = { project: string; id: string; tags: string[] };

/** The environment of a child Playwright process, with the Firefox flag set or removed. */
function envWith(firefox: boolean): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, CI: '' };
  delete env.PLAYWRIGHT_FIREFOX;
  if (firefox) env.PLAYWRIGHT_FIREFOX = '1';
  return env;
}

function list(args: string[], firefox: boolean) {
  return spawnSync(PLAYWRIGHT, ['test', '--list', '--reporter=json', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: envWith(firefox),
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** The tests Playwright discovers, as "file > title" ids with their project and tags. */
function discover(firefox: boolean, project?: string): Listed[] {
  const run = list(project ? [`--project=${project}`] : [], firefox);
  if (run.status !== 0) throw new Error(`playwright --list failed (${project ?? 'all projects'}):\n${run.stderr}`);
  const report = JSON.parse(run.stdout) as { suites: ListedSuite[] };
  const found: Listed[] = [];
  const walk = (suite: ListedSuite, path: string[]) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        found.push({ project: t.projectName, id: [suite.file, ...path, spec.title].join(' > '), tags: spec.tags ?? [] });
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...path, child.title]);
  };
  for (const suite of report.suites) walk(suite, []);
  return project ? found.filter((t) => t.project === project) : found;
}

const ids = (tests: Listed[]) => tests.map((t) => `${t.project} | ${t.id}`).sort();

/** playwright.config.ts as evaluated with PLAYWRIGHT_FIREFOX set to `value` (undefined: unset). */
async function loadConfig(value: string | undefined): Promise<PlaywrightTestConfig> {
  vi.resetModules();
  vi.stubEnv('PLAYWRIGHT_FIREFOX', value);
  return (await import('../../playwright.config.ts')).default;
}

const names = (config: PlaywrightTestConfig) => (config.projects ?? []).map((p) => p.name);
const projectNamed = (config: PlaywrightTestConfig, name: string) => config.projects?.find((p) => p.name === name);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('playwright.config.ts browser projects', () => {
  it('without PLAYWRIGHT_FIREFOX has exactly the default projects, no Firefox', async () => {
    expect(names(await loadConfig(undefined))).toEqual(DEFAULT_PROJECTS);
  });

  it('treats any value other than "1" as unset', async () => {
    for (const value of ['', '0', 'true']) {
      expect(names(await loadConfig(value)), value).toEqual(DEFAULT_PROJECTS);
    }
  });

  it('with PLAYWRIGHT_FIREFOX=1 adds only desktop-firefox, on the Desktop Firefox device at the desktop viewport', async () => {
    const config = await loadConfig('1');
    expect(names(config)).toEqual([...DEFAULT_PROJECTS, 'desktop-firefox']);
    const firefox = projectNamed(config, 'desktop-firefox');
    expect(firefox?.use?.defaultBrowserType).toBe('firefox');
    expect(firefox?.use?.defaultBrowserType).toBe(devices['Desktop Firefox'].defaultBrowserType);
    expect(firefox?.use?.userAgent).toBe(devices['Desktop Firefox'].userAgent);
    expect(firefox?.use?.viewport).toEqual({ width: 1440, height: 900 });
  });

  it('gives Firefox the same non-visual policy as WebKit: every test except @visual ones', async () => {
    const config = await loadConfig('1');
    const firefox = projectNamed(config, 'desktop-firefox');
    const webkit = projectNamed(config, 'desktop-webkit');
    expect(webkit?.grepInvert).toEqual(/@visual/);
    expect(firefox?.grepInvert).toEqual(webkit?.grepInvert);
    expect(firefox?.grep).toBeUndefined();
    expect(webkit?.grep).toBeUndefined();
  });
});

describe('playwright.config.ts web server', () => {
  async function serverTimeout(ci: string | undefined): Promise<number | undefined> {
    vi.resetModules();
    vi.stubEnv('CI', ci);
    const servers = (await import('../../playwright.config.ts')).default.webServer;
    const site = (Array.isArray(servers) ? servers : [servers]).find((s) => s?.command?.includes('npm run build'));
    return site?.timeout;
  }

  it('gives the build and start 10 minutes in CI and 3 locally', async () => {
    expect(await serverTimeout('true')).toBe(600_000);
    expect(await serverTimeout(undefined)).toBe(180_000);
  });
});

describe('playwright.config.ts screenshots', () => {
  async function screenshotOptions(ci: string | undefined) {
    vi.resetModules();
    vi.stubEnv('CI', ci);
    return (await import('../../playwright.config.ts')).default.expect?.toHaveScreenshot;
  }

  it('gives a capture 15 s in CI and keeps the default timeout locally', async () => {
    expect(await screenshotOptions('true')).toHaveProperty('timeout', 15_000);
    const local = await screenshotOptions(undefined);
    expect(local).toBeDefined();
    expect(local).not.toHaveProperty('timeout');
  });

  it('compares the same way in CI and locally', async () => {
    const shared = { maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' };
    expect(await screenshotOptions('true')).toEqual({ ...shared, timeout: 15_000 });
    expect(await screenshotOptions(undefined)).toEqual(shared);
  });
});

describe('Playwright test discovery', () => {
  it(
    'without the flag no Firefox project exists, and the flag adds nothing but Firefox tests',
    () => {
      const unset = list(['--project=desktop-firefox'], false);
      expect(unset.status).not.toBe(0);
      expect(unset.stderr).toMatch(/Project\(s\) "desktop-firefox" not found/);

      const without = discover(false);
      expect(without.length).toBeGreaterThan(0);
      expect(new Set(without.map((t) => t.project))).toEqual(new Set(DEFAULT_PROJECTS));
      const withFlag = discover(true);
      expect(ids(withFlag.filter((t) => t.project !== 'desktop-firefox'))).toEqual(ids(without));
    },
    60_000,
  );

  it(
    'with the flag, discovers desktop-firefox tests, none of them @visual, exactly the set desktop-webkit discovers',
    () => {
      const firefox = discover(true, 'desktop-firefox');
      const webkit = discover(true, 'desktop-webkit');
      expect(firefox.length).toBeGreaterThan(0);
      for (const t of firefox) {
        expect(t.id).not.toMatch(/@visual/);
        expect(t.tags).not.toContain('@visual');
      }
      expect(firefox.map((t) => t.id).sort()).toEqual(webkit.map((t) => t.id).sort());
    },
    60_000,
  );
});
