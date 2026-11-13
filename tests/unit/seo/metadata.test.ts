// Canonical metadata, the route inventory, the sitemap and robots, and the sharing images.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { factText } from '@/lib/facts/text';
import { serverEnv } from '@/lib/env';
import { CanonicalOriginError, TEST_ORIGIN_HOST, canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { OG_HEIGHT, OG_WIDTH, ogAlt, ogHtml, themeFromTokens } from '@/lib/seo/og-template';
import { SITE } from '@/lib/site';
import { headlineText, HEADLINES } from '../../../content/home.ts';
import {
  HOME_SHARE_TITLE,
  OG_CARDS,
  SEO_EXCLUDED_ROUTES,
  SEO_PAGES,
  SITE_SHARING_HEADLINE,
  SITE_SHARING_LINE,
  ogCard,
  seoEntry,
  shareTitle,
} from '../../../content/seo.ts';
import { findOriginProblems, main as originCheck } from '../../../scripts/seo-origin-check.ts';
import { OG_LOCK_PATH, renderPlan } from '../../../scripts/og-render.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const APP = path.join(ROOT, 'src/app');

const VARS = ['VERCEL_ENV', 'VERCEL_PROJECT_PRODUCTION_URL', 'SEO_TEST_ORIGIN_HOST', 'CI'] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const name of VARS) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});
afterEach(() => {
  for (const name of VARS) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

function setEnv(values: Partial<Record<(typeof VARS)[number], string>>): void {
  for (const [name, value] of Object.entries(values)) process.env[name] = value;
}

/** The URL of every page file under src/app (page.dev.tsx, the kitchen sink, never ships). */
function pageRoutes(dir: string, segments: string[] = []): string[] {
  const routes: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_')) continue;
      const segment = /^\(.*\)$/.test(entry.name) ? [] : [entry.name];
      routes.push(...pageRoutes(path.join(dir, entry.name), [...segments, ...segment]));
    } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) {
      routes.push(`/${segments.join('/')}`);
    }
  }
  return routes;
}

/** The visitor's URL for a page file: the per-group Home page stands for /. */
const visitorRoute = (route: string) => (route === '/v/[arm]' ? '/' : route);
/** The page file's module for a visitor's URL. */
const pageModule = (route: string) => (route === '/' ? 'v/[arm]' : route.slice(1));

