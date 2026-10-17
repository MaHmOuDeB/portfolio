// The design lint. It fails on the patterns the design system bans, in two passes, because a
// regular expression over source files cannot tell what a class name becomes (`clsx('uppercase')`,
// `@apply` and a `font-code` label all slip past it):
//
//   1. Compiled CSS (`--css <glob>`): property and selector rules over the CSS Tailwind actually
//      emitted for the build, parsed with postcss.
//   2. Source (`--src`): banned characters (arrows, middle dots, check marks, emoji) and their HTML
//      entities in TSX/TS text and MDX prose, and hex colours where colour can be written
//      (className, style, SVG paint attributes, CSS values). Code is never content: comments,
//      <code>/<pre> elements and MDX code spans and fences are skipped.
//
//   npm run lint:design:src              # source only (part of npm run check)
//   npm run build && npm run lint:design # source and the built CSS (CI build job)
//
// Each violation prints as `rule file:line excerpt`; any violation exits 1.
import { globSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import postcss, { type AtRule, type ChildNode, type Declaration, type Node, type Rule } from 'postcss';
import ts from 'typescript';

export type RuleId =
  | 'no-shadow' | 'no-caps' | 'no-mono' | 'no-keyframes' | 'no-arbitrary-colour'
  | 'no-fade-up' | 'no-hover-move' | 'no-dark'                      // pass 1, compiled CSS
  | 'no-hex' | 'no-arrow-in-content' | 'no-middle-dot' | 'no-emoji'; // pass 2, source
export type Violation = { rule: RuleId; file: string; line: number; excerpt: string };

export const CSS_RULES: readonly RuleId[] = [
  'no-shadow', 'no-caps', 'no-mono', 'no-keyframes', 'no-arbitrary-colour', 'no-fade-up',
  'no-hover-move', 'no-dark',
];
export const SOURCE_RULES: readonly RuleId[] = ['no-hex', 'no-arrow-in-content', 'no-middle-dot', 'no-emoji'];

// Files exempt from a source rule, keyed by repo-relative path. Each entry says why.
export const ALLOW_LIST: Readonly<Record<string, { rules: RuleId[]; reason: string }>> = {
  'src/styles/tokens.css': { rules: ['no-hex'], reason: 'defines the colour tokens, the only place hex values belong' },
  'src/app/icon.svg': { rules: ['no-hex'], reason: 'the favicon is a static file, so its colours are written inline' },
  'src/lib/stats/power.ts': {
    rules: ['no-middle-dot'],
    reason: 'SAMPLE_SIZE_FORMULA uses U+00B7 as the multiplication sign and is only ever shown inside <code>',
  },
};

// ---------------------------------------------------------------------------------------------
// Shared helpers

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const HAS_HEX = /#[0-9a-fA-F]{3,8}\b/;
// url(#id) references an SVG element, not a colour (`url(#fade)` would otherwise read as hex).
const URL_FN = /url\([^)]*\)/gi;
const stripUrls = (value: string) => value.replace(URL_FN, 'url()');

const MAX_EXCERPT = 120;
function excerptOf(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > MAX_EXCERPT ? `${one.slice(0, MAX_EXCERPT - 3)}...` : one;
}

// ---------------------------------------------------------------------------------------------
// Pass 1: compiled CSS

