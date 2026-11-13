// The contact form end to end, against the fake Resend endpoint on the loopback fake store
// (scripts/fake-upstash.ts): the e2e server's RESEND_API_URL points there, so no test reaches Resend.
// Every test runs from its own client address (fixtures.ts), so each has its own rate-limit bucket.
import { expect, type Page } from '@playwright/test';
import { CONTACT } from '../../src/lib/site';
import { E2E_CONTACT_TO, E2E_FAKE_UPSTASH_URL } from './constants';
import { expectNoA11yViolations, test } from './fixtures';

const MIN_FILL_MS = 3_000;
/** A subject holding this makes the fake answer 500 (FAKE_RESEND_FAIL in scripts/fake-upstash.ts). */
const FAKE_RESEND_FAIL = 'FAKE_RESEND_FAIL';
type FakeEmail = { from: string; to: string; reply_to: string; subject: string; text: string };

type Values = { name: string; email: string; reason: string; subject: string; message: string };

/** A fresh sender address per call, so each test reads back only its own messages. */
function values(over: Partial<Values> = {}): Values {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: 'Ada Example',
    email: `sender-${id}@example.test`,
    reason: 'Question about a project',
    subject: 'The retention analysis',
    message: 'Hello,\nI have a question about the retention case study.',
    ...over,
  };
}

async function fill(page: Page, v: Values): Promise<void> {
  await page.getByLabel('Name', { exact: true }).fill(v.name);
  await page.getByLabel('E-mail address').fill(v.email);
  await page.getByLabel('Why are you getting in touch?').selectOption({ label: v.reason });
  await page.getByLabel('Subject').fill(v.subject);
  await page.getByLabel('Message', { exact: true }).fill(v.message);
}

/** Waits until the form is old enough to pass the minimum fill time. */
async function letFormAge(page: Page): Promise<void> {
  await page.waitForTimeout(MIN_FILL_MS + 300);
}

async function sentTo(replyTo: string): Promise<FakeEmail[]> {
  const res = await fetch(`${E2E_FAKE_UPSTASH_URL}/resend/sent?reply_to=${encodeURIComponent(replyTo)}`);
  return (await res.json()) as FakeEmail[];
}

const sendButton = (page: Page) => page.getByRole('button', { name: 'Send message' });
const status = (page: Page) => page.locator('#contact-status');

