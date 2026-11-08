// Finds launch placeholders (`data-launch-placeholder`) in the built pages: facts the site does not
// state yet because they are not verified. A production launch needs none. It is not part of
// `npm run check` or CI; `npm run launch:check` runs it with the other launch conditions.
//
//   npm run build && node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/launch-placeholders.ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';

const MARKER = 'data-launch-placeholder';

function textOf(node: T.ParentNode): string {
  return node.childNodes
    .map((c) => (c.nodeName === '#text' ? (c as T.TextNode).value : 'childNodes' in c ? textOf(c as T.ParentNode) : ''))
    .join(' ');
}

function collect(node: T.ParentNode, file: string, out: { file: string; text: string }[]): void {
  for (const child of node.childNodes) {
    if (!('tagName' in child)) continue;
    const el = child as T.Element;
    const marker = el.attrs.find((a) => a.name === MARKER);
    if (marker !== undefined) {
      out.push({ file, text: `${marker.value}: ${textOf(el).replace(/\s+/g, ' ').trim()}` });
      continue;
    }
    collect(el, file, out);
  }
}

/** Every element that carries the marker, as its file and "<fact id>: <text>". */
export function findPlaceholders(htmlFiles: string[]): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const file of htmlFiles) collect(parse(readFileSync(file, 'utf8')), file, out);
  return out;
}

/** The built pages of the app under <root>/.next/server/app. */
export function builtPages(root: string): string[] {
  const appDir = join(root, '.next/server/app');
  if (!existsSync(appDir)) return [];
  return readdirSync(appDir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => join(appDir, f));
}

/** Exit code 1 when a built page has a placeholder or there is no build; 0 otherwise. */
export function main(argv: string[], out: (line: string) => void = (l) => process.stdout.write(`${l}\n`)): number {
  const at = argv.indexOf('--root');
  const root = at === -1 ? process.cwd() : (argv[at + 1] ?? process.cwd());
  const pages = builtPages(root);
  if (pages.length === 0) {
    out('launch-placeholders: no built pages under .next/server/app (run npm run build first)');
    return 1;
  }
  const found = findPlaceholders(pages);
  for (const p of found) out(`launch placeholder in ${p.file}: ${p.text}`);
  if (found.length > 0) return 1;
  out(`launch-placeholders: ${pages.length} pages, none`);
  return 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