// Fully transparent hex (#0000, #rrggbb00) is not a colour: lightningcss writes `transparent` so.
const ZERO_ALPHA_HEX = /^#(?:[0-9a-fA-F]{3}0|[0-9a-fA-F]{6}00)$/;
const COLOUR_FN = /\b(?:rgba?|hsla?)\(/i;
const FADE_UP = /fade-?up|animate-in|slide-in-from/;
const HOVER_MOVE_SELECTOR = /hover\\?:-?(translate|scale)/;
const HOVER_MOVE_PROPS = new Set(['transform', '-webkit-transform', 'translate', 'scale']);
const DARK_SCHEME = /prefers-color-scheme\s*:\s*dark/i;
const DARK_VARIANT = 'dark\\:';
const MONO = /monospace|--font-code|--default-mono-font-family/i;
const CODE_SELECTOR = /^(?:pre|code|kbd|samp)$|^\.code-block/;
const CLASS = /\.((?:\\.|[\w-])+)/g;

function arbitraryColour(value: string): boolean {
  const v = stripUrls(value);
  if (COLOUR_FN.test(v)) return true;
  return [...v.matchAll(HEX)].some((m) => !ZERO_ALPHA_HEX.test(m[0]));
}

// The rules enclosing a node, outermost first (more than one only in nested CSS).
function enclosingRules(node: Node): Rule[] {
  const rules: Rule[] = [];
  for (let p = node.parent; p; p = p.parent) if (p.type === 'rule') rules.unshift(p as Rule);
  return rules;
}

function insideAtRule(node: Node, test: (name: string) => boolean): boolean {
  for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && test((p as AtRule).name)) return true;
  return false;
}
const isKeyframes = (name: string) => /(?:^|-)keyframes$/i.test(name);

// Whether a selector carries a Tailwind ring utility class (`ring-2`, `focus-visible:ring-2`, ...).
function hasRingClass(selector: string): boolean {
  return [...selector.matchAll(CLASS)].some((m) => {
    const cls = m[1]!.replace(/\\(.)/g, '$1');
    return /^(?:inset-)?ring(?:-|$)/.test(cls.slice(cls.lastIndexOf(':') + 1));
  });
}

const isNone = (value: string) => value.trim().toLowerCase() === 'none';

function lintDeclaration(decl: Declaration, report: (rule: RuleId, node: Node, excerpt: string) => void): void {
  const prop = decl.prop.toLowerCase();
  const rules = enclosingRules(decl);
  const context = rules.map((r) => r.selector).join(' ');
  const excerpt = `${context ? `${context} ` : ''}{ ${decl.prop}: ${decl.value} }`;
  const add = (rule: RuleId) => report(rule, decl, excerpt);
  const inProperty = insideAtRule(decl, (name) => name.toLowerCase() === 'property');

  // Tailwind writes a drop-shadow() filter into --tw-drop-shadow-size, not into `filter` itself.
  if (prop === 'box-shadow' && !isNone(decl.value) && !hasRingClass(context)) add('no-shadow');
  else if (prop === 'text-shadow' && !isNone(decl.value)) add('no-shadow');
  else if ((prop.endsWith('filter') || prop.startsWith('--')) && !inProperty && /drop-shadow\(/i.test(decl.value)) add('no-shadow');

  if (prop === 'text-transform' && /uppercase/i.test(decl.value)) add('no-caps');

  if (
    prop === 'font-family' &&
    MONO.test(decl.value) &&
    !rules.some((r) => r.selectors.every((s) => CODE_SELECTOR.test(s.trim())))
  ) {
    add('no-mono');
  }

  if (
    !prop.startsWith('--color-') &&
    !prop.startsWith('--tw-') &&
    !inProperty &&
    arbitraryColour(decl.value)
  ) {
    add('no-arbitrary-colour');
  }

  // A rule whose own selector is a hover-move utility is reported once, for the selector.
  if (
    HOVER_MOVE_PROPS.has(prop) &&
    context.includes(':hover') &&
    !rules.some((r) => HOVER_MOVE_SELECTOR.test(r.selector))
  ) {
    add('no-hover-move');
  }
}

export function lintCompiledCss(css: string, file: string): Violation[] {
  const violations: Violation[] = [];
  const report = (rule: RuleId, node: Node, excerpt: string) =>
    violations.push({ rule, file, line: node.source?.start?.line ?? 0, excerpt: excerptOf(excerpt) });

  postcss.parse(css, { from: file }).walk((node: ChildNode) => {
    if (node.type === 'atrule') {
      const head = `@${node.name} ${node.params}`;
      if (isKeyframes(node.name) && !node.params.trim().startsWith('scroll-moment-')) report('no-keyframes', node, head);
      if (DARK_SCHEME.test(node.params)) report('no-dark', node, head);
    } else if (node.type === 'rule') {
      if (insideAtRule(node, isKeyframes)) return; // `from`, `to` and percentages are not selectors
      if (FADE_UP.test(node.selector)) report('no-fade-up', node, node.selector);
      if (HOVER_MOVE_SELECTOR.test(node.selector)) report('no-hover-move', node, node.selector);
      if (node.selector.includes(DARK_VARIANT)) report('no-dark', node, node.selector);
    } else if (node.type === 'decl') {
      lintDeclaration(node, report);
    }
  });
  return violations;
}

// ---------------------------------------------------------------------------------------------
// Pass 2: source

const CHARACTER_RULES: readonly (readonly [RuleId, RegExp])[] = [
  ['no-arrow-in-content', /→/gu],
  ['no-middle-dot', /·/gu],
  // Emoji, text-default pictographs forced to emoji with U+FE0F, and check, cross and ballot marks.
  ['no-emoji', /\p{Emoji_Presentation}|\p{Extended_Pictographic}️|[☐-☒✓-✘]/gu],
];

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  rarr: '→', rightarrow: '→', RightArrow: '→', srarr: '→', ShortRightArrow: '→',
  middot: '·', centerdot: '·', CenterDot: '·',
  check: '✓', checkmark: '✓', cross: '✗',
};

