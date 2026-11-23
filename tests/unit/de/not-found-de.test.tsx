// The German 404 is rendered per request, so the build audit never sees it: this runs the same audit on
// its body (lang, English leak, German links, numbers and banned phrases).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NotFoundBody } from '@/components/shell/NotFoundBody';
import { FACTS, FACT_DISPLAYS_DE } from '@/lib/facts/facts.generated';
import { auditHtml } from '../../../scripts/truth-audit';

describe('the German 404', () => {
  it('passes the truth audit as a German page', () => {
    const body = renderToStaticMarkup(<NotFoundBody locale="de" />);
    const html = `<!doctype html><html lang="de"><head><title>Seite nicht gefunden</title></head><body>${body}</body></html>`;
    expect(auditHtml(html, { route: '/de/nicht-da', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS_DE, denylist: [], document: true })).toEqual([]);
  });

  it('is caught by the audit when it prints the English body (the test can fail)', () => {
    const body = renderToStaticMarkup(<NotFoundBody locale="en" />);
    const html = `<!doctype html><html lang="de"><head><title>t</title></head><body>${body}</body></html>`;
    const kinds = auditHtml(html, { route: '/de/nicht-da', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS_DE, denylist: [], document: true }).map((f) => f.kind);
    expect(kinds).toContain('english-leak');
  });
});
