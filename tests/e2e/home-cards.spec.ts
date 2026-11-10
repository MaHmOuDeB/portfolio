import { expect } from '@playwright/test';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { expectNoA11yViolations, test, waitForIslands } from './fixtures';

// The Home hero, featured case-study cards and tools on the dev host, with the headline group forced
// (/kitchen-sink/home/a and /kitchen-sink/home/b). The cards are the tested element of the live
// experiment, so the two groups must have the same geometry: every card, headline, description,
// link and the cards region itself sit at the same place with the same size, at every width, zoom
// and font state. Only which of the two headline strings is visible differs.

type Arm = 'a' | 'b';
const host = (arm: Arm) => `/kitchen-sink/home/${arm}`;
const STUDIES = ['audible', 'retention', 'pulse'] as const;
const TOLERANCE = 1;

/** The matrix sizes; 320 x 180 is 1280 x 720 at 400% zoom, 1024 x 576 is 1280 x 720 at 125%. */
const SIZES = [
  { width: 320, height: 180 },
  { width: 360, height: 800 },
  { width: 375, height: 667 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 576 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
] as const;

/**
 * Font states: Inter as loaded; the fallback font (Inter blocked, as on a slow or failed font load);
 * and a larger default text size (24 px root, as a reader's browser text setting gives).
 */
const FONT_STATES = ['inter', 'fallback', 'large-text'] as const;
type FontState = (typeof FONT_STATES)[number];

type Rect = { x: number; y: number; width: number; height: number };
type Geometry = Record<string, Rect>;

async function open(browser: Browser, arm: Arm, font: FontState, options: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  if (font === 'fallback') await page.route('**/*.woff2', (route) => route.abort());
  await page.goto(host(arm));
  if (font === 'large-text') await page.evaluate(() => (document.documentElement.style.fontSize = '24px'));
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await waitForIslands(page);
  return page;
}

/** Every measured box, in page coordinates (scroll position added), keyed by what it is. */
async function geometry(page: Page): Promise<Geometry> {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(() => {
    const out: Record<string, { x: number; y: number; width: number; height: number }> = {};
    const put = (key: string, el: Element | null) => {
      if (el === null) throw new Error(`missing ${key}`);
      const r = el.getBoundingClientRect();
      out[key] = { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
    };
    put('region', document.querySelector('[data-experiment="cards"]'));
    put('hero', document.querySelector('[data-hero]'));
    for (const card of document.querySelectorAll('[data-case-card]')) {
      const study = card.getAttribute('data-case-card');
      put(`${study}:card`, card);
      put(`${study}:headline`, card.querySelector('[data-case-headline]'));
      put(`${study}:description`, card.querySelector('[data-case-description]'));
      put(`${study}:link`, card.querySelector('[data-experiment-click="card"]'));
      for (const twin of card.querySelectorAll('[data-headline-twin]')) put(`${study}:twin-${twin.getAttribute('data-headline-twin')}`, twin);
    }
    put('tools', document.querySelector('[data-home-tools]'));
    return out;
  });
}

function expectSameGeometry(a: Geometry, b: Geometry, label: string) {
  expect(Object.keys(b).sort(), label).toEqual(Object.keys(a).sort());
  for (const key of Object.keys(a)) {
    for (const side of ['x', 'y', 'width', 'height'] as const) {
      const diff = Math.abs(a[key]![side] - b[key]![side]);
      expect(diff, `${label} ${key}.${side}: group A ${a[key]![side]}, group B ${b[key]![side]}`).toBeLessThanOrEqual(TOLERANCE);
    }
  }
  for (const study of STUDIES) {
    expect(a[`${study}:card`]!.height, `${label} ${study} card`).toBeGreaterThan(0);
    expect(a[`${study}:link`]!.height, `${label} ${study} link`).toBeGreaterThanOrEqual(44 - TOLERANCE);
  }
  expect(a.region!.height, `${label} region`).toBeGreaterThan(0);
}

/** Complete text: no ellipsis, no clamp, nothing cut off, and both twins inside their own cell. */
async function expectCompleteHeadlines(page: Page, label: string) {
  const report = await page.evaluate(() =>
    [...document.querySelectorAll('[data-case-headline]')].map((h) => {
      const cs = getComputedStyle(h);
      const cell = h.getBoundingClientRect();
      const twins = [...h.querySelectorAll('[data-headline-twin]')].map((t) => {
        const s = getComputedStyle(t);
        const r = t.getBoundingClientRect();
        return {
          overflow: s.textOverflow,
          clamp: s.getPropertyValue('-webkit-line-clamp'),
          clipped: t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1,
          inside: r.top >= cell.top - 1 && r.bottom <= cell.bottom + 1 && r.left >= cell.left - 1 && r.right <= cell.right + 1,
          top: r.top - cell.top,
        };
      });
      return { overflow: cs.overflow, clamp: cs.getPropertyValue('-webkit-line-clamp'), twins };
    }),
  );
  expect(report, label).toHaveLength(3);
  for (const h of report) {
    expect(h.overflow, label).toBe('visible');
    expect(['none', ''], label).toContain(h.clamp);
    for (const t of h.twins) {
      expect(t.overflow, label).not.toBe('ellipsis');
      expect(['none', ''], label).toContain(t.clamp);
      expect(t.clipped, label).toBe(false);
      expect(t.inside, label).toBe(true);
      // The same grid cell: both strings start at the top of the headline area.
      expect(Math.abs(t.top), label).toBeLessThanOrEqual(TOLERANCE);
    }
  }
}

test.describe('Home cards: equal geometry across forced groups', () => {
  test('@matrix every card, headline, description, link and the region match in both groups, in every font state', async ({ browser }, info) => {
    test.setTimeout(120_000);
    const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
    const deviceScaleFactor = info.project.use.deviceScaleFactor;
    for (const font of FONT_STATES) {
      const a = await open(browser, 'a', font, { viewport, deviceScaleFactor });
      const b = await open(browser, 'b', font, { viewport, deviceScaleFactor });
      const label = `${viewport.width}x${viewport.height} ${font}`;
      expectSameGeometry(await geometry(a), await geometry(b), label);
      await expectCompleteHeadlines(a, `${label} group A`);
      await expectCompleteHeadlines(b, `${label} group B`);
      await a.context().close();
      await b.context().close();
    }
  });

  test('the whole size matrix (including 400% zoom) matches in both groups, in every font state', async ({ browser }, info) => {
    test.setTimeout(240_000);
    test.skip(info.project.name !== 'desktop-chromium' && info.project.name !== 'desktop-webkit', 'one sweep per engine');
    for (const font of FONT_STATES) {
      const a = await open(browser, 'a', font, { viewport: SIZES[0] });
      const b = await open(browser, 'b', font, { viewport: SIZES[0] });
      for (const size of SIZES) {
        await a.setViewportSize(size);
        await b.setViewportSize(size);
        const label = `${size.width}x${size.height} ${font}`;
        expectSameGeometry(await geometry(a), await geometry(b), label);
        await expectCompleteHeadlines(a, `${label} group A`);
        await expectCompleteHeadlines(b, `${label} group B`);
      }
      await a.context().close();
      await b.context().close();
    }
  });
});

test.describe('Home cards: the region and its links', () => {
  for (const arm of ['a', 'b'] as const) {
    test(`group ${arm}: the region is populated, reachable and at least half visible at 375x812`, async ({ browser }) => {
      const page = await open(browser, arm, 'inter', { viewport: { width: 375, height: 812 } });
      const region = page.locator('[data-experiment="cards"]');
      await expect(region).toHaveAttribute('aria-label', 'Featured case studies');
      await expect(page.getByRole('region', { name: 'Featured case studies' })).toBeVisible();
      await expect(region.locator('[data-experiment-click="card"]')).toHaveCount(3);
      const box = (await region.boundingBox())!;
      expect(box.height).toBeGreaterThan(0);
      // Scrolled so the region starts at the top of the screen, at least half of it is in view.
      await page.evaluate(() => {
        const el = document.querySelector('[data-experiment="cards"]')!;
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY);
      });
      const share = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const el = document.querySelector('[data-experiment="cards"]')!;
            const io = new IntersectionObserver((records) => {
              io.disconnect();
              resolve(records[0]!.intersectionRatio);
            });
            io.observe(el);
          }),
      );
      expect(share).toBeGreaterThanOrEqual(0.5);
      await page.context().close();
    });

    test(`group ${arm}: the selected headline is the only one announced, and each card has one focus stop`, async ({ browser, browserName }) => {
      const page = await open(browser, arm, 'inter', { viewport: { width: 1440, height: 900 } });
      const region = page.getByRole('region', { name: 'Featured case studies' });
      const shown = arm === 'a'
        ? ['How I run experiments', 'Customer retention and reactivation analysis', 'Pulse: analytics instrumentation demo']
        : ['Most tests pitted personalisation against plain baselines', 'Reversed orders turned 2% returns growth into 29%', '7 events, each designed to answer a product question'];
      const hidden = arm === 'a'
        ? ['Most tests pitted personalisation against plain baselines', '7 events, each designed to answer a product question']
        : ['How I run experiments', 'Pulse: analytics instrumentation demo'];
      // Accessible names, not textContent: the hidden twin is in the DOM but never announced.
      await expect(region.getByRole('heading', { level: 2 })).toHaveCount(3);
      for (const name of shown) await expect(region.getByRole('heading', { level: 2, name, exact: true })).toHaveCount(1);
      for (const name of hidden) await expect(region.getByRole('heading', { name })).toHaveCount(0);
      for (const name of hidden) await expect(region.getByText(name, { exact: true })).toBeHidden();
      const links = region.getByRole('link', { name: 'Read the case study' });
      await expect(links).toHaveCount(3);
      for (let i = 0; i < 3; i++) await expect(links.nth(i)).toHaveAccessibleDescription(shown[i]!);
      // Tab from the region's first link: three stops, then out of the region.
      await links.first().focus();
      const stops: string[] = [];
      for (let i = 0; i < 3; i++) {
        stops.push(await page.evaluate(() => document.activeElement?.getAttribute('href') ?? ''));
        // WebKit moves between links with Option+Tab (its default "Tab highlights each item" is off).
        await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
      }
      expect(stops).toEqual(['/work/audible#why-so-many', '/work/retention', '/work/pulse']);
      expect(await page.evaluate(() => document.activeElement?.closest('[data-experiment="cards"]') === null)).toBe(true);
      await page.context().close();
    });
  }

  test('a card link is a real next/link: a click navigates on the same origin', async ({ page }) => {
    await page.goto(host('b'));
    const link = page.locator('[data-experiment-click="card"]').nth(1);
    await expect(link).toHaveAttribute('href', '/work/retention');
    const href = await link.evaluate((a) => (a as HTMLAnchorElement).href);
    expect(new URL(href).origin).toBe(new URL(page.url()).origin);
  });

  test('the cards stack below lg and sit in three columns with aligned links at lg', async ({ browser }) => {
    for (const [width, columns] of [[768, 1], [1024, 3], [1440, 3]] as const) {
      const page = await open(browser, 'a', 'inter', { viewport: { width, height: 900 } });
      const g = await geometry(page);
      const xs = new Set(STUDIES.map((s) => Math.round(g[`${s}:card`]!.x)));
      expect(xs.size, `${width}`).toBe(columns);
      if (columns === 3) {
        const linkYs = STUDIES.map((s) => g[`${s}:link`]!.y);
        expect(Math.max(...linkYs) - Math.min(...linkYs), `${width} links aligned`).toBeLessThanOrEqual(TOLERANCE);
        const headTops = STUDIES.map((s) => g[`${s}:headline`]!.y);
        expect(Math.max(...headTops) - Math.min(...headTops), `${width} headlines aligned`).toBeLessThanOrEqual(TOLERANCE);
      }
      await page.context().close();
    }
  });

  test('axe finds no violations in either group', async ({ page }) => {
    for (const arm of ['a', 'b'] as const) {
      await page.goto(host(arm));
      await waitForIslands(page);
      await expectNoA11yViolations(page);
    }
  });
});

