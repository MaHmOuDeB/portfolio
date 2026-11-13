import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { auditHtml } from '../../scripts/truth-audit.ts';
import { ALLOW } from '../../scripts/truth-audit.allow.ts';
import { FACTS, FACT_DISPLAYS } from '../../src/lib/facts/facts.generated.ts';

// Shared by the page specs that check a hydrated page after its controls are used.

/**
 * The hydrated page's truth: the audit over the serialized DOM, plus what serialization does not
 * carry or the audit does not read: each input's live value, and every accessible-name, value-text
 * and title string with a digit must sit under a source marker.
 */
export async function auditLive(page: Page, route: string, when: string) {
  const findings = auditHtml(await page.content(), { route, factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] });
  expect(findings, `${route} ${when}`).toEqual([]);
  const stray = await page.evaluate(() => {
    const out: string[] = [];
    const main = document.querySelector('main')!;
    for (const input of main.querySelectorAll('input')) {
      if (input.type !== 'hidden' && /\d/.test(input.value) && !input.closest('[data-derived], [data-fact]')) out.push(`value=${input.value}`);
    }
    for (const el of main.querySelectorAll('*')) {
      for (const name of ['aria-label', 'aria-valuetext', 'aria-description', 'title', 'alt', 'placeholder']) {
        const v = el.getAttribute(name);
        if (v && /\d/.test(v) && !el.closest('[data-derived], [data-fact]')) out.push(`${name}=${v}`);
      }
    }
    if (/\bInfinity\b|\bNaN\b/.test(main.innerText)) out.push('a non-finite value in the text');
    return out;
  });
  // A digit the truth audit itself allows in text (a year, the product name n8n) is allowed here too.
  const allowed = ALLOW.filter((a) => a.routes === undefined || a.routes.includes(route));
  const rest = (s: string) => allowed.reduce((t, a) => t.replace(new RegExp(a.pattern.source, `${a.pattern.flags.replace('g', '')}g`), ''), s.slice(s.indexOf('=') + 1));
  expect(stray.filter((s) => s.startsWith('a non-finite') || /\d/.test(rest(s))), `${route} ${when}`).toEqual([]);
}

