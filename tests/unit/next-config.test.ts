const DEFAULTS = ['tsx', 'ts', 'jsx', 'js'];

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.KITCHEN_SINK;
  vi.resetModules();
});

afterEach(() => {
  if (saved === undefined) delete process.env.KITCHEN_SINK;
  else process.env.KITCHEN_SINK = saved;
  vi.resetModules();
});

async function loadConfig() {
  return (await import('../../next.config.ts')).default;
}

describe('next.config', () => {
  it('does not include dev.tsx pages when KITCHEN_SINK is unset', async () => {
    delete process.env.KITCHEN_SINK;
    const config = await loadConfig();
    expect(config.pageExtensions).toEqual(DEFAULTS);
    expect(config.pageExtensions).not.toContain('dev.tsx');
  });

  it('does not include dev.tsx pages for other KITCHEN_SINK values', async () => {
    process.env.KITCHEN_SINK = '0';
    const config = await loadConfig();
    expect(config.pageExtensions).not.toContain('dev.tsx');
  });

  it('includes dev.tsx pages when KITCHEN_SINK is 1', async () => {
    process.env.KITCHEN_SINK = '1';
    const config = await loadConfig();
    expect(config.pageExtensions).toEqual([...DEFAULTS, 'dev.tsx']);
  });

  it('hides the X-Powered-By header', async () => {
    const config = await loadConfig();
    expect(config.poweredByHeader).toBe(false);
  });
});