test.describe('Home hero', () => {
  test('is identical in both groups, at phone and desktop widths', async ({ browser }) => {
    for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
      const html: string[] = [];
      for (const arm of ['a', 'b'] as const) {
        const page = await open(browser, arm, 'inter', { viewport });
        html.push(await page.locator('[data-hero]').evaluate((el) => el.outerHTML));
        await page.context().close();
      }
      expect(html[1]).toBe(html[0]);
    }
  });

  test('phone fold at 375x812: the name is 44 px, the role 20 px, and the planner title and readout are in view', async ({ browser }) => {
    for (const arm of ['a', 'b'] as const) {
      const page = await open(browser, arm, 'inter', { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
      const hero = page.locator('[data-hero]');
      await expect(hero.locator('h1')).toHaveCSS('font-size', '44px');
      await expect(hero.locator('[data-hero-role]')).toHaveCSS('font-size', '20px');
      const title = hero.locator('figure[data-figure="hero-planner"] h2');
      const readout = hero.locator('figure[data-figure="hero-planner"] [data-figure-lead] [data-planner-n]');
      for (const el of [title, readout]) {
        await expect(el).toBeVisible();
        const box = (await el.boundingBox())!;
        expect(box.y + box.height, await el.innerText()).toBeLessThanOrEqual(812);
      }
      // The CV link is in the header on phones, not repeated in the hero.
      await expect(hero.getByRole('link', { name: 'CV (PDF)' })).toBeHidden();
      await expect(page.locator('[data-site-header]').getByRole('link', { name: 'CV (PDF)' })).toBeVisible();
      await expect(hero.getByRole('link', { name: 'LinkedIn' })).toBeVisible();
      await page.context().close();
    }
  });

  test('from 1024 px the name runs on one line across the page, with identity and evidence split 7/5', async ({ browser }) => {
    for (const width of [1024, 1440]) {
      const page = await open(browser, 'a', 'inter', { viewport: { width, height: 900 } });
      const hero = page.locator('[data-hero]');
      const h1 = hero.locator('h1');
      const lineHeight = await h1.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
      const name = (await h1.boundingBox())!;
      expect(name.height, `${width} one line`).toBeLessThanOrEqual(lineHeight + TOLERANCE);
      const columns = (await hero.locator('[data-hero-columns]').boundingBox())!;
      expect(Math.abs(name.width - columns.width), `${width} full width`).toBeLessThanOrEqual(TOLERANCE);
      const identity = (await hero.locator('[data-hero-identity]').boundingBox())!;
      const evidence = (await hero.locator('[data-hero-evidence]').boundingBox())!;
      expect(identity.x + identity.width, `${width} identity left of evidence`).toBeLessThan(evidence.x);
      const gap = await hero.locator('[data-hero-columns]').evaluate((el) => parseFloat(getComputedStyle(el).columnGap));
      const unit = (columns.width - 11 * gap) / 12;
      expect(Math.abs(identity.width - (7 * unit + 6 * gap)), `${width} seven columns`).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(evidence.width - (5 * unit + 4 * gap)), `${width} five columns`).toBeLessThanOrEqual(TOLERANCE);
      await expect(hero.getByRole('link', { name: 'CV (PDF)' })).toBeVisible();
      await page.context().close();
    }
  });
});

