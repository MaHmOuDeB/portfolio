import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test } from './fixtures';
import { CASE_ROUTES, ROUTES, SIZES, STATES, openAt, sizeNamed, sizeOrPrint } from './remaining-matrix';
import { KIT_CHART_SPILLS } from './chart-spills';
import { pinnedExemptions, touchTargetReport, unpinnedExemptions } from './touch-targets';

// The quality gates of every page other than Home (Home has home-quality.spec.ts), in one place:
// - each route across the size matrix (375, 390, 768, 1024 and 1440 px, 1280x720 at 125%, 320 px and
//   400% zoom): no sideways scroll; every pointer target at least 44 px (the pinned inline links
//   aside); every focus ring visible and unclipped; chart text at its size (ticks 13 px, annotations
//   15 px semibold, nothing under 13 px) and never scaled by a viewBox; no state shown by colour
//   alone; nothing that moves before the visitor does anything; complete text, with no ellipsis, no
//   clipped line, no chart label cut off, off the screen, past its chart's box (the kit cases pinned
//   in chart-spills.ts aside) or over another label, and no sentence in a sideways-scrolling table;
//   control rows whose labels and Reset sit in line; one gap between the header's page links;
// - each case study and build note states at least two real limits;
// - representative states beyond the default (the ship-rule decisions, the Pulse stream, empty and
//   error, the About photograph, the printed CV and About, the contact form's error and sent states,
//   the live specimens and the missing page) under the same checks.
// Every check is soft, so one run lists every finding. Full state text stays in each page's own spec.

const controls = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/** Anything that started moving before any input (recorded from the first byte by openAt). */
async function motion(page: Page): Promise<string[]> {
  // Long enough for an idle island to load and for anything on a timer to start.
  await page.waitForTimeout(2_500);
  const seen = await page.evaluate(() => (window as unknown as { __motion?: string[] }).__motion ?? []);
  return [...new Set(seen)];
}

async function sideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/**
 * SVG text at the wrong size, under 13 px, or inside a viewBox that scales it; chart text cut off, off
 * the screen, past its chart's box (the kit cases pinned in chart-spills.ts aside) or over other text.
 */
async function chartText(page: Page, route: string): Promise<string[]> {
  const pinned = KIT_CHART_SPILLS[route.split('?')[0]!] ?? [];
  return page.evaluate((pinned) => {
    const out = new Set<string>();
    for (const t of document.querySelectorAll<SVGTextElement>('svg text')) {
      if (t.getClientRects().length === 0 || !t.checkVisibility({ checkVisibilityCSS: true })) continue;
      const label = (t.textContent ?? '').trim().slice(0, 40);
      const s = getComputedStyle(t);
      const m = t.getScreenCTM();
      const scale = m ? Math.hypot(m.a, m.b) : 1;
      const px = parseFloat(s.fontSize) * scale;
      for (let svg: Element | null = t.closest('svg'); svg; svg = svg.parentElement?.closest('svg') ?? null) {
        if (svg.hasAttribute('viewBox')) out.add(`text inside a viewBox: "${label}"`);
      }
      if (Math.abs(scale - 1) > 0.01) out.add(`text scaled ${scale.toFixed(2)}x: "${label}"`);
      if (t.closest('[data-tick]') && Math.abs(px - 13) > 0.5) out.add(`tick at ${px.toFixed(1)} px: "${label}"`);
      else if (t.closest('[data-annotation]') && (Math.abs(px - 15) > 0.5 || Number(s.fontWeight) < 600)) out.add(`annotation at ${px.toFixed(1)} px weight ${s.fontWeight}: "${label}"`);
      else if (px < 12.5) out.add(`chart text at ${px.toFixed(1)} px: "${label}"`);
    }
    // Complete chart text: no label cut off, by its own svg (when that clips) or by any box around it
    // that clips or scrolls, and none off the screen; every label inside its own chart's box (an outer
    // svg draws in its padding, never past its edge), except the kit cases pinned in chart-spills.ts,
    // which show whole because the chart frame draws its svg overflow-visible; and no two labels of
    // one chart drawn over each other.
    const vw = document.documentElement.clientWidth;
    for (const svg of document.querySelectorAll<SVGSVGElement>('svg[data-chart-frame]')) {
      if (svg.getClientRects().length === 0 || !svg.checkVisibility({ checkVisibilityCSS: true })) continue;
      const texts = [...svg.querySelectorAll<SVGTextElement>('text')].filter((t) => t.getClientRects().length > 0 && t.checkVisibility({ checkVisibilityCSS: true }) && (t.textContent ?? '').trim() !== '');
      const rects = texts.map((t) => ({ text: (t.textContent ?? '').trim().slice(0, 40), r: t.getBoundingClientRect() }));
      const box = svg.getBoundingClientRect();
      for (const { text, r } of rects) {
        if (r.left < -1 || r.right > vw + 1) out.add(`chart text off the screen: "${text}"`);
        const past = r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1;
        if (past && !pinned.includes(text)) out.add(`chart text past its chart's edge: "${text}"`);
        for (let p: Element | null = svg; p && p !== document.body; p = p.parentElement) {
          const ps = getComputedStyle(p);
          const b = p.getBoundingClientRect();
          const clipsX = ps.overflowX !== 'visible';
          const clipsY = ps.overflowY !== 'visible';
          if ((clipsX && (r.left < b.left - 1 || r.right > b.right + 1)) || (clipsY && (r.top < b.top - 1 || r.bottom > b.bottom + 1))) {
            out.add(`chart text cut off by ${p.tagName.toLowerCase()}: "${text}"`);
          }
        }
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]!;
          const b = rects[j]!;
          if (a.text === b.text) continue;
          const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (w > 1 && h > 2) out.add(`chart text drawn over other text: "${a.text}" and "${b.text}"`);
        }
      }
    }
    return [...out];
  }, pinned);
}

