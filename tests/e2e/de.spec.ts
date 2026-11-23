// The German site in a browser: its own 404, the language links and the Menu's two rows, then every
// German page (loads, language round trip, Figure controls) and the German contact form, with and
// without JavaScript. The contact form sends to the fake Resend endpoint on the loopback fake store
// (scripts/fake-upstash.ts), as contact.spec.ts does, so nothing reaches a real service.
import { expect, type Page } from '@playwright/test';
import { DE_PAGES } from '../../src/lib/i18n/pages';
import { E2E_CONTACT_TO, E2E_FAKE_UPSTASH_URL } from './constants';
import { test } from './fixtures';
import { useEveryControl } from './use-controls';

/** The German address of an English path. */
const de = (path: string) => (path === '/' ? '/de' : `/de${path}`);

test.describe('German shell', () => {
  test('an unknown /de address is the German 404, with lang de', async ({ page }) => {
    const response = await page.goto('/de/x');
    expect(response?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('heading', { level: 1, name: 'Seite nicht gefunden' })).toBeVisible();
  });

  test('the language links carry the query and hash across and back', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // The German 404 has no twin, so the round trip ends on the other language's home page.
    await page.goto('/de/x?a=1#b');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await page.locator('[data-language-menu] summary').click();
    await page.locator('[data-language-menu] a[hreflang="en"]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    let url = new URL(page.url());
    expect([url.pathname, url.search, url.hash]).toEqual(['/', '?a=1', '#b']);
    await page.locator('[data-language-menu] summary').click();
    await page.locator('[data-language-menu] a[hreflang="de"]').click();
    await page.waitForURL(/\/de\?a=1#b$/);
    url = new URL(page.url());
    expect([url.pathname, url.search, url.hash]).toEqual(['/de', '?a=1', '#b']);
  });

  test('the Menu shows both language rows at 390 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/work');
    await page.locator('[data-menu] summary').click();
    const menu = page.locator('[data-menu] nav');
    for (const name of ['English', 'Deutsch']) {
      const link = menu.getByRole('link', { name });
      await expect(link).toBeVisible();
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(menu.getByRole('link', { name: 'English' })).toHaveAttribute('aria-current', 'true');
  });
});

/** Page and console errors of a page, ignoring a failed resource load (a blocked font or image request). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text());
  });
  return errors;
}

/** Opens the language list for the viewport (the header from lg, the Menu below it) and follows the link to `language`. */
async function switchLanguage(page: Page, language: 'en' | 'de'): Promise<void> {
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await page.locator('[data-language-menu] summary').click();
    await page.locator(`[data-language-menu] a[hreflang="${language}"]`).click();
  } else {
    await page.locator('[data-menu] summary').click();
    await page.locator('[data-menu] nav').getByRole('link', { name: language === 'en' ? 'English' : 'Deutsch', exact: true }).click();
  }
}

test.describe('every German page', () => {
  for (const path of DE_PAGES) {
    test(`${de(path)} loads in German with one h1 and no console error`, async ({ page }) => {
      const errors = watchErrors(page);
      const response = await page.goto(de(path));
      expect(response?.status(), de(path)).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).not.toBeEmpty();
      await page.waitForLoadState('networkidle');
      expect(errors).toEqual([]);
    });
  }
});