test.describe('Home reflow and focus', () => {
  for (const size of [{ width: 320, height: 568 }, { width: 320, height: 180 }]) {
    test(`at ${size.width}x${size.height} nothing scrolls sideways and every link and button shows its focus unclipped`, async ({ browser }) => {
      const page = await open(browser, 'b', 'inter', { viewport: size });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const targets = page.locator('[data-hero] a, [data-experiment="cards"] a, [data-home-tools] a');
      const count = await targets.count();
      expect(count).toBeGreaterThanOrEqual(3 + 3 + 3);
      for (let i = 0; i < count; i++) {
        const target = targets.nth(i);
        if (!(await target.isVisible())) continue;
        await target.focus();
        const check = await target.evaluate((el) => {
          const r = el.getBoundingClientRect();
          let clippedBy: string | null = null;
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const s = getComputedStyle(p);
            if ([s.overflow, s.overflowX, s.overflowY].some((o) => o === 'hidden' || o === 'clip')) clippedBy = p.tagName;
          }
          return {
            outline: getComputedStyle(el).outlineStyle,
            inView: r.left >= 0 && r.right <= document.documentElement.clientWidth + 1,
            clippedBy,
            height: r.height,
          };
        });
        expect(check.outline, `link ${i}`).not.toBe('none');
        expect(check.inView, `link ${i}`).toBe(true);
        expect(check.clippedBy, `link ${i}`).toBeNull();
      }
      await page.context().close();
    });
  }
});

test.describe('Home tools', () => {
  test('three rows after the cards, each tool named by a link to its page', async ({ page }) => {
    await page.goto(host('a'));
    const tools = page.getByRole('region', { name: "Tools I've built" });
    await expect(tools.getByRole('heading', { level: 2 })).toHaveText("Tools I've built");
    await expect(tools.getByRole('link')).toHaveText(['Test-account automation', 'Docproof', 'MarketingWS']);
    await expect(tools).toContainText('Tampermonkey with a step recorder');
    const cards = (await page.locator('[data-experiment="cards"]').boundingBox())!;
    const box = (await tools.boundingBox())!;
    expect(box.y).toBeGreaterThan(cards.y + cards.height);
  });
});