/**
 * A Figure's control row, where its controls sit side by side: on each line of the row every label
 * and legend starts at the same height, and Reset sits level with the controls' inputs, not with
 * their labels or below them.
 */
async function controlRows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>();
    const shown = (el: Element) => el.getClientRects().length > 0 && el.checkVisibility({ checkVisibilityCSS: true });
    for (const row of document.querySelectorAll<HTMLElement>('[data-figure-controls] [role="group"], [data-figure-controls][role="group"]')) {
      if (!shown(row) || getComputedStyle(row).flexDirection !== 'row') continue;
      const kids = [...row.children].filter(shown);
      // Kids whose boxes overlap vertically share a line of the wrapped row.
      const lines: Element[][] = [];
      for (const kid of kids) {
        const r = kid.getBoundingClientRect();
        const line = lines.find((l) => l.some((o) => { const q = o.getBoundingClientRect(); return r.top < q.bottom && q.top < r.bottom; }));
        if (line) line.push(kid);
        else lines.push([kid]);
      }
      const name = (row.getAttribute('aria-labelledby') ?? '').slice(0, 40);
      for (const line of lines) {
        // Reset is a button, alone or in a wrapper of its own.
        const buttonOf = (k: Element) => (k.matches('button') ? k : k.children.length === 1 && k.firstElementChild?.matches('button') ? k.firstElementChild : null);
        const heads = line.flatMap((k) => (buttonOf(k) ? [] : [k.querySelector('label, legend')].filter((h): h is Element => h !== null)));
        const tops = heads.map((h) => Math.round(h.getBoundingClientRect().top));
        if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 1) out.add(`${name}: labels start at ${tops.join(', ')}`);
        const input = line.map((k) => k.querySelector('[data-touch-target]:not(button), input:not([type="radio"])')).find((i): i is Element => i !== null);
        for (const button of line.map(buttonOf).filter((b): b is Element => b !== null)) {
          if (!input) continue;
          const dy = Math.round(button.getBoundingClientRect().top - input.getBoundingClientRect().top);
          if (Math.abs(dy) > 1) out.add(`${name}: ${(button.textContent ?? '').trim()} sits ${dy} px off the inputs`);
        }
      }
    }
    return [...out];
  });
}

