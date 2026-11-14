import { expect } from '@playwright/test';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { expectNoA11yViolations, test, waitForIslands } from './fixtures';

// The Home hero, featured case-study cards and automation cards on the dev host, with the headline
// group forced (/kitchen-sink/home/a and /kitchen-sink/home/b). The cards are the tested element of
// the live experiment, so the two groups must have the same geometry: every card, headline,
// description, link and the cards region itself, and every block around them, sit at the same place
// with the same size, at every width, zoom and font state. Only which of the two headline strings is
// visible differs. Each featured card is one link (the card itself carries the click marker).

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
  // The load sequence is time-based: measure once it has finished (scroll-linked animations stay at their scroll position).
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.timeline instanceof DocumentTimeline).map((a) => a.finished.catch(() => undefined))));
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
      // The whole card is the link, so its box is the link's box.
      put(`${study}:link`, card.matches('[data-experiment-click="card"]') ? card : null);
      for (const twin of card.querySelectorAll('[data-headline-twin]')) put(`${study}:twin-${twin.getAttribute('data-headline-twin')}`, twin);
    }
    // Everything around the cards is identical in both groups.
    put('proof', document.querySelector('[data-home-proof]'));
    put('experiments', document.querySelector('[data-home-track="experiments"]'));
    put('automation', document.querySelector('[data-home-track="automation"]'));
    put('tiles', document.querySelector('[data-home-tiles]'));
    put('ribbon', document.querySelector('[data-home-ribbon]'));
    put('site', document.querySelector('[data-home-site]'));
    put('decision', document.querySelector('[data-home-decision]'));
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
    // The project's own emulation: scale, and the phone projects' mobile viewport and touch.
    const { deviceScaleFactor, isMobile, hasTouch, userAgent } = info.project.use;
    const emulation = { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent };
    for (const font of FONT_STATES) {
      const a = await open(browser, 'a', font, emulation);
      const b = await open(browser, 'b', font, emulation);
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
      // Each card is one link whose name starts with its shown headline; the hidden twin is in no name.
      await expect(region.getByRole('heading', { level: 3 })).toHaveCount(3);
      for (const name of shown) await expect(region.getByRole('heading', { level: 3, name, exact: true })).toHaveCount(1);
      for (const name of hidden) await expect(region.getByRole('heading', { name })).toHaveCount(0);
      for (const name of hidden) await expect(region.getByText(name, { exact: true })).toBeHidden();
      const links = region.locator('a[data-experiment-click="card"]');
      await expect(links).toHaveCount(3);
      for (let i = 0; i < 3; i++) {
        await expect(links.nth(i)).toHaveAccessibleName(new RegExp(`^${shown[i]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        for (const name of hidden) await expect(links.nth(i)).not.toHaveAccessibleName(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
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

  test('a card link is a next/link: a click asks the client router (an RSC request) for the same-origin page', async ({ page }) => {
    await page.goto(host('b'));
    await waitForIslands(page);
    const link = page.locator('[data-experiment-click="card"]').nth(1);
    await expect(link).toHaveAttribute('href', '/work/retention');
    const href = await link.evaluate((a) => (a as HTMLAnchorElement).href);
    expect(new URL(href).origin).toBe(new URL(page.url()).origin);
    // A plain <a> would make a document request; next/link fetches the route's RSC payload first.
    // The case-study page is a later page, so what comes back does not matter here.
    const rsc = page.waitForRequest(
      (r) => new URL(r.url()).pathname === '/work/retention' && r.headers()['rsc'] === '1' && r.resourceType() !== 'document',
    );
    await link.click();
    await rsc;
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

  test('phone fold at 375x812: the h1 is 44 px and the primary button is in view, with all three buttons reachable', async ({ browser }) => {
    for (const arm of ['a', 'b'] as const) {
      const page = await open(browser, arm, 'inter', { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
      const hero = page.locator('[data-hero]');
      await expect(hero.locator('h1')).toHaveCSS('font-size', '44px');
      await expect(hero.locator('h1')).toHaveText('I test what works, and automate the rest.');
      const primary = hero.getByRole('link', { name: 'See the evidence' });
      await expect(primary).toBeVisible();
      const box = (await primary.boundingBox())!;
      expect(box.y + box.height, 'the primary button is above the fold').toBeLessThanOrEqual(812);
      await expect(hero.getByRole('link')).toHaveText(['See the evidence', 'CV', 'Contact']);
      // The evidence field is decoration only: hidden from assistive technology.
      await expect(hero.locator('[data-depth-field]')).toHaveAttribute('aria-hidden', 'true');
      await page.context().close();
    }
  });

  test('See the evidence scrolls to the Experiments and analytics track', async ({ browser }) => {
    const page = await open(browser, 'a', 'inter', { viewport: { width: 1440, height: 900 } });
    await page.locator('[data-hero]').getByRole('link', { name: 'See the evidence' }).click();
    await expect(page).toHaveURL(/#work$/);
    await expect(page.locator('#work h2')).toHaveText('Experiments and analytics');
    await expect(page.locator('#work h2')).toBeInViewport();
    await page.context().close();
  });

  test('from 1024 px the text and the evidence field sit side by side, the field to the right of the text', async ({ browser }) => {
    for (const width of [1024, 1440]) {
      const page = await open(browser, 'a', 'inter', { viewport: { width, height: 900 } });
      const text = (await page.locator('[data-hero-text]').boundingBox())!;
      const field = (await page.locator('[data-hero] [data-depth-field]').boundingBox())!;
      expect(text.x + text.width, `${width} text left of the field`).toBeLessThanOrEqual(field.x + TOLERANCE);
      expect(text.x, `${width} text inside the page`).toBeGreaterThanOrEqual(0);
      expect(field.x + field.width, `${width} field inside the page`).toBeLessThanOrEqual(width + TOLERANCE);
      await page.context().close();
    }
  });
});

test.describe('Home reflow and focus', () => {
  for (const size of [{ width: 320, height: 568 }, { width: 320, height: 180 }]) {
    test(`at ${size.width}x${size.height} nothing scrolls sideways and every link and button shows its focus unclipped`, async ({ browser }) => {
      const page = await open(browser, 'b', 'inter', { viewport: size });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const targets = page.locator('[data-hero] a, [data-experiment="cards"] a, [data-home-track="automation"] a, [data-home-site] a, [data-home-decision] a');
      const count = await targets.count();
      // Three hero buttons, three cards, four automation cards, two site buttons, three decision buttons.
      expect(count).toBeGreaterThanOrEqual(3 + 3 + 4 + 2 + 3);
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

test.describe('Home automation track', () => {
  test('four cards after the experiments, each a link to its page, under the heading "Automation and agents"', async ({ page }) => {
    await page.goto(host('a'));
    const track = page.locator('[data-home-track="automation"]');
    await expect(track.getByRole('heading', { level: 2 })).toHaveText('Automation and agents');
    const links = track.getByRole('link');
    await expect(links).toHaveCount(4);
    await expect(links.locator('h3')).toHaveText(['Test-account automation', 'Docproof', 'n8n workflow library', 'MarketingWS']);
    expect(await links.evaluateAll((els) => els.map((a) => a.getAttribute('href')))).toEqual([
      '/work/audible#automation',
      '/work/docproof',
      '/work/n8n',
      '/work/marketingws',
    ]);
    await expect(track).toContainText('Tampermonkey with a step recorder');
    const cards = (await page.locator('[data-experiment="cards"]').boundingBox())!;
    const box = (await track.boundingBox())!;
    expect(box.y).toBeGreaterThan(cards.y + cards.height - TOLERANCE);
    // The automation cards are not the experiment's: no click marker, outside the cards region.
    await expect(track.locator('[data-experiment-click]')).toHaveCount(0);
    await expect(page.locator('[data-experiment="cards"] [data-home-track]')).toHaveCount(0);
  });
});
