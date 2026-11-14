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
// The last four also run over compiled CSS (pass 1); in source they read inline `style` objects and
// SVG paint attributes, which Tailwind never sees.
export const SOURCE_RULES: readonly RuleId[] = [
  'no-hex', 'no-arrow-in-content', 'no-middle-dot', 'no-emoji',
  'no-shadow', 'no-caps', 'no-mono', 'no-arbitrary-colour',
];

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
// Matched on the lower-cased family list with quotes removed and underscores as spaces, so an
// arbitrary family such as font-['SF_Mono',Menlo] is caught as well as the generic keyword.
const MONO =
  /--font-code|--default-mono-font-family|\b(?:(?:ui-)?monospace|menlo|monaco|consolas|courier(?: new)?|sf ?mono(?:-regular)?|fira (?:code|mono)|jetbrains mono|source code pro|roboto mono|cascadia(?: code| mono)?|ibm plex mono|dejavu sans mono|liberation mono)\b/;
const normaliseFamily = (value: string) => value.toLowerCase().replace(/["']/g, '').replace(/[_\s]+/g, ' ');
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

function insideAtRule(node: Node, test: (atRule: AtRule) => boolean): boolean {
  for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && test(p as AtRule)) return true;
  return false;
}
const isKeyframes = (a: AtRule) => /(?:^|-)keyframes$/i.test(a.name);
const isProperty = (a: AtRule) => a.name.toLowerCase() === 'property';
// Tailwind declares the --tw-* defaults (such as --tw-ring-offset-color: #fff) in @property rules
// and in an `@layer properties` fallback; only there may a --tw-* variable hold a literal colour.
const isPropertyDefaults = (a: AtRule) =>
  isProperty(a) || (a.name.toLowerCase() === 'layer' && a.params.trim() === 'properties');

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
  const inProperty = insideAtRule(decl, isProperty);

  // Tailwind writes a drop-shadow() filter into --tw-drop-shadow-size, not into `filter` itself.
  if (prop === 'box-shadow' && !isNone(decl.value) && !hasRingClass(context)) add('no-shadow');
  else if (prop === 'text-shadow' && !isNone(decl.value)) add('no-shadow');
  else if ((prop.endsWith('filter') || prop.startsWith('--')) && !inProperty && /drop-shadow\(/i.test(decl.value)) add('no-shadow');

  if (prop === 'text-transform' && /uppercase/i.test(decl.value)) add('no-caps');

  if (
    prop === 'font-family' &&
    MONO.test(normaliseFamily(decl.value)) &&
    !rules.some((r) => r.selectors.every((s) => CODE_SELECTOR.test(s.trim())))
  ) {
    add('no-mono');
  }

  if (
    !prop.startsWith('--color-') &&
    !(prop.startsWith('--tw-') && insideAtRule(decl, isPropertyDefaults)) &&
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
      if (isKeyframes(node) && !/^depth-/.test(node.params.trim())) report('no-keyframes', node, head);
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

// Written as escapes so the script itself stays readable in any editor.
const ARROWS = /[\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F\u2794-\u27BF\u2B05-\u2B07\u203A]/gu;
const DOTS = /[\u00B7\u2022\u2219\u22C5\u2027\u30FB]/gu;
// Emoji, text-default pictographs forced to emoji with U+FE0F, and check, cross and ballot marks.
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F|[\u2610-\u2612\u2713-\u2718]/gu;
const CHARACTER_RULES: readonly (readonly [RuleId, RegExp])[] = [
  ['no-arrow-in-content', ARROWS],
  ['no-middle-dot', DOTS],
  ['no-emoji', EMOJI],
];

// Named entities that decode to a banned character (numeric entities are decoded generically).
const RIGHT = '\u2192';
const LEFT = '\u2190';
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  rarr: RIGHT, rightarrow: RIGHT, RightArrow: RIGHT, srarr: RIGHT, ShortRightArrow: RIGHT,
  longrightarrow: RIGHT, LongRightArrow: RIGHT, xrarr: RIGHT, rarrw: RIGHT, map: RIGHT, mapsto: RIGHT,
  larr: LEFT, leftarrow: LEFT, LeftArrow: LEFT, slarr: LEFT, ShortLeftArrow: LEFT, longleftarrow: LEFT,
  LongLeftArrow: LEFT, xlarr: LEFT,
  uarr: '\u2191', darr: '\u2193', harr: '\u2194', nearr: '\u2197', nwarr: '\u2196', searr: '\u2198',
  swarr: '\u2199', crarr: '\u21B5', rArr: '\u21D2', Rightarrow: '\u21D2', DoubleRightArrow: '\u21D2',
  lArr: '\u21D0', Leftarrow: '\u21D0', DoubleLeftArrow: '\u21D0', uArr: '\u21D1', dArr: '\u21D3',
  hArr: '\u21D4', iff: '\u21D4', xrArr: '\u27F9', Longrightarrow: '\u27F9', rsaquo: '\u203A',
  middot: '\u00B7', centerdot: '\u00B7', CenterDot: '\u00B7', bull: '\u2022', bullet: '\u2022',
  sdot: '\u22C5',
  check: '\u2713', checkmark: '\u2713', cross: '\u2717',
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

// An arbitrary Tailwind value holding a literal colour, such as bg-[#fff], ring-[#d9620a] or
// text-[rgb(0_0_0)]. Checked in every string literal, because a const or a cva() variant string
// reaches className indirectly. Brackets keep prose such as "PR #123" and href="#add" clear.
const ARBITRARY_COLOUR_TOKEN = /\[[^\]\s]*(?:#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\()[^\]\s]*\]/;

const CODE_TAGS = new Set(['code', 'pre']);
const PAINT_ATTRS = new Set([
  'fill', 'stroke', 'stopColor', 'floodColor', 'lightingColor', 'color',
  'stop-color', 'flood-color', 'lighting-color',
]);
const COLOUR_ATTRS = new Set(['className', 'style', ...PAINT_ATTRS]);

// Inline style objects (`style={{ ... }}`) and SVG paint attributes. Only an object literal written
// in the attribute is read: a style object built elsewhere and passed by name is not followed.
// The CSS named colours (CSS Color Level 4), compared lower-case; `transparent` and `currentcolor`
// are deliberately not in the list, and `none`, `inherit`, `var(--color-*)` and `url(#id)` are not
// colours either.
const NAMED_COLOURS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
    'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
    'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
    'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
    'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
    'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
    'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
    'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise ' +
    'mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab ' +
    'orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru ' +
    'pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
    'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan ' +
    'teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' '),
);
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/i;
const STYLE_COLOUR_PROPS = new Set([
  'color', 'backgroundColor', 'background', 'borderColor', 'borderTopColor', 'borderRightColor',
  'borderBottomColor', 'borderLeftColor', 'border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
  'outline', 'outlineColor', 'fill', 'stroke', 'stopColor', 'floodColor', 'lightingColor', 'caretColor',
  'accentColor', 'textDecorationColor', 'columnRuleColor',
]);
const toCamel = (name: string) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** Whether a CSS value holds a colour literal: a colour function or a named colour. */
function hasColourLiteral(value: string): boolean {
  const v = value.replace(/var\([^)]*\)/gi, ' ').replace(/url\([^)]*\)/gi, ' ');
  return COLOUR_FUNCTION.test(v) || v.toLowerCase().split(/[\s,/]+/).some((token) => NAMED_COLOURS.has(token));
}

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

// The properties of an inline `style={{ ... }}` object literal, by the rule each one breaks.
function lintStyleObject(sink: Sink, sf: ts.SourceFile, initializer: ts.JsxAttributeValue, inCode: boolean): void {
  if (!ts.isJsxExpression(initializer) || !initializer.expression || !ts.isObjectLiteralExpression(initializer.expression)) return;
  for (const prop of initializer.expression.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? toCamel(prop.name.text) : undefined;
    if (key === undefined) continue;
    const line = sf.getLineAndCharacterOfPosition(prop.getStart(sf)).line + 1;
    const value = ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer)
      ? prop.initializer.text
      : undefined;
    const literalText = literalsIn(prop.initializer).map((l) => l.text).join(' ');
    if (key === 'boxShadow' || key === 'textShadow') {
      if (value?.trim().toLowerCase() !== 'none') push(sink, 'no-shadow', line);
    } else if ((key === 'filter' || key === 'backdropFilter') && /drop-shadow\(/i.test(literalText)) {
      push(sink, 'no-shadow', line);
    } else if (key === 'textTransform' && /uppercase/i.test(literalText)) {
      push(sink, 'no-caps', line);
    } else if (key === 'fontFamily' && !inCode && MONO.test(normaliseFamily(literalText))) {
      push(sink, 'no-mono', line);
    } else if (STYLE_COLOUR_PROPS.has(key) && hasColourLiteral(literalText)) {
      push(sink, 'no-arbitrary-colour', line);
    }
  }
}

function lintTypeScript(sink: Sink, text: string): void {
  const kind = sink.file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(sink.file, text, ts.ScriptTarget.Latest, true, kind);
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

  const visit = (node: ts.Node, inCode: boolean): void => {
    if (ts.isJsxElement(node) && CODE_TAGS.has(node.openingElement.tagName.getText(sf))) inCode = true;

    const colourAttr = ts.isJsxAttribute(node) && node.initializer && COLOUR_ATTRS.has(node.name.getText(sf));
    if (colourAttr) {
      for (const lit of literalsIn(node.initializer)) {
        if (HAS_HEX.test(stripUrls(lit.text))) push(sink, 'no-hex', lineOf(lit.getStart(sf)));
      }
    }
    // SVG paint attributes: a colour function or a named colour is as arbitrary as a hex.
    if (ts.isJsxAttribute(node) && node.initializer && PAINT_ATTRS.has(node.name.getText(sf))) {
      for (const lit of literalsIn(node.initializer)) {
        if (hasColourLiteral(lit.text)) push(sink, 'no-arbitrary-colour', lineOf(lit.getStart(sf)));
      }
    }
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === 'style' && node.initializer) {
      lintStyleObject(sink, sf, node.initializer, inCode);
    }
    // Outside colour attributes (already checked above), only arbitrary-colour tokens count.
    if (isLiteral(node) && !ts.findAncestor(node, (a) => ts.isJsxAttribute(a) && COLOUR_ATTRS.has(a.name.getText(sf)))) {
      if (ARBITRARY_COLOUR_TOKEN.test(stripUrls(node.text))) push(sink, 'no-hex', lineOf(node.getStart(sf)));
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
  const report = (node: Node, excerpt: string) =>
    sink.out.push({ rule: 'no-hex', file: sink.file, line: node.source?.start?.line ?? 0, excerpt: excerptOf(excerpt) });
  postcss.parse(text, { from: sink.file }).walk((node) => {
    // At-rule params cover `@apply bg-[#fff]`, which only reaches the compiled CSS as a declaration.
    if (node.type === 'decl' && HAS_HEX.test(stripUrls(node.value))) report(node, `${node.prop}: ${node.value}`);
    else if (node.type === 'atrule' && HAS_HEX.test(stripUrls(node.params))) report(node, `@${node.name} ${node.params}`);
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