/** The visible gaps between the header's page links, label to label: one gap, whatever the label's length. */
async function navGaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const labels = [...document.querySelectorAll<HTMLElement>('nav[aria-label="Main"] a > span')].filter((l) => l.getClientRects().length > 0);
    if (labels.length < 2) return [];
    const rects = labels.map((l) => l.getBoundingClientRect());
    const gaps = rects.slice(1).map((r, i) => Math.round(r.left - rects[i]!.right));
    return Math.max(...gaps) - Math.min(...gaps) > 1 ? [`header link gaps ${gaps.join(', ')} px`] : [];
  });
}

/** Sentences in a sideways-scrolling region: a table of prose must wrap, not hide words off its edge. */
async function scrolledProse(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>();
    for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
      if (el.getClientRects().length === 0 || !el.checkVisibility({ checkVisibilityCSS: true })) continue;
      const s = getComputedStyle(el);
      if (!['auto', 'scroll'].includes(s.overflowX) || el.scrollWidth <= el.clientWidth + 1) continue;
      for (const cell of el.querySelectorAll<HTMLElement>('td, th, dd')) {
        const words = (cell.textContent ?? '').trim().split(/\s+/);
        if (words.length >= 8) out.add(`a sentence in a sideways-scrolling region: "${words.slice(0, 8).join(' ')}"`);
      }
    }
    return [...out];
  });
}

