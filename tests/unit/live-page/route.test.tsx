// The /experiment route: one snapshot read per render. At run time a failed read throws (the reader
// does that outside the build), so the route throws too and an ISR regeneration fails: Next keeps
// serving the last good page instead of a page built from nothing.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { snapshotFixture } from '@/lib/home/fixtures';

const read = vi.hoisted(() => vi.fn());
vi.mock('@/lib/experiment/live', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/experiment/live')>()),
  getExperimentSnapshot: read,
}));

const route = async () => (await import('@/app/experiment/page')).default;

afterEach(() => {
  read.mockReset();
  vi.unstubAllEnvs();
});

describe('the /experiment route', () => {
  it('throws when the snapshot read fails, so the last good page stays', async () => {
    read.mockRejectedValue(new Error('experiment store not configured'));
    await expect((await route())()).rejects.toThrow('experiment store not configured');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('renders the page from one read, with the production host and the build commit', async () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'site.example');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abcdef0123456789abcdef0123456789abcdef01');
    vi.stubEnv('BUILD_META_JSON', 'null');
    read.mockResolvedValue(snapshotFixture('calibration'));
    const html = renderToStaticMarkup(await (await route())());
    expect(read).toHaveBeenCalledTimes(1);
    expect(html).toContain('https://<data value="site.example"');
    expect(html).toContain('This page was built from commit');
    expect(html).toContain('Test and audit results are added when the site is deployed.');
  });
});