function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z]+));/g, (raw, dec, hex, name) => {
    if (name !== undefined) return NAMED_ENTITIES[name] ?? raw;
    const code = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16);
    return code <= 0x10ffff ? String.fromCodePoint(code) : raw;
  });
}

type Sink = { file: string; lines: readonly string[]; out: Violation[] };
const push = (sink: Sink, rule: RuleId, line: number) =>
  sink.out.push({ rule, file: sink.file, line, excerpt: excerptOf(sink.lines[line - 1] ?? '') });

// Reports the banned characters in `text`, which starts on `firstLine` of the file.
function checkCharacters(sink: Sink, text: string, firstLine: number): void {
  const decoded = decodeEntities(text);
  for (const [rule, pattern] of CHARACTER_RULES) {
    for (const m of decoded.matchAll(pattern)) {
      push(sink, rule, firstLine + (decoded.slice(0, m.index).match(/\n/g)?.length ?? 0));
    }
  }
}

const CODE_TAGS = new Set(['code', 'pre']);
const COLOUR_ATTRS = new Set(['className', 'style', 'fill', 'stroke', 'stopColor', 'floodColor', 'color', 'stop-color', 'flood-color']);

type Literal = ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateLiteralLikeNode;
const isLiteral = (node: ts.Node): node is Literal =>
  ts.isStringLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) ||
  ts.isTemplateHead(node) ||
  ts.isTemplateMiddle(node) ||
  ts.isTemplateTail(node);