/** An ellipsis, a line clamp or a box that clips its own text. */
async function incompleteText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>();
    const shown = (el: Element) => el.getClientRects().length > 0 && el.checkVisibility({ checkVisibilityCSS: true });
    for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
      if (!shown(el)) continue;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      // sr-only text is clipped on purpose.
      if (r.width <= 1 || r.height <= 1) continue;
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50);
      if (!text) continue;
      const tag = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`;
      if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.add(`ellipsis on ${tag}: "${text}"`);
      if (s.webkitLineClamp && s.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1) out.add(`line clamp on ${tag}: "${text}"`);
      if (['hidden', 'clip'].includes(s.overflowX) && el.scrollWidth > el.clientWidth + 1 && !el.matches('svg, svg *')) out.add(`clipped across on ${tag}: "${text}"`);
      if (['hidden', 'clip'].includes(s.overflowY) && el.scrollHeight > el.clientHeight + 1 && !el.matches('svg, svg *')) out.add(`clipped down on ${tag}: "${text}"`);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement;
      // Recorded tool output in pre and code is quoted verbatim, ellipses included.
      if (parent && shown(parent) && !parent.closest('pre, code') && /…|\.\.\./.test(n.textContent ?? '')) out.add(`ellipsis in text: "${(n.textContent ?? '').trim().slice(0, 60)}"`);
    }
    return [...out];
  });
}

/** A mark painted in the ok or warn colour with no word beside it. */
async function colourOnly(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    document.body.append(probe);
    const resolve = (v: string) => {
      probe.style.color = `var(${v})`;
      return getComputedStyle(probe).color;
    };
    const status = new Set([resolve('--color-ok'), resolve('--color-warn')]);
    probe.remove();
    const out = new Set<string>();
    for (const el of document.body.querySelectorAll<Element>('*')) {
      if (el.getClientRects().length === 0 || !el.checkVisibility({ checkVisibilityCSS: true })) continue;
      const s = getComputedStyle(el);
      const painted =
        status.has(s.backgroundColor) ||
        (parseFloat(s.borderTopWidth) > 0 && status.has(s.borderTopColor)) ||
        (parseFloat(s.borderLeftWidth) > 0 && status.has(s.borderLeftColor)) ||
        (el instanceof SVGElement && (status.has(s.fill) || status.has(s.stroke)));
      if (!painted) continue;
      const words = (node: Element | null) => ((node?.textContent ?? '') + (node?.getAttribute('aria-label') ?? '')).replace(/\s+/g, '');
      // The word may sit beside the mark: an icon in its own span, then the status text.
      let near: Element | null = el;
      let worded = false;
      for (let i = 0; i < 4 && near && !worded; i++, near = near.parentElement) worded = words(near) !== '';
      if (!worded) out.add(`${el.tagName.toLowerCase()} in a status colour with no word: ${el.parentElement?.outerHTML.slice(0, 80) ?? ''}`);
    }
    return [...out];
  });
}

/** Focus each control in turn and report every ring that is missing, clipped or under the sticky header. */
async function focusRings(page: Page): Promise<unknown[]> {
  const count = await page.locator(controls).count();
  const findings: unknown[] = [];
  for (let i = 0; i < count; i++) {
    if (i >= (await page.locator(controls).count())) break;
    const control = page.locator(controls).nth(i);
    const usable = await control.evaluate((el) => {
      const s = getComputedStyle(el);
      const closedDetails = el.closest('details:not([open])') !== null && el.closest('summary') === null;
      return el.getClientRects().length > 0 && s.visibility !== 'hidden' && el.closest('[inert]') === null && !closedDetails && !(el as HTMLInputElement).disabled;
    });
    if (!usable) continue;
    await control.focus();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const result = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const ring = el.closest<HTMLElement>('label[data-segment]') ?? el;
      const s = getComputedStyle(ring);
      const r = ring.getBoundingClientRect();
      const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
      const reach = outline ? Math.max(0, parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset)) : 0;
      const errors: string[] = [];
      if (!outline && s.boxShadow === 'none') errors.push('no visible focus ring');
      const vw = document.documentElement.clientWidth;
      // A control larger than the viewport (a scrolling table at 400% zoom) cannot show its whole ring.
      const fits = r.width + 2 * reach <= vw && r.height + 2 * reach <= innerHeight;
      if (fits && (r.left - reach < -1 || r.right + reach > vw + 1 || r.top - reach < -1 || r.bottom + reach > innerHeight + 1)) errors.push('ring outside the viewport');
      for (let p = ring.parentElement; p; p = p.parentElement) {
        const ps = getComputedStyle(p);
        const b = p.getBoundingClientRect();
        if (['hidden', 'clip', 'auto', 'scroll'].includes(ps.overflowX) && (r.left - reach < b.left - 1 || r.right + reach > b.right + 1)) errors.push(`clipped across by ${p.tagName.toLowerCase()}`);
        if (['hidden', 'clip', 'auto', 'scroll'].includes(ps.overflowY) && (r.top - reach < b.top - 1 || r.bottom + reach > b.bottom + 1)) errors.push(`clipped down by ${p.tagName.toLowerCase()}`);
      }
      const header = document.querySelector<HTMLElement>('[data-site-header]');
      if (header && !header.contains(ring) && getComputedStyle(header).position === 'sticky') {
        const h = header.getBoundingClientRect();
        if (r.top < h.bottom - 1 && r.bottom > h.top) {
          const cover = document.elementFromPoint(r.left + r.width / 2, Math.max(r.top, h.top) + 1);
          if (cover && header.contains(cover)) errors.push('under the sticky header');
        }
      }
      const name = (ring.getAttribute('aria-label') ?? ring.textContent ?? '').trim().slice(0, 60);
      return errors.length ? { name, tag: ring.tagName.toLowerCase(), errors } : null;
    });
    if (result) findings.push(result);
  }
  return findings;
}

async function targets(page: Page, route: string, label: string) {
  // The skip link is clipped to 1 px until it has focus: measure it in its usable, focused state.
  await page.getByRole('link', { name: 'Skip to content' }).focus();
  const report = await touchTargetReport(page);
  expect.soft(report.small, `${label}: targets under 44 px`).toEqual([]);
  expect.soft(report.overlaps, `${label}: inline links over another target`).toEqual([]);
  const exempt = report.sentenceLinks.map((name) => `default: ${name}`);
  expect.soft(unpinnedExemptions(exempt, await pinnedExemptions(page, route), ['default']), `${label}: inline exemptions`).toEqual([]);
}

async function common(page: Page, label: string, route: string) {
  expect.soft(await sideways(page), `${label}: sideways scroll`).toBeLessThanOrEqual(0);
  expect.soft(await chartText(page, route), `${label}: chart text`).toEqual([]);
  expect.soft(await incompleteText(page), `${label}: incomplete text`).toEqual([]);
  expect.soft(await scrolledProse(page), `${label}: prose that scrolls sideways`).toEqual([]);
  expect.soft(await controlRows(page), `${label}: control rows out of line`).toEqual([]);
  expect.soft(await navGaps(page), `${label}: header link gaps`).toEqual([]);
  expect.soft(await colourOnly(page), `${label}: status by colour alone`).toEqual([]);
}

const once = (name: string) => name === 'desktop-chromium' || name === 'desktop-webkit';

test.describe('Remaining quality: every page across the size matrix', () => {
  for (const route of ROUTES) {
    for (const size of SIZES) {
      test(`@quality ${route} at ${size.name} (${size.note}): reflow, targets, focus, chart text, motion and complete text`, async ({ browser }, info) => {
        test.skip(!once(info.project.name), 'explicit sizes, once per engine');
        test.setTimeout(240_000);
        const page = await openAt(browser, route, size);
        const label = `${route} at ${size.name}`;
        expect.soft(await motion(page), `${label}: motion before any input`).toEqual([]);
        await common(page, label, route);
        await targets(page, route, label);
        expect.soft(await focusRings(page), `${label}: focus rings`).toEqual([]);
        await page.context().close();
      });
    }
  }
});

test.describe('Remaining quality: limits', () => {
  for (const route of CASE_ROUTES) {
    test(`@quality ${route} states at least two real limits`, async ({ browser }, info) => {
      test.skip(info.project.name !== 'desktop-chromium', 'once');
      const page = await openAt(browser, route, sizeNamed('1440'));
      const limits = page.locator('section#limits');
      await expect(limits).toHaveCount(1);
      const items = await limits.evaluate((section) => {
        const list = [...section.querySelectorAll('li')];
        const blocks = list.length ? list : [...section.querySelectorAll('p')];
        return blocks.map((b) => (b.textContent ?? '').trim().replace(/\s+/g, ' '));
      });
      // A real limit is a sentence that names what the work cannot show, not a word or a heading.
      const real = items.filter((t) => t.split(' ').length >= 8);
      expect.soft(real.length, `${route}: limits ${JSON.stringify(items)}`).toBeGreaterThanOrEqual(2);
      await page.context().close();
    });
  }
});

test.describe('Remaining quality: representative states', () => {
  for (const state of STATES) {
    for (const sizeName of state.sizes) {
      test(`@quality state ${state.id} at ${sizeName}`, async ({ browser }, info) => {
        test.skip(!once(info.project.name), 'explicit sizes, once per engine');
        test.setTimeout(240_000);
        const size = sizeOrPrint(sizeName);
        const page = await openAt(browser, state.url, size, state.options ?? {}, !state.noIslandWait);
        if (state.print) await page.emulateMedia({ media: 'print' });
        if (state.enter) await state.enter(page);
        const label = `${state.id} at ${sizeName}`;
        await common(page, label, state.route);
        if (state.print) {
          await expect.soft(page.locator('[data-site-header]'), `${label}: header in print`).toBeHidden();
          await expect.soft(page.getByRole('contentinfo'), `${label}: footer in print`).toBeHidden();
        } else {
          await targets(page, state.route, label);
        }
        if (state.id === 'about-photo') {
          const photo = await page.locator('main img').first().evaluate((img: HTMLImageElement) => {
            const r = img.getBoundingClientRect();
            const s = getComputedStyle(img);
            return { width: r.width, height: r.height, natural: [img.naturalWidth, img.naturalHeight], fit: s.objectFit, radius: s.borderRadius, dpr: devicePixelRatio, alt: img.alt };
          });
          // A 4 by 5 rectangle, never a circle, never upscaled, never cropped further than its file.
          expect.soft(Math.abs(photo.width / photo.height - 0.8), `${label}: aspect ${JSON.stringify(photo)}`).toBeLessThanOrEqual(0.01);
          expect.soft(Math.abs(photo.natural[0]! / photo.natural[1]! - photo.width / photo.height), `${label}: crop ${JSON.stringify(photo)}`).toBeLessThanOrEqual(0.01);
          expect.soft(photo.natural[0]!, `${label}: resolution ${JSON.stringify(photo)}`).toBeGreaterThanOrEqual(Math.round(photo.width * photo.dpr) - 1);
          expect.soft(photo.radius, `${label}: shape`).not.toContain('50%');
          expect.soft(photo.alt.length, `${label}: alt`).toBeGreaterThan(20);
        }
        await page.context().close();
      });
    }
  }
});
