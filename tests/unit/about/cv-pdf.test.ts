// Whether the site offers the CV as a PDF. The PDF and its metadata file are written together by the
// render wrapper; the build reads both once (next.config.ts) and embeds the result with the file's
// size, so every page, including one regenerated later, agrees. Anything missing, malformed or
// mismatched means "no PDF": no page then offers a download, so no link points at a missing file.
// The header and the hero link the CV page in either case.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CV_PDF_HREF, cvPdf, cvPdfSize, parseCvPdf } from '@/lib/cv-pdf';
import { cvPdfEnv, readCvPdf } from '@/lib/cv-pdf-file';
import { CV_LINK } from '@/lib/site';

const repo = join(import.meta.dirname, '../../..');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const PDF = Buffer.from('%PDF-1.4\n% synthetic\n%%EOF\n');
const RENDERED = '2026-11-12T10:00:00Z';

const dirs: string[] = [];
function site(files: { pdf?: Buffer; meta?: unknown }): string {
  const root = mkdtempSync(join(tmpdir(), 'cv-pdf-'));
  dirs.push(root);
  mkdirSync(join(root, 'public'));
  if (files.pdf) writeFileSync(join(root, 'public', 'cv.pdf'), files.pdf);
  if (files.meta !== undefined) {
    writeFileSync(join(root, 'public', 'cv.meta.json'), typeof files.meta === 'string' ? files.meta : JSON.stringify(files.meta));
  }
  return root;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const goodMeta = () => ({ sha256: sha256(PDF), renderedAt: RENDERED, web: true });

describe('readCvPdf: the checked PDF and its metadata, read at build time', () => {
  it('returns the hash, the render time and the size when both files exist and agree', () => {
    expect(readCvPdf(site({ pdf: PDF, meta: goodMeta() }))).toEqual({ sha256: sha256(PDF), renderedAt: RENDERED, bytes: PDF.length });
  });

  it('is null with no PDF, with a PDF but no metadata, or with metadata but no PDF', () => {
    expect(readCvPdf(site({}))).toBeNull();
    expect(readCvPdf(site({ pdf: PDF }))).toBeNull();
    expect(readCvPdf(site({ meta: goodMeta() }))).toBeNull();
  });

  it('is null when the metadata names another PDF, is not a web render, or has other fields', () => {
    expect(readCvPdf(site({ pdf: PDF, meta: { ...goodMeta(), sha256: sha256('other') } }))).toBeNull();
    expect(readCvPdf(site({ pdf: PDF, meta: { ...goodMeta(), web: false } }))).toBeNull();
    expect(readCvPdf(site({ pdf: PDF, meta: { ...goodMeta(), extra: 1 } }))).toBeNull();
    const noTime: Partial<ReturnType<typeof goodMeta>> = goodMeta();
    delete noTime.renderedAt;
    expect(readCvPdf(site({ pdf: PDF, meta: noTime }))).toBeNull();
  });

  it('is null for malformed metadata, a bad render time, an empty PDF or a PDF that is not a file', () => {
    expect(readCvPdf(site({ pdf: PDF, meta: '{not json' }))).toBeNull();
    expect(readCvPdf(site({ pdf: PDF, meta: '[]' }))).toBeNull();
    expect(readCvPdf(site({ pdf: PDF, meta: { ...goodMeta(), renderedAt: 'yesterday' } }))).toBeNull();
    const empty = Buffer.alloc(0);
    expect(readCvPdf(site({ pdf: empty, meta: { ...goodMeta(), sha256: sha256(empty) } }))).toBeNull();
    const root = site({ meta: goodMeta() });
    mkdirSync(join(root, 'public', 'cv.pdf'));
    expect(readCvPdf(root)).toBeNull();
  });

  it('cvPdfEnv is the JSON the build embeds, or an empty string', () => {
    expect(cvPdfEnv(site({}))).toBe('');
    expect(JSON.parse(cvPdfEnv(site({ pdf: PDF, meta: goodMeta() })))).toEqual({ sha256: sha256(PDF), renderedAt: RENDERED, bytes: PDF.length });
  });
});

describe('parseCvPdf: the embedded value', () => {
  it('parses what cvPdfEnv wrote and rejects anything else', () => {
    const good = { sha256: sha256(PDF), renderedAt: RENDERED, bytes: PDF.length };
    expect(parseCvPdf(JSON.stringify(good))).toEqual(good);
    const noBytes: Partial<typeof good> = { ...good };
    delete noBytes.bytes;
    for (const bad of [
      undefined,
      '',
      '{',
      'null',
      '[]',
      '{}',
      JSON.stringify({ ...good, sha256: 'abc' }),
      JSON.stringify({ ...good, extra: 1 }),
      JSON.stringify(noBytes),
      JSON.stringify({ ...good, bytes: 0 }),
      JSON.stringify({ ...good, bytes: 1.5 }),
      JSON.stringify({ ...good, bytes: '12' }),
    ]) {
      expect(parseCvPdf(bad), String(bad)).toBeNull();
    }
  });
});

describe('cvPdf: the PDF this build offers', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.CV_PDF;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.CV_PDF;
    else process.env.CV_PDF = saved;
  });

  it('reads the embedded value; nothing, or anything broken, is no PDF', () => {
    const good = { sha256: sha256(PDF), renderedAt: RENDERED, bytes: PDF.length };
    process.env.CV_PDF = JSON.stringify(good);
    expect(cvPdf()).toEqual(good);
    delete process.env.CV_PDF;
    expect(cvPdf()).toBeNull();
    process.env.CV_PDF = '{"broken"';
    expect(cvPdf()).toBeNull();
  });

  it('the file is /cv.pdf; the CV link of the header is always the CV page', () => {
    expect(CV_PDF_HREF).toBe('/cv.pdf');
    expect(CV_LINK).toEqual({ label: 'CV', href: '/cv' });
  });
});

describe('cvPdfSize: the size on the download button', () => {
  it('whole kilobytes under a megabyte, at least 1 KB', () => {
    expect(cvPdfSize(1)).toEqual({ value: 1, unit: 'count', decimals: 0, label: 'KB' });
    expect(cvPdfSize(86_016)).toEqual({ value: 84, unit: 'count', decimals: 0, label: 'KB' });
    expect(cvPdfSize(1024 * 1023)).toEqual({ value: 1023, unit: 'count', decimals: 0, label: 'KB' });
  });

  it('megabytes to one decimal from 1,024 KB up', () => {
    expect(cvPdfSize(1024 * 1024)).toEqual({ value: 1, unit: 'decimal', decimals: 1, label: 'MB' });
    expect(cvPdfSize(1.26 * 1024 * 1024)).toEqual({ value: 1.3, unit: 'decimal', decimals: 1, label: 'MB' });
  });
});

describe('the build embeds the result for every page', () => {
  afterEach(() => vi.resetModules());

  it('next.config passes CV_PDF, read from this repository', async () => {
    vi.resetModules();
    const config = (await import('../../../next.config.ts')).default;
    expect(config.env?.CV_PDF).toBe(cvPdfEnv(repo));
  });

  it('a committed PDF always has metadata that names it; with neither file the build embeds nothing', () => {
    const pdf = existsSync(join(repo, 'public', 'cv.pdf'));
    expect(existsSync(join(repo, 'public', 'cv.meta.json'))).toBe(pdf);
    if (pdf) expect(readCvPdf(repo)).not.toBeNull();
    else expect(cvPdfEnv(repo)).toBe('');
  });
});
