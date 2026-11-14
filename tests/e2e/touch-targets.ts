import type { Page } from '@playwright/test';

// The touch-target check shared by the accessibility matrix and the Home quality specs: every pointer
// target is at least 44 by 44 CSS px, except a link inside a sentence of running text, which WCAG's
// inline exception (2.5.5 and 2.5.8) lets be the height of the line. The links each route may exempt
// are pinned here, so a new exemption fails until it is listed and reviewed.

const pointerTargets = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"]';

/**
 * The links each route may exempt under the inline exception, in page order (default state). `while`
 * marks a link that is on the page only in some data states: the Split step names the Live test page
 * while a group has fewer than 50 views.
 */
export type InlineEntry = { name: string; while?: { selector: string; text: RegExp } };
export const HOME_INLINE: readonly InlineEntry[] = [{ name: 'Why so many?' }];
// The contact page names LinkedIn in its intro and the privacy notice in the note under Send message.
const CONTACT_INLINE: readonly InlineEntry[] = [{ name: 'LinkedIn' }, { name: 'privacy notice' }];
// The Audible page's top block gives its adoption figure the "Why so many?" link twice: once in the
// summary sentence and once in the sentence on what the rollout meant.
export const INLINE_EXEMPT: Record<string, readonly InlineEntry[]> = {
  '/': HOME_INLINE,
  '/?variant=a': HOME_INLINE,
  '/?variant=b': HOME_INLINE,
  '/contact': CONTACT_INLINE,
  // After sending, the form and its privacy note give way to the sent message; the intro stays.
  '/contact?sent=1': [{ name: 'LinkedIn' }],
  '/work/audible': [{ name: 'Why so many?' }, { name: 'Why so many?' }],
};

/** The names the route may exempt, in page order, in the page's current data state. */
export async function pinnedExemptions(page: Page, route: string): Promise<string[]> {
  const pinned: string[] = [];
  for (const entry of INLINE_EXEMPT[route] ?? []) {
    if (entry.while && !entry.while.text.test((await page.locator(entry.while.selector).first().textContent()) ?? '')) continue;
    pinned.push(entry.name);
  }
  return pinned;
}

/**
 * Where the exemptions found ("<state>: <name>", in page order) differ from the pinned names, per
 * measured state: an empty list when every state holds exactly the pinned list.
 */
export function unpinnedExemptions(exempt: readonly string[], pinned: readonly string[], states: readonly string[]): string[] {
  const out: string[] = [];
  for (const state of states) {
    const found = exempt.filter((e) => e.startsWith(`${state}: `)).map((e) => e.slice(state.length + 2));
    if (found.length !== pinned.length || found.some((name, i) => name !== pinned[i])) {
      out.push(`${state}: found [${found.join(', ')}], pinned [${pinned.join(', ')}]`);
    }
  }
  return out;
}

/**
 * The pointer targets of the page in their visible state: those under 44 by 44 CSS px; every link in a
 * sentence of running text (`sentenceLinks`, the list the pin compares); the small ones among those,
 * which WCAG's inline exception (2.5.5 and 2.5.8) lets be the height of the line (`exempt`); and any
 * such link that overlaps another target.
 */
export async function touchTargetReport(page: Page) {
  return page.locator(pointerTargets).evaluateAll((els) => {
    type Box = { tag: string; id: string; href: string | null; name: string | undefined; width: number; height: number };
    const seen = new Set<Element>();
    const small: Box[] = [];
    const exempt: string[] = [];
    const sentenceLinks: string[] = [];
    const overlaps: Box[] = [];
    const visible: { el: Element; r: DOMRect }[] = [];
    const inline: { el: Element; r: DOMRect; box: Box }[] = [];
    const TEXT_BLOCKS = new Set(['P', 'LI', 'DD', 'FIGCAPTION', 'BLOCKQUOTE', 'TD']);
    /** Text a sighted reader does not see: aria-hidden, invisible, not rendered, or clipped to 1 px (sr-only). */
    const hiddenText = (node: Node, block: Element): boolean => {
      for (let e = node.parentElement; e && e !== block.parentElement; e = e.parentElement) {
        if (e.getAttribute('aria-hidden') === 'true' || !e.checkVisibility({ checkVisibilityCSS: true })) return true;
        const r = e.getBoundingClientRect();
        if (r.width <= 1 && r.height <= 1) return true;
      }
      return false;
    };
    /**
     * WCAG's inline exception, narrowly: an inline `a[href]` with no touch-target marker whose nearest
     * block ancestor is a text block (p, li, dd, figcaption, blockquote, td) holding visible text that is
     * outside every link, button and other target.
     */
    const inSentence = (el: Element): boolean => {
      if (el.tagName !== 'A' || !el.hasAttribute('href') || el.hasAttribute('data-touch-target') || getComputedStyle(el).display !== 'inline') return false;
      let block = el.parentElement;
      while (block && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement;
      if (!block || !TEXT_BLOCKS.has(block.tagName)) return false;
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let outside = '';
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const target = n.parentElement?.closest('a, button, [role]');
        if ((target && target !== block && block.contains(target)) || hiddenText(n, block)) continue;
        outside += n.textContent ?? '';
      }
      return outside.trim() !== '';
    };
    for (const el of els) {
      // The segment label, rather than its sr-only radio, is the actual pointer target.
      const target = el.closest('label[data-segment]') ?? el;
      const s = getComputedStyle(target);
      const r = target.getBoundingClientRect();
      if (seen.has(target) || r.width === 0 || r.height === 0 || s.display === 'none' || s.visibility === 'hidden' || target.closest('[inert]')) continue;
      // Closed details content can retain rectangles despite not being rendered.
      let closed = false;
      for (let ancestor: Element | null = target; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor instanceof HTMLDetailsElement && !ancestor.open && !ancestor.querySelector(':scope > summary')?.contains(target)) closed = true;
      }
      if (closed || !target.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      seen.add(target);
      visible.push({ el: target, r });
      const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 80);
      // Every link in running text, whatever its box: one that wraps onto two lines has a box of 44 px
      // or more, yet it is the same link in the same sentence, so the pin counts it at every width.
      const sentence = inSentence(target);
      if (sentence) sentenceLinks.push(name ?? '');
      if (r.width >= 44 && r.height >= 44) continue;
      const box = { tag: el.tagName, id: el.id, href: el.getAttribute('href'), name, width: r.width, height: r.height };
      if (sentence) {
        exempt.push(box.name ?? '');
        inline.push({ el: target, r, box });
      } else small.push(box);
    }
    // An exempt link must not overlap any other target.
    const meet = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    for (const link of inline) {
      if (visible.some((o) => o.el !== link.el && !o.el.contains(link.el) && !link.el.contains(o.el) && meet(link.r, o.r))) overlaps.push(link.box);
    }
    return { small, exempt, sentenceLinks, overlaps };
  });
}