describe('canonicalOrigin', () => {
  it('gives the fixed test origin in a local build with no environment', () => {
    expect(TEST_ORIGIN_HOST).toBe('canonical.invalid');
    expect(canonicalOrigin().href).toBe('https://canonical.invalid/');
  });

  it('gives the fixed test origin in a CI-shaped build (CI=true, no VERCEL_ENV, no hostname)', () => {
    setEnv({ CI: 'true' });
    expect(canonicalOrigin().href).toBe('https://canonical.invalid/');
  });

  it('ignores the production hostname outside production', () => {
    setEnv({ VERCEL_ENV: 'preview', VERCEL_PROJECT_PRODUCTION_URL: 'site.example.com' });
    expect(canonicalOrigin().href).toBe('https://canonical.invalid/');
  });

  it('gives the test override host in a preview', () => {
    setEnv({ VERCEL_ENV: 'preview', SEO_TEST_ORIGIN_HOST: 'Preview.Example.test' });
    expect(canonicalOrigin().href).toBe('https://preview.example.test/');
  });

  it('refuses a test override that is not a bare hostname', () => {
    for (const bad of ['https://a.example.test', 'a.example.test/x', 'a.example.test:8080', 'localhost']) {
      process.env.SEO_TEST_ORIGIN_HOST = bad;
      expect(() => canonicalOrigin(), bad).toThrow(CanonicalOriginError);
      expect(() => canonicalOrigin(), bad).toThrow(/SEO_TEST_ORIGIN_HOST/);
    }
  });

  it('gives https:// plus the validated production hostname in production', () => {
    setEnv({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'Site-1.Example.com' });
    expect(canonicalOrigin().href).toBe('https://site-1.example.com/');
  });

  it('rejects a scheme, path, port or anything else that is not a bare hostname in production', () => {
    process.env.VERCEL_ENV = 'production';
    for (const bad of [
      'https://site.example.com',
      'site.example.com/',
      'site.example.com/path',
      'site.example.com:443',
      'user@site.example.com',
      'site.example.com?x=1',
      'site .example.com',
      '-site.example.com',
      'site.example.com.',
      'localhost',
      '192.168.0.1',
    ]) {
      process.env.VERCEL_PROJECT_PRODUCTION_URL = bad;
      expect(() => canonicalOrigin(), bad).toThrow(CanonicalOriginError);
      expect(() => canonicalOrigin(), bad).toThrow(/VERCEL_PROJECT_PRODUCTION_URL/);
    }
  });

  it('fails with the named error in production when the hostname is missing', () => {
    setEnv({ VERCEL_ENV: 'production' });
    let caught: unknown;
    try {
      canonicalOrigin();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CanonicalOriginError);
    expect((caught as Error).name).toBe('CanonicalOriginError');
    expect((caught as Error).message).toMatch(/VERCEL_PROJECT_PRODUCTION_URL is missing/);
  });

  it('refuses the test override in production, even next to a valid hostname', () => {
    setEnv({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'site.example.com', SEO_TEST_ORIGIN_HOST: 'a.example.test' });
    expect(() => canonicalOrigin()).toThrow(CanonicalOriginError);
    expect(() => canonicalOrigin()).toThrow(/SEO_TEST_ORIGIN_HOST/);
  });

  it('refuses a .invalid host in production', () => {
    process.env.VERCEL_ENV = 'production';
    for (const host of ['canonical.invalid', 'site.INVALID']) {
      process.env.VERCEL_PROJECT_PRODUCTION_URL = host;
      expect(() => canonicalOrigin(), host).toThrow(CanonicalOriginError);
    }
  });

  it('reads the variables through serverEnv, which lists the override', () => {
    process.env.SEO_TEST_ORIGIN_HOST = 'a.example.test';
    expect(serverEnv().seoTestOriginHost).toBe('a.example.test');
    expect(fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8')).toMatch(/^SEO_TEST_ORIGIN_HOST=$/m);
  });
});

describe('noTestOriginInProduction', () => {
  const CANONICAL = 'site.example.com';
  const page = (head: string) => ({ path: 'server/app/lab.html', text: `<!DOCTYPE html><html><head>${head}</head><body></body></html>` });
  const good =
    '<link rel="canonical" href="https://site.example.com/lab"/>' +
    '<meta property="og:url" content="https://site.example.com/lab"/>' +
    '<meta property="og:image" content="https://site.example.com/og/site.png"/>' +
    '<meta name="twitter:image" content="https://site.example.com/og/site.png"/>';

  it('passes a production output that names only the canonical origin', () => {
    expect(findOriginProblems([page(good), { path: 'server/app/robots.txt.body', text: 'Sitemap: https://site.example.com/sitemap.xml\n' }], CANONICAL)).toEqual([]);
  });

  it('fails a production output that contains the test origin anywhere', () => {
    const problems = findOriginProblems([page(good.replaceAll('site.example.com', 'canonical.invalid'))], CANONICAL);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toMatch(/canonical\.invalid/);
    expect(findOriginProblems([page(`${good}<p>see https://x.invalid/</p>`)], CANONICAL)).not.toEqual([]);
  });

  it('fails a canonical, og:url, og:image or twitter:image on any other origin', () => {
    for (const other of [
      '<link rel="canonical" href="https://elsewhere.example.org/lab"/>',
      '<meta property="og:url" content="http://site.example.com/lab"/>',
      '<meta property="og:image" content="/og/site.png"/>',
      '<meta name="twitter:image" content="https://elsewhere.example.org/og/site.png"/>',
    ]) {
      expect(findOriginProblems([page(other)], CANONICAL), other).not.toEqual([]);
    }
  });

  it('reads only the sitemap locations and the robots Sitemap line, not the XML namespace', () => {
    const sitemap =
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url>\n<loc>https://site.example.com/</loc>\n</url>\n</urlset>';
    expect(findOriginProblems([{ path: 'server/app/sitemap.xml.body', text: sitemap }], CANONICAL)).toEqual([]);
  });

  it('fails a sitemap or robots file that names another origin', () => {
    const sitemap = '<urlset><url><loc>https://elsewhere.example.org/lab</loc></url></urlset>';
    expect(findOriginProblems([{ path: 'server/app/sitemap.xml.body', text: sitemap }], CANONICAL)).not.toEqual([]);
    expect(findOriginProblems([{ path: 'server/app/robots.txt.body', text: 'Sitemap: https://canonical.invalid/sitemap.xml' }], CANONICAL)).not.toEqual([]);
  });

  it('fails a page with more than one canonical link', () => {
    expect(findOriginProblems([page(good + '<link rel="canonical" href="https://site.example.com/"/>')], CANONICAL)).not.toEqual([]);
  });

  it('exits 1 on a fixture build output with the test origin, 0 on a clean one, 2 without --canonical', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-origin-'));
    try {
      const app = path.join(dir, 'server/app');
      fs.mkdirSync(app, { recursive: true });
      fs.writeFileSync(path.join(app, 'lab.html'), page(good).text);
      const quiet = { log: () => {}, error: () => {} };
      expect(originCheck(['--canonical', CANONICAL, '--dir', dir], quiet)).toBe(0);
      fs.writeFileSync(path.join(app, 'index.html'), page(good.replaceAll('site.example.com', 'canonical.invalid')).text);
      expect(originCheck(['--canonical', CANONICAL, '--dir', dir], quiet)).toBe(1);
      expect(originCheck(['--dir', dir], quiet)).toBe(2);
      expect(originCheck(['--canonical', 'canonical.invalid', '--dir', dir], quiet)).toBe(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('route inventory', () => {
  it('the manifest is exactly the shipped pages minus the excluded ones', () => {
    const shipped = pageRoutes(APP).map(visitorRoute);
    const indexable = shipped.filter((route) => !SEO_EXCLUDED_ROUTES.includes(route)).sort();
    expect(SEO_PAGES.map((entry) => entry.path).sort()).toEqual(indexable);
  });

  it('excludes /exclude and /demo, and no excluded route has an entry', () => {
    expect(SEO_EXCLUDED_ROUTES).toEqual(expect.arrayContaining(['/exclude', '/demo']));
    for (const route of SEO_EXCLUDED_ROUTES) expect(SEO_PAGES.some((entry) => entry.path === route)).toBe(false);
  });

  it('has one complete entry per path, with a sharing image that exists', () => {
    const paths = SEO_PAGES.map((entry) => entry.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const entry of SEO_PAGES) {
      expect(entry.path, entry.path).toMatch(/^\/[a-z0-9/-]*$/);
      expect(entry.title.trim(), entry.path).not.toBe('');
      expect(entry.description.trim(), entry.path).not.toBe('');
      expect(entry.imageAlt.trim(), entry.path).not.toBe('');
      expect(entry.image, entry.path).toMatch(/^\/og\/[a-z0-9-]+\.png$/);
      expect(fs.existsSync(path.join(ROOT, 'public', entry.image)), entry.image).toBe(true);
      expect(seoEntry(entry.path)).toBe(entry);
    }
    expect(() => seoEntry('/no-such-page')).toThrow();
  });

  it.each(SEO_PAGES.map((entry) => [entry.path] as const))('%s exports the manifest metadata for the canonical origin', async (route) => {
    const mod = (await import(`@/app/${pageModule(route)}/page`)) as { metadata?: unknown; generateMetadata?: unknown };
    expect(mod.generateMetadata).toBeUndefined();
    expect(mod.metadata).toEqual(pageMetadata(seoEntry(route), canonicalOrigin()));
  });

  it('keeps each page title equal to the title its page prints', async () => {
    const { LAB_TITLE } = await import('@/components/lab/LabPage');
    const { DOCPROOF_TITLE } = await import('@/components/docproof/DocproofPage');
    const { MARKETINGWS_TITLE } = await import('@/components/marketingws/MarketingwsPage');
    const { RETENTION_TITLE } = await import('@/components/retention/RetentionPage');
    const { WEATHER_TITLE } = await import('../../../content/weather');
    const { N8N_TITLE } = await import('../../../content/n8n');
    const { PRIVACY } = await import('../../../content/privacy');
    expect(seoEntry('/').title).toBe(SITE.name);
    expect(seoEntry('/lab').title).toBe(LAB_TITLE);
    expect(seoEntry('/work/docproof').title).toBe(DOCPROOF_TITLE);
    expect(seoEntry('/work/marketingws').title).toBe(MARKETINGWS_TITLE);
    expect(seoEntry('/work/retention').title).toBe(RETENTION_TITLE);
    expect(seoEntry('/work/weather').title).toBe(WEATHER_TITLE);
    expect(seoEntry('/work/n8n').title).toBe(N8N_TITLE);
    expect(seoEntry('/privacy').title).toBe(PRIVACY.title);
  });

  it('keeps /exclude out of search', async () => {
    const mod = (await import('@/app/exclude/page')) as { metadata: { robots?: { index?: boolean } } };
    expect(mod.metadata.robots?.index).toBe(false);
  });
});

describe('canonicalAndRobots', () => {
  const origin = new URL('https://site.example.com');

  it('gives one absolute canonical, title, description, Open Graph and Twitter fields, and the 1200 x 630 image', () => {
    for (const entry of SEO_PAGES) {
      const m = pageMetadata(entry, origin);
      const url = `https://site.example.com${entry.path}`;
      const image = `https://site.example.com${entry.image}`;
      expect(String(m.metadataBase)).toBe('https://site.example.com/');
      expect(m.title).toBe(entry.title);
      expect(m.description).toBe(entry.description);
      expect(m.alternates).toEqual({ canonical: url });
      expect(m.openGraph).toEqual({
        type: 'website',
        siteName: SITE.name,
        url,
        title: shareTitle(entry),
        description: entry.description,
        images: [{ url: image, width: OG_WIDTH, height: OG_HEIGHT, alt: entry.imageAlt, type: 'image/png' }],
      });
      expect(m.twitter).toEqual({
        card: 'summary_large_image',
        title: shareTitle(entry),
        description: entry.description,
        images: [{ url: image, alt: entry.imageAlt }],
      });
      // Indexable: no robots field, so nothing can noindex a public page (Home included).
      expect(m.robots).toBeUndefined();
      expect(JSON.stringify(m)).not.toMatch(/noindex|canonical\.invalid/);
    }
  });

  it('the same Home metadata serves both groups: canonical / and indexable', async () => {
    const mod = (await import('@/app/v/[arm]/page')) as { metadata: ReturnType<typeof pageMetadata> };
    expect(mod.metadata.alternates?.canonical).toBe(new URL('/', canonicalOrigin()).href);
    expect(mod.metadata.robots).toBeUndefined();
  });

  it('the sitemap lists every manifest page on the canonical origin and nothing internal', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const urls = sitemap().map((item) => item.url);
    expect(urls).toEqual(SEO_PAGES.map((entry) => new URL(entry.path, canonicalOrigin()).href));
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\/canonical\.invalid\//);
      expect(url).not.toMatch(/[?#]|\/api\/|\/v\/|kitchen-sink|\/exclude|\/demo|data\.json/);
    }
  });

  it('robots allows the site, keeps the API out and names the sitemap', async () => {
    const { default: robots } = await import('@/app/robots');
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/api/'] },
      sitemap: 'https://canonical.invalid/sitemap.xml',
    });
  });

  it('metadata, sitemap and robots read no request or snapshot API', () => {
    const files = ['src/lib/seo/metadata.ts', 'src/app/sitemap.ts', 'src/app/robots.ts', 'content/seo.ts', 'src/app/layout.tsx'];
    for (const file of files) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(source, file).not.toMatch(/next\/headers|cookies\(|headers\(|connection\(|searchParams|getExperimentSnapshot|draftMode|'use cache'/);
    }
  });
});

describe('sharingTemplate', () => {
  const tokens = fs.readFileSync(path.join(ROOT, 'src/styles/tokens.css'), 'utf8');
  const theme = themeFromTokens(tokens);

  it('the site card is the approved text: headline, role line and name, with no figure', () => {
    const card = ogCard('site');
    expect(SITE_SHARING_HEADLINE).toBe('Data, experimentation, AI and automation');
    expect(card.title).toBe(SITE_SHARING_HEADLINE);
    expect(SITE_SHARING_LINE).toBe(
      'Experimentation and growth analyst in Berlin. A/B testing, clear statistics and automation that removes manual work.',
    );
    expect(card.sub).toBe(SITE_SHARING_LINE);
    expect(card.footer).toBe(SITE.name);
    expect(card.proof).toBeUndefined();
    expect(card.factIds).toEqual([]);
    expect(JSON.stringify(card)).not.toMatch(/\d|market|AI-powered|passionate|rockstar/i);
  });

  it('the Home link preview has its own title; other pages add the name to theirs', () => {
    expect(HOME_SHARE_TITLE).toBe('Mahmoud El Bergui: data, experimentation, AI and automation');
    expect(shareTitle(seoEntry('/'))).toBe(HOME_SHARE_TITLE);
    expect(shareTitle(seoEntry('/lab'))).toBe('Lab | Mahmoud El Bergui');
    const home = pageMetadata(seoEntry('/'), new URL('https://site.example.com'));
    expect(home.title).toBe(SITE.name);
    expect((home.openGraph as { title?: string }).title).toBe(HOME_SHARE_TITLE);
    expect((home.twitter as { title?: string }).title).toBe(HOME_SHARE_TITLE);
  });

  it('a case card states its finding in 60 characters or fewer, from the frozen headlines', () => {
    const cases = OG_CARDS.filter((card) => card.variant === 'case');
    expect(cases.map((card) => card.name).sort()).toEqual(['audible', 'pulse', 'retention']);
    for (const card of cases) {
      const headline = HEADLINES.find((h) => h.study === card.name);
      expect(card.title, card.name).toBe(headlineText(headline!.b));
      expect(card.title.length, card.title).toBeLessThanOrEqual(60);
      expect(card.footer).toBe(SITE.name);
      expect(card.proof).toBeUndefined();
    }
  });

  it('every entry image and alt text comes from its card', () => {
    for (const entry of SEO_PAGES) {
      const card = OG_CARDS.find((c) => `/og/${c.name}.png` === entry.image);
      expect(card, entry.path).toBeDefined();
      expect(entry.imageAlt).toBe(ogAlt(card!));
      expect(entry.factIds).toEqual(card!.factIds);
    }
  });

  it('reads its colours from tokens.css', () => {
    const value = (name: string) => new RegExp(`--color-${name}:\\s*([^;]+);`).exec(tokens)![1]!.trim();
    expect(theme).toEqual({
      bg: value('bg'),
      ink: value('ink'),
      muted: value('muted'),
      line: value('line'),
      series1: value('series-1'),
      series2: value('series-2'),
    });
    expect(() => themeFromTokens(':root{}')).toThrow();
  });

  it('draws the approved layout with local assets only and no host', () => {
    for (const card of OG_CARDS) {
      const html = ogHtml(card, theme, 'data:font/woff2;base64,AAAA');
      expect(html).toMatch(/width:\s*1200px/);
      expect(html).toMatch(/height:\s*630px/);
      expect(html).toMatch(/padding:\s*72px 80px/);
      expect(html).toMatch(/h1\{[^}]*font-size:\s*80px/);
      expect(html).toMatch(/\.sub\{[^}]*font-size:\s*32px/);
      expect(html).toMatch(/\.foot\{[^}]*font-size:\s*24px/);
      expect(html).toMatch(/\.glyph\{[^}]*width:\s*96px;\s*height:\s*16px/);
      // No remote asset and no address: the only URL is the embedded font.
      expect(html.match(/(?:https?:)?\/\/[^\s"')]+/g) ?? []).toEqual([]);
      expect(html).not.toMatch(/vercel\.app|\.invalid|elbergui\./i);
      // The only colours are the token values.
      const hexes = new Set(html.match(/#[0-9a-f]{3,8}\b/gi) ?? []);
      for (const hex of hexes) expect(Object.values(theme)).toContain(hex);
    }
    const site = ogHtml(ogCard('site'), theme, 'data:,');
    expect(site).toContain('<h1>Data, experimentation, AI and automation</h1>');
    expect(site).toContain('<div class="foot">Mahmoud El Bergui</div>');
    expect(site).not.toContain('class="sub proof"');
    const proof = { strong: `${factText('profile.audible.experiments')} A/B tests`, rest: ' across web and mobile' };
    expect(ogHtml({ ...ogCard('site'), proof }, theme, 'data:,')).toContain(
      `<p class="sub proof"><strong>${proof.strong}</strong> across web and mobile</p>`,
    );
    expect(ogHtml({ ...ogCard('audible'), title: '<b>&' }, theme, 'data:,')).toContain('&lt;b&gt;&amp;');
  });

  it('the committed PNGs are the 1200 x 630 output of the current generator input', () => {
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT, OG_LOCK_PATH), 'utf8')) as {
      inputHash: string;
      images: Record<string, { sha256: string; width: number; height: number }>;
    };
    const plan = renderPlan(ROOT);
    expect(lock.inputHash).toBe(plan.inputHash);
    expect(Object.keys(lock.images).sort()).toEqual(OG_CARDS.map((card) => `${card.name}.png`).sort());
    const committed = fs.readdirSync(path.join(ROOT, 'public/og')).filter((f) => f.endsWith('.png')).sort();
    expect(committed).toEqual(Object.keys(lock.images).sort());
    for (const [file, meta] of Object.entries(lock.images)) {
      const png = fs.readFileSync(path.join(ROOT, 'public/og', file));
      expect(png.subarray(0, 8).toString('hex'), file).toBe('89504e470d0a1a0a');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], file).toEqual([OG_WIDTH, OG_HEIGHT]);
      expect(meta).toEqual({ sha256: createHash('sha256').update(png).digest('hex'), width: OG_WIDTH, height: OG_HEIGHT });
    }
  });
});