test.describe('with JavaScript', () => {
  test('sends a message, shows "Message sent" with focus on it, and the fake inbox gets exactly the five fields', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.locator('h1')).toHaveText('Contact');
    const v = values();
    await fill(page, v);
    await letFormAge(page);
    await sendButton(page).click();
    await expect(page).toHaveURL(/\/contact\?sent=1$/);
    // Focus lands on the block's heading, so the ring sits on the words and not around the ruled block.
    await expect(status(page).getByRole('heading', { level: 2, name: 'Message sent' })).toBeFocused();
    await expect(status(page)).toContainText('Message sent');
    await expect(status(page)).toContainText('Thanks, your message is on its way. I reply from my own e-mail.');
    await expect(page).toHaveTitle(/^Message sent: Contact/);
    await expect(status(page).getByRole('heading', { level: 2, name: 'Message sent' })).toHaveCount(1);
    await expect(page.locator('form')).toHaveCount(0);
    const [email, ...more] = await sentTo(v.email);
    expect(more).toEqual([]);
    expect(email).toEqual({
      from: 'Portfolio contact <onboarding@resend.dev>',
      to: E2E_CONTACT_TO,
      reply_to: v.email,
      subject: `[Portfolio] ${v.reason}: ${v.subject}`,
      text: `Name: ${v.name}\nE-mail: ${v.email}\nReason: ${v.reason}\n\nMessage:\n${v.message}\n`,
    });
    // Nothing the visitor entered is in the address or the page after sending.
    expect(page.url()).not.toContain('example.test');
    expect(await page.content()).not.toContain(v.email);
  });

  test('an empty form lists every field in a summary that takes focus, links into each field, and sends nothing', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.getByLabel('Name', { exact: true })).toHaveAccessibleDescription('I use this name when I reply. Any name is fine.');
    await sendButton(page).click();
    await expect(status(page)).toBeFocused();
    await expect(status(page)).toContainText('Message not sent');
    await expect(status(page)).toContainText('Check these fields:');
    const links = status(page).getByRole('link');
    await expect(links).toHaveText([
      'Enter your name',
      'Enter your e-mail address, so I can reply',
      'Choose why you are getting in touch',
      'Enter a subject',
      'Enter your message',
    ]);
    await expect(page).toHaveTitle(/^Message not sent: Contact/);
    await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    // The hint is read before the error.
    await expect(page.getByLabel('Name', { exact: true })).toHaveAccessibleDescription('I use this name when I reply. Any name is fine. Error: Enter your name');
    await expect(page.locator('form')).toHaveAttribute('aria-describedby', 'contact-status');
    await links.nth(3).click();
    await expect(page.getByLabel('Subject')).toBeFocused();
    await expect(page).toHaveURL(/\/contact$/);
  });

  test('a field error clears as soon as the field is valid; the summary stays as it was until the next submit', async ({ page }) => {
    await page.goto('/contact');
    await sendButton(page).click();
    const name = page.getByLabel('Name', { exact: true });
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await name.fill('Ada');
    await expect(name).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#contact-name-error')).toHaveCount(0);
    // Nothing moves above the field while the visitor types: the summary and the title wait for a submit.
    await expect(status(page).getByRole('link')).toHaveCount(5);
    await expect(page).toHaveTitle(/^Message not sent: Contact/);
    await page.getByLabel('E-mail address').fill('not-an-address');
    await expect(status(page).getByRole('link', { name: 'Enter your e-mail address, so I can reply' })).toHaveCount(1);
    await sendButton(page).click();
    await expect(status(page)).toBeFocused();
    await expect(status(page).getByRole('link')).toHaveCount(4);
    await expect(status(page).getByRole('link', { name: 'Enter a full e-mail address, with an @ and a domain' })).toHaveCount(1);
  });

  test('the summary is a named group with an h2 and a real list', async ({ page }) => {
    await page.goto('/contact');
    await sendButton(page).click();
    await expect(status(page)).toHaveAttribute('role', 'group');
    await expect(page.getByRole('group', { name: 'Message not sent' })).toHaveCount(1);
    await expect(status(page).getByRole('heading', { level: 2, name: 'Message not sent' })).toHaveCount(1);
    await expect(status(page).getByRole('list')).toHaveAttribute('role', 'list');
    await expect(status(page).getByRole('listitem')).toHaveCount(5);
  });

  test('at 400% zoom (320 x 256), the Message label stays in view when the summary sends focus to the textarea', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    await page.goto('/contact');
    await sendButton(page).click();
    await expect(status(page)).toBeFocused();
    await status(page).getByRole('link', { name: 'Enter your message' }).click();
    const message = page.getByLabel('Message', { exact: true });
    await expect(message).toBeFocused();
    // Let the scroll settle, then the label and the error above the control are both on screen.
    await expect.poll(() => page.evaluate(() => new Promise<boolean>((resolve) => {
      const before = scrollY;
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(scrollY === before)));
    }))).toBe(true);
    await expect(page.locator('label[for="contact-message"]')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#contact-message-error')).toBeInViewport({ ratio: 1 });
    await expect(message).toBeInViewport();
  });

  test('a form sent within three seconds of opening is refused, with the text kept', async ({ page }) => {
    await page.goto('/contact');
    const v = values();
    await fill(page, v);
    // Stamp the form as issued two seconds from now (the browser and the server share a clock here,
    // and the server allows five seconds of skew), so neither a slow fill nor a slow round trip on a
    // loaded machine can push it past the three-second minimum.
    await page.locator('input[name="issuedAt"]').evaluate((el: HTMLInputElement) => (el.value = String(Date.now() + 2_000)));
    await sendButton(page).click();
    await expect(status(page)).toBeFocused();
    await expect(status(page)).toContainText('Nothing was sent, because the form was sent very soon after the page opened.');
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(v.message);
    expect(await sentTo(v.email)).toEqual([]);
  });

  test('a delivery failure says nothing was sent, offers LinkedIn and keeps the text', async ({ page }) => {
    await page.goto('/contact');
    const v = values({ subject: `Please fail ${FAKE_RESEND_FAIL}` });
    await fill(page, v);
    await letFormAge(page);
    await sendButton(page).click();
    await expect(status(page)).toBeFocused();
    await expect(status(page)).toContainText('Nothing was sent: the message could not be delivered.');
    await expect(status(page).getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('href', CONTACT.linkedin);
    await expect(page.getByLabel('Subject')).toHaveValue(v.subject);
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(v.message);
    await expect(page).toHaveTitle(/^Message not sent: Contact/);
    expect(await sentTo(v.email)).toEqual([]);
  });

  test('five messages an hour from one address go through, and the sixth is refused', async ({ page }) => {
    const v = values();
    for (let i = 0; i < 5; i++) {
      await page.goto('/contact');
      await fill(page, { ...v, subject: `Message ${'abcde'[i]}` });
      // The form's issue time is unsigned, so the test ages it instead of waiting each time.
      await page.locator('input[name="issuedAt"]').evaluate((el: HTMLInputElement) => (el.value = String(Number(el.value) - 60_000)));
      await sendButton(page).click();
      await expect(page).toHaveURL(/\/contact\?sent=1$/);
    }
    await page.goto('/contact');
    await fill(page, { ...v, subject: 'Message f' });
    await page.locator('input[name="issuedAt"]').evaluate((el: HTMLInputElement) => (el.value = String(Number(el.value) - 60_000)));
    await sendButton(page).click();
    await expect(status(page)).toContainText('Nothing was sent: this form has reached its limit for now.');
    expect(await sentTo(v.email)).toHaveLength(5);
  });

  test('a filled honeypot is answered as sent, and nothing is delivered', async ({ page }) => {
    await page.goto('/contact');
    const v = values();
    await fill(page, v);
    await page.locator('#contact-hp').evaluate((el: HTMLInputElement) => (el.value = 'https://spam.example.test'));
    await letFormAge(page);
    await sendButton(page).click();
    await expect(page).toHaveURL(/\/contact\?sent=1$/);
    expect(await sentTo(v.email)).toEqual([]);
  });

  test('the honeypot is out of reach: hidden from assistive tech, inert, and never a tab stop', async ({ page }) => {
    await page.goto('/contact');
    // A name and label no autofill maps to a profile field, so a real visitor's browser never fills it.
    await expect(page.locator('#contact-hp')).toHaveAttribute('name', 'contact_hp');
    await expect(page.locator('label[for="contact-hp"]')).toHaveText('Leave this field empty');
    const wrapper = page.locator('#contact-hp').locator('..');
    await expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    await expect(wrapper).toHaveAttribute('inert', '');
    await page.getByLabel('Subject').focus();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.id)).not.toBe('contact-hp');
    }
  });

  test('works from the keyboard alone: tab through the fields in order and send with Enter', async ({ page }) => {
    await page.goto('/contact');
    const v = values();
    await page.getByLabel('Name', { exact: true }).focus();
    await page.keyboard.type(v.name);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('E-mail address')).toBeFocused();
    await page.keyboard.type(v.email);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Why are you getting in touch?')).toBeFocused();
    await page.getByLabel('Why are you getting in touch?').selectOption({ label: v.reason });
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Subject')).toBeFocused();
    await page.keyboard.type(v.subject);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Message', { exact: true })).toBeFocused();
    await page.keyboard.type('One line.');
    await page.keyboard.press('Tab');
    await expect(sendButton(page)).toBeFocused();
    await letFormAge(page);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/contact\?sent=1$/);
    await expect(status(page).getByRole('heading', { level: 2, name: 'Message sent' })).toBeFocused();
    expect(await sentTo(v.email)).toHaveLength(1);
  });

  test('passes axe empty, with the error summary, and after sending', async ({ page }) => {
    await page.goto('/contact');
    await expectNoA11yViolations(page);
    await sendButton(page).click();
    await expect(status(page)).toBeFocused();
    await expectNoA11yViolations(page);
    await page.goto('/contact?sent=1');
    await expectNoA11yViolations(page);
  });

  test('reflows at 320 px, with the summary on show', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/contact');
    await sendButton(page).click();
    await expect(status(page)).toBeFocused();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the footer link "Contact" opens the form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Contact', exact: true }).click();
    await expect(page).toHaveURL(/\/contact$/);
    await expect(page.locator('h1')).toHaveText('Contact');
    await expect(page).toHaveTitle(/^Contact/);
  });
});