function literalsIn(node: ts.Node): Literal[] {
  const found: Literal[] = [];
  const visit = (n: ts.Node): void => {
    if (isLiteral(n)) found.push(n);
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function lintTypeScript(sink: Sink, text: string): void {
  const kind = sink.file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(sink.file, text, ts.ScriptTarget.Latest, true, kind);
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

  const visit = (node: ts.Node, inCode: boolean): void => {
    if (ts.isJsxElement(node) && CODE_TAGS.has(node.openingElement.tagName.getText(sf))) inCode = true;

    if (ts.isJsxAttribute(node) && node.initializer && COLOUR_ATTRS.has(node.name.getText(sf))) {
      for (const lit of literalsIn(node.initializer)) {
        if (HAS_HEX.test(stripUrls(lit.text))) push(sink, 'no-hex', lineOf(lit.getStart(sf)));
      }
    }

    if (!inCode) {
      // JsxText has no leading trivia, so its pos is where the text starts.
      if (ts.isJsxText(node)) checkCharacters(sink, node.text, lineOf(node.pos));
      else if (isLiteral(node)) checkCharacters(sink, node.text, lineOf(node.getStart(sf)));
    }
    ts.forEachChild(node, (child) => visit(child, inCode));
  };
  visit(sf, false);
}

// Replaces every character but newlines with a space, so offsets and line numbers survive.
const blank = (s: string) => s.replace(/[^\n]/g, ' ');

function stripMdxCode(text: string): string {
  const lines = text.split('\n');
  let fence: { char: string; length: number } | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (m && m[1]![0] === fence.char && m[1]!.length >= fence.length && line.trim() === m[1]) fence = undefined;
      lines[i] = blank(line);
    } else if (m) {
      fence = { char: m[1]![0]!, length: m[1]!.length };
      lines[i] = blank(line);
    }
  }
  return lines
    .join('\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<(code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, blank)
    .replace(/(`+)[^\n]*?\1/g, blank);
}

const MDX_COLOUR_ATTR = /(?<![\w-])(className|style|fill|stroke|stopColor|floodColor|color|stop-color|flood-color)=("[^"]*"|'[^']*'|\{[^}]*\})/g;

function lintMdx(sink: Sink, text: string): void {
  const prose = stripMdxCode(text);
  for (const m of prose.matchAll(MDX_COLOUR_ATTR)) {
    if (HAS_HEX.test(stripUrls(m[2]!))) push(sink, 'no-hex', prose.slice(0, m.index).split('\n').length);
  }
  checkCharacters(sink, prose, 1);
}

function lintSourceCss(sink: Sink, text: string): void {
  postcss.parse(text, { from: sink.file }).walkDecls((decl) => {
    if (HAS_HEX.test(stripUrls(decl.value))) {
      sink.out.push({ rule: 'no-hex', file: sink.file, line: decl.source?.start?.line ?? 0, excerpt: excerptOf(`${decl.prop}: ${decl.value}`) });
    }
  });
}

function repoPath(file: string): string {
  const rel = isAbsolute(file) ? relative(process.cwd(), file) : file;
  return rel.split(sep).join('/').replace(/^\.\//, '');
}

export function lintSource(text: string, file: string): Violation[] {
  const sink: Sink = { file, lines: text.split('\n'), out: [] };
  if (/\.tsx?$/.test(file)) lintTypeScript(sink, text);
  else if (file.endsWith('.mdx')) lintMdx(sink, text);
  else if (file.endsWith('.css')) lintSourceCss(sink, text);
  else throw new Error(`design-lint: unsupported source file ${file}`);

  const allowed = ALLOW_LIST[repoPath(file)]?.rules ?? [];
  return sink.out.filter((v) => !allowed.includes(v.rule)).sort((a, b) => a.line - b.line);
}

// ---------------------------------------------------------------------------------------------
// CLI

const USAGE = 'usage: design-lint.ts [--src] [--css <glob>]...';
const posix = (p: string) => p.split(sep).join('/');

export function main(argv: string[]): number {
  let src = false;
  const cssGlobs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--src') src = true;
    else if (arg === '--css' && next !== undefined) {
      cssGlobs.push(next);
      i++;
    } else {
      console.error(USAGE);
      return 1;
    }
  }
  if (!src && cssGlobs.length === 0) {
    console.error(USAGE);
    return 1;
  }

  const violations: Violation[] = [];
  let files = 0;
  try {
    if (src) {
      for (const f of globSync(['src/**/*.{ts,tsx,css}', 'content/**/*.mdx']).map(posix).sort()) {
        files++;
        violations.push(...lintSource(readFileSync(f, 'utf8'), f));
      }
    }
    for (const pattern of cssGlobs) {
      const matched = globSync(pattern).map(posix).sort();
      if (matched.length === 0) {
        console.error(`design-lint: no files match ${pattern} (run the build first)`);
        return 1;
      }
      for (const f of matched) {
        files++;
        violations.push(...lintCompiledCss(readFileSync(f, 'utf8'), f));
      }
    }
  } catch (error) {
    console.error(`design-lint: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  for (const v of violations) console.log(`${v.rule} ${v.file}:${v.line} ${v.excerpt}`);
  if (violations.length > 0) {
    console.error(`design-lint: ${violations.length} violation(s) in ${files} file(s)`);
    return 1;
  }
  console.log(`design-lint: ${files} file(s) clean`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