test.describe('the language menu round trip', () => {
  for (const width of [390, 1280]) {
    for (const path of DE_PAGES) {
      test(`${de(path)} to its English twin and back at ${width} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(de(path));
        await expect(page.locator('html')).toHaveAttribute('lang', 'de');
        await switchLanguage(page, 'en');
        await page.waitForURL((url) => url.pathname === path);
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('h1')).toHaveCount(1);
        await switchLanguage(page, 'de');
        await page.waitForURL((url) => url.pathname === de(path));
        await expect(page.locator('html')).toHaveAttribute('lang', 'de');
        await expect(page.locator('h1')).toHaveCount(1);
      });
    }
  }
});

test.describe('the Figures on the German pages', () => {
  // The pages that hold an interactive Figure: the Retention case study, the Lab, the Lab's peeking
  // example, the Audible ship rule and the Pulse dashboard.
  for (const path of ['/work/retention', '/lab', '/lab/peeking', '/work/audible', '/work/pulse']) {
    test(`${de(path)}: each Figure takes a control change and Reset, in German`, async ({ page }) => {
      test.slow();
      const errors = watchErrors(page);
      await page.goto(de(path));
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      const used = await useEveryControl(page);
      expect(used.controlled, `${path}: Figures with a control`).toBeGreaterThan(0);
      expect(used.idle, `${path}: every Figure with a control had one used, not only Reset`).toEqual([]);
      expect(used.resets, `${path}: Reset used`).toBeGreaterThan(0);
      // The kit's own words are German here: no English Reset button is left on the page.
      await expect(page.getByRole('button', { name: 'Reset', exact: true })).toHaveCount(0);
      // Every Figure was reset, so none keeps a setting in the address.
      await expect.poll(() => new URL(page.url()).search).not.toMatch(/[?&][a-z][a-z0-9-]*\.[a-z]/i);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('the German contact form', () => {
  const MIN_FILL_MS = 3_000;
  type Values = { name: string; email: string; reason: string; subject: string; message: string };
  type FakeEmail = { to: string; reply_to: string };

  /** A fresh sender address per call, so each test reads back only its own messages. */
  function values(over: Partial<Values> = {}): Values {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    return {
      name: 'Ada Beispiel',
      email: `sender-${id}@example.test`,
      reason: 'Frage zu einem Projekt',
      subject: 'Die Bindungsanalyse',
      message: 'Guten Tag,\nich habe eine Frage zur Fallstudie.',
      ...over,
    };
  }

  async function fill(page: Page, v: Values): Promise<void> {
    await page.getByLabel('Name', { exact: true }).fill(v.name);
    await page.getByLabel('E-Mail-Adresse').fill(v.email);
    await page.getByLabel('Warum nehmen Sie Kontakt auf?').selectOption({ label: v.reason });
    await page.getByLabel('Betreff').fill(v.subject);
    await page.getByLabel('Nachricht', { exact: true }).fill(v.message);
  }

  async function sentTo(replyTo: string): Promise<FakeEmail[]> {
    const res = await fetch(`${E2E_FAKE_UPSTASH_URL}/resend/sent?reply_to=${encodeURIComponent(replyTo)}`);
    return (await res.json()) as FakeEmail[];
  }

  const send = (page: Page) => page.getByRole('button', { name: 'Nachricht senden' });
  const status = (page: Page) => page.locator('#contact-status');
  const aged = (page: Page) => page.waitForTimeout(MIN_FILL_MS + 300);

  test('with JavaScript: sends, shows "Nachricht gesendet" at /de/contact?sent=1 with focus on it, and the fake inbox gets one message', async ({ page }) => {
    await page.goto('/de/contact');
    await expect(page.locator('h1')).toContainText('Schreiben Sie mir,');
    const v = values();
    await fill(page, v);
    await aged(page);
    await send(page).click();
    await expect(page).toHaveURL(/\/de\/contact\?sent=1$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(status(page).getByRole('heading', { level: 2, name: 'Nachricht gesendet' })).toBeFocused();
    await expect(status(page)).toContainText('Danke, Ihre Nachricht ist unterwegs. Ich antworte von meiner eigenen E-Mail-Adresse.');
    await expect(page).toHaveTitle(/^Nachricht gesendet: Kontakt/);
    await expect(page.locator('form')).toHaveCount(0);
    const [email, ...more] = await sentTo(v.email);
    expect(more).toEqual([]);
    expect(email).toMatchObject({ to: E2E_CONTACT_TO, reply_to: v.email });
    // Nothing the visitor entered is in the address or the page after sending.
    expect(page.url()).not.toContain('example.test');
    expect(await page.content()).not.toContain(v.email);
  });

  test('with JavaScript: an empty form lists every field in German in a summary that takes focus, and sends nothing', async ({ page }) => {
    await page.goto('/de/contact');
    await send(page).click();
    await expect(status(page)).toBeFocused();
    await expect(status(page)).toContainText('Nachricht nicht gesendet');
    await expect(status(page)).toContainText('Prüfen Sie diese Felder:');
    const links = status(page).getByRole('link');
    await expect(links).toHaveText([
      'Geben Sie Ihren Namen ein',
      'Geben Sie Ihre E-Mail-Adresse ein, damit ich antworten kann',
      'Wählen Sie, warum Sie Kontakt aufnehmen',
      'Geben Sie einen Betreff ein',
      'Geben Sie Ihre Nachricht ein',
    ]);
    await expect(page).toHaveTitle(/^Nachricht nicht gesendet: Kontakt/);
    await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(/\/de\/contact$/);
    await links.nth(3).click();
    await expect(page.getByLabel('Betreff')).toBeFocused();
  });

  test('without JavaScript: a plain POST sends the message and lands on /de/contact?sent=1', async ({ browser, baseURL, clientIdentity }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL, extraHTTPHeaders: { 'x-forwarded-for': clientIdentity, 'x-real-ip': clientIdentity } });
    const page = await context.newPage();
    try {
      await page.goto('/de/contact');
      const v = values({ reason: 'Stellenangebot' });
      await fill(page, v);
      await aged(page);
      const post = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.startsWith('/de/contact'));
      await send(page).click();
      expect((await post).status()).toBe(303);
      await expect(page).toHaveURL(/\/de\/contact\?sent=1$/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(status(page)).toContainText('Nachricht gesendet');
      await expect(page).toHaveTitle(/^Nachricht gesendet: Kontakt/);
      const [email] = await sentTo(v.email);
      expect(email?.reply_to).toBe(v.email);
    } finally {
      await context.close();
    }
  });

  test('without JavaScript: the error comes back in German in the page, the values kept, nothing in the address, nothing sent', async ({ browser, baseURL, clientIdentity }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL, extraHTTPHeaders: { 'x-forwarded-for': clientIdentity, 'x-real-ip': clientIdentity } });
    const page = await context.newPage();
    try {
      await page.goto('/de/contact');
      const v = values({ email: `not-an-address-${Date.now()}` });
      await fill(page, v);
      await aged(page);
      await send(page).click();
      await expect(status(page)).toContainText('Nachricht nicht gesendet');
      await expect(status(page).getByRole('link')).toHaveText(['Geben Sie eine vollständige E-Mail-Adresse mit @ und Domain ein']);
      await expect(page).toHaveURL(/\/de\/contact$/);
      expect(page.url()).not.toContain('not-an-address');
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(page.getByLabel('Name', { exact: true })).toHaveValue(v.name);
      await expect(page.getByLabel('E-Mail-Adresse')).toHaveValue(v.email);
      await expect(page.getByLabel('Betreff')).toHaveValue(v.subject);
      await expect(page.getByLabel('Nachricht', { exact: true })).toHaveValue(v.message);
      await expect(page).toHaveTitle(/^Nachricht nicht gesendet: Kontakt/);
      expect(await sentTo(v.email)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