test.describe('without JavaScript', () => {
  test('a plain POST sends the message and answers with a 303 to ?sent=1', async ({ browser, baseURL, clientIdentity }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL, extraHTTPHeaders: { 'x-forwarded-for': clientIdentity, 'x-real-ip': clientIdentity } });
    const page = await context.newPage();
    try {
      await page.goto('/contact');
      const v = values({ reason: 'Job opportunity' });
      await fill(page, v);
      await letFormAge(page);
      const post = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/contact');
      await sendButton(page).click();
      expect((await post).status()).toBe(303);
      await expect(page).toHaveURL(/\/contact\?sent=1$/);
      await expect(status(page)).toContainText('Message sent');
      await expect(page).toHaveTitle(/^Message sent: Contact/);
      const [email] = await sentTo(v.email);
      expect(email?.subject).toBe(`[Portfolio] Job opportunity: ${v.subject}`);
      expect(email?.reply_to).toBe(v.email);
    } finally {
      await context.close();
    }
  });

  test('errors come back in the page with the values kept, never in the address, and nothing is sent', async ({ browser, baseURL, clientIdentity }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL, extraHTTPHeaders: { 'x-forwarded-for': clientIdentity, 'x-real-ip': clientIdentity } });
    const page = await context.newPage();
    try {
      await page.goto('/contact');
      const v = values({ email: `not-an-address-${Date.now()}` });
      await fill(page, v);
      await letFormAge(page);
      await sendButton(page).click();
      await expect(status(page)).toContainText('Message not sent');
      await expect(status(page).getByRole('link')).toHaveText(['Enter a full e-mail address, with an @ and a domain']);
      await expect(page).toHaveURL(/\/contact$/);
      expect(page.url()).not.toContain('not-an-address');
      await expect(page.getByLabel('Name', { exact: true })).toHaveValue(v.name);
      await expect(page.getByLabel('E-mail address')).toHaveValue(v.email);
      await expect(page.getByLabel('Why are you getting in touch?')).toHaveValue('project');
      await expect(page.getByLabel('Subject')).toHaveValue(v.subject);
      await expect(page.getByLabel('Message', { exact: true })).toHaveValue(v.message);
      await expect(page).toHaveTitle(/^Message not sent: Contact/);
      expect(await sentTo(v.email)).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('a request body over the action limit (64 KB) is refused before the form is read, and nothing is sent', async ({ browser, baseURL, clientIdentity }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL, extraHTTPHeaders: { 'x-forwarded-for': clientIdentity, 'x-real-ip': clientIdentity } });
    const page = await context.newPage();
    try {
      await page.goto('/contact');
      // Under the old 1 MB default this would come back as a 200 with "Shorten your message".
      const v = values({ message: 'x'.repeat(100_000) });
      await fill(page, v);
      await letFormAge(page);
      const post = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/contact');
      await sendButton(page).click();
      expect((await post).status()).toBeGreaterThanOrEqual(400);
      expect(await sentTo(v.email)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
