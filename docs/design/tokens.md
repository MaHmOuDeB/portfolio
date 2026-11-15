# Design tokens: Clarity, framed (light only)

`src/styles/tokens.css` is the source of truth. This file documents every name in it. A CI check
compares the two and fails if a token exists in one and not the other.

## Why this direction

The design is called Clarity and is light only. It extends the CV's design to the web: one neutral
sans, hierarchy from weight and space, grey links with an underline. Inter is the most common web
face, so the character comes from elsewhere: the interval glyph, the chart system and a tuned Inter
(optical sizes, `cv05`).

The framed look: the page is a very light grey canvas, cards and tiles are white with a hairline
and a 12 px radius, the content column carries a hairline rail at each side, and sections are
ruled off by hairlines, so a page reads as one framed sheet. Large headlines are two-tone: the
second clause is `quiet`. Small chips label sections. There are still no shadows.

## Closed namespaces

Every Tailwind namespace the site does not use is reset to `initial`, then only the names below are
redefined: colour, shadow, breakpoint, font, font weight, text, radius, tracking, ease, animate,
container, drop shadow, inset shadow, text shadow and perspective. `bg-blue-500`, `shadow-md`, `font-bold`,
`text-5xl`, `rounded-2xl`, `rounded-lg`, `tracking-widest` and `animate-bounce` produce nothing.
The theme is `@theme static`, so every variable is emitted even when no utility uses it (an SVG
`fill="var(--color-series-2)"` always resolves). There is no `--font-display` and no `.tabular`
class.

## Colour

The contrast pairs were checked when the palette was chosen: text pairs at WCAG AA 4.5:1, non-text pairs at 3:1
against the colour each mark sits next to, and a colour-vision distance of at least 15 between the
two chart series. Colours that touch where the bare pair is below 3:1 (an orange dot
on the blue line or the band, the band fill on white, the grid, the focus ring next to an `ink`
fill) are listed as overlap pairs, each with the drawing rule that makes it pass.

Contrast is given on `bg` (the grey canvas) and on `surface` (white cards).

| Token | Hex | Use | Contrast on bg / surface |
|---|---|---|---|
| `bg` | `#F7F7F8` | the page canvas, the header, the 2 px ring round dots, annotation halos | n/a |
| `surface` | `#FFFFFF` | cards, tiles, chips, secondary buttons and chart plates on the canvas (`bg-surface`) | n/a |
| `ink` | `#1D1D1F` | text, primary button fill, selected segment, zero line, the ink tile and the footer | 15.72 / 16.83 |
| `muted` | `#6E6E73` | secondary text, links and their underline, captions, input borders, the slider track edge, badge border, the running estimate line | 4.74 / 5.07 |
| `line` | `#E8E8ED` | chart grid, the inactive track fill | decorative |
| `accent` | `#0A5FD9` | controls: focus ring, the active part of a slider track | 5.37 / 5.75 |
| `series-1` | `#0A5FD9` | the first chart series, interval bounds (1 px lines), the glyph bar and caps, a tinted tag's word | 5.37 / 5.75 |
| `series-2` | `#D9620A` | the current estimate, the point being made, the live dot | 3.68 on surface (fills, lines and dots only, never text) |
| `series-ghost` | `#CEDFF7` | band fill only, the projected width at the cap, inactive curves | decorative |
| `ok` | `#1B7F3B` | the word for a passed check (for example "SRM passed"), the chip's "open" dot | 4.73 / 5.07 |
| `warn` | `#B04A00` | the word for a real warning (SRM, paused, error) | 5.13 / 5.49 |
| `hairline` | `ink` at 9% over clear | the frame's rails and section rules, card and tile borders, the header's bottom rule | decorative |
| `hairline-strong` | `ink` at 16% over clear | chip and secondary button borders, the card's "+" square, a sketch's frame | decorative |
| `quiet` | `ink` at 50% over clear | the second clause of a headline of 24 px or more, never body text (large text, 3:1) | 3.22 / 3.27 |
| `track` | `ink` at 5% over clear | a plain tag's fill (`muted` on it 4.60 on surface), a sketch's track | decorative |
| `tag-tint` | `series-1` at 10% over clear | a tinted tag's fill (`series-1` on it 4.96 on surface) | decorative |
| `on-ink` | `bg` at 70% over clear | body text and links on `ink` | 8.27 on ink |
| `on-ink-muted` | `bg` at 52% over clear | quiet text on `ink`: the colophon, the quiet clause on ink | 5.17 on ink |
| `glint` | `surface` at 70% over clear | the light that follows the pointer on a lean card; it lightens the tile and never tints it, so the muted text on a hovered card keeps its 4.5:1 | decorative |
| `rule-quiet` | `muted` at 28% over clear | the rules between the rows of a tile | decorative |
| `rule-on-ink` | `bg` at 20% over clear | the hairline on `ink`: the rules on the ink tile and in the footer | decorative |
| `dot` | `ink` at 14% over clear | the faint dot grid behind the Home band | decorative |
| `sheet-edge-ink` | `ink` at 85% over `surface` | the edge of the ink sheet in the Home band | decorative |
| `clear` | `transparent` | the clear end of a gradient or a mask, so a gradient never names `transparent` itself | n/a |
| `mask-opaque` | the `ink` value | the kept end of a mask, where only the alpha counts and no black is drawn | n/a |

Rules:
- Text never uses `series-2`.
- `accent` is a separate token that deliberately shares the `series-1` hue. Controls use `accent`;
  icons and decoration never use blue. The interval glyph is drawn in the series colours because it
  is a data mark (an interval and an estimate), not decoration.
- `series-2` means only the current estimate or the point being made. "Your view" is a `muted`
  x-axis tick, and the provenance badge is neutral.
- Status is always a word, with an optional glyph; colour only repeats it. `ok` against `warn` is
  only about 10 apart under red-green colour blindness, so they are never the only cue.
- Every `series-2` dot has a 2 px `bg` ring (a bare dot is 1.56:1 on the blue line and 2.72:1 on
  the band; with the ring it is 3.68:1).
- No other colours. No tinted greys, no black (`#000`). Gradients exist only as masks and the lean
  card's glint, and name their colours only through the tokens above: `globals.css` holds no
  `color-mix()`, colour function, hex, `black`, `white` or gradient `transparent`.
- Links are `muted` with a `muted` underline, never blue, and turn `ink` on hover and focus.
- Input borders and the slider track edge are `muted`, never `line` (1.22:1). The active part of
  the track is filled in `accent`.

## Interaction states

All states use existing tokens; there are no extra tints.

| State | Rule |
|---|---|
| hover | `muted` text, icons, underlines and borders turn `ink`. The primary button keeps its `ink` fill. A colour change only: no movement, no scale, no shadow, except the clickable card below. |
| clickable card | A closed list: a lean card (`[data-depth-lean]`), a previous/next card (`[data-next]`) and a Home "How I test" tab (`[data-how-tab]`). On hover (only where hover exists), keyboard focus and press its border turns `ink`; a lean card's "+" square also fills `ink` with a `surface` glyph, a Next card's label underlines, and a tab keeps the focus ring of its radio (the selected tab keeps its `surface` fill and `ink` bar, so a hovered tab never reads as selected). With motion allowed it also rises 4 px (`translate`, `duration-base`) on hover, the one hover movement on the site (keyboard focus changes colour and shows the ring, but does not move it); under reduced motion it changes colour only. Where there is no hover the "+" is `ink` at rest. In forced-colors mode the border and the "+" take `Highlight`. Cards that are not links or tabs never change on hover; buttons, segmented controls, sliders, chips, details rows and inline links keep their own hover. |
| pressed | The same as hover, held while pressed. |
| selected | `ink` fill with a `bg` label (selected segment). The current step and the current navigation item are `ink` text with a 2 px `ink` bar. In forced-colors mode the selected segment gets a `Highlight` border. |
| disabled | `muted` text, a `line` border, no fill. StepNav ends use `aria-disabled`, so they keep focus. |
| focus | A 2 px `accent` outline at a 2 px offset, always on `bg` (never clipped by `overflow: hidden`). |

## Type

One family, Inter (variable), loaded with `next/font/local` with the `opsz` axis, so the display
sizes get Inter Display's tighter forms. `font-optical-sizing:
auto` is set on `html`. `font-sans` is the only text family; its feature settings
(`--font-sans--font-feature-settings`) is `cv05` (lowercase l with a tail, so "El" never reads as
"EI"). Tabular figures (`tnum`) are not on body text: the feature also widens the hyphen, the full
stop, the colon and the space, so "kitchen-sink" would read "kitchen - sink". They are turned on in
`globals.css` for exactly these elements: `[data-num]`, `data` (a Fact or a derived number), `time`,
`output` and `input[type="number"]`. The `data-num` marker goes on an element that IS a number (a
tick label, a numeric table cell, an interval, a step count, a readout), never on a container that
holds a sentence: `data-derived` and `data-fact` only say where a number comes from, and a marked
container that is not itself a number says `cv05` outright, so a number still lines up and prose
keeps its normal hyphen and spaces. These elements also set `text-rendering: geometricPrecision`:
Linux Chromium rounds each glyph advance to a whole pixel, so without it a "1" and a "0" differ by
up to a pixel and a column of figures drifts. Weights used: `font-weight-regular` 400,
`font-weight-medium` 500, `font-weight-semibold` 600, and `font-weight-heading` 550 with
`tracking-heading` (-0.022 em) for h1 to h3 at the display and h2 sizes: `globals.css` sets both on
any such heading, so a `font-semibold` left on one does not win. Code blocks only use `font-code`, which
`--default-mono-font-family` also makes the default for `code`, `kbd`, `samp` and `pre`.

| Token | Size | Line height | Use |
|---|---|---|---|
| `text-xs` | 13 px | 1.5 | captions, badges, chart tick labels; its line height is the pitch of a chart's stacked zero-line words |
| `text-sm` | 15 px | 1.5 | UI labels, buttons, navigation, the test note, chart annotations |
| `text-base` | 18 px | 1.6 | body text |
| `text-lg` | 20 px | 1.4 | card headlines |
| `text-xl` | 24 px | 1.3 | section titles, Figure titles |
| `text-2xl` | 34 px | 1.2 | page titles |
| `text-3xl` | 48 px | 1.1 | `Stat` numbers |
| `text-readout-sm` | 48 px | 1, -0.03 em, 600 | the hero readout under 768 px |
| `text-readout` | 64 px | 1, -0.03 em, 600 | the hero readout; always with its unit ("visitors per group") |
| `text-display-lg` | 64 px | 1.02, -0.022 em | the Home headline from 768 px |
| `text-h2` | 40 px | 1.06, -0.022 em | a section headline, a page headline (`SectionHead`, `PageHead`) |
| `text-h2-sm` | 32 px | 1.08, -0.022 em | the same under 768 px; an inner page's section headline from 768 px |
| `text-h2-xs` | 28 px | 1.12, -0.022 em | an inner page's section headline under 768 px (`SECTION_H2` is `text-h2-xs md:text-h2-sm`): one step above a 24 px Figure title, one below the page headline |
| `text-display-sm` | 36 px | 1.06, -0.022 em | the Home headline under 480 px, a page headline under 768 px |
| `text-display` | 48 px | 1.04, -0.022 em | the Home headline from 480 to 768 px, a page headline from 768 px |

The display sizes are ordered: `display-sm` 36 px, `display` 48 px, `display-lg` 64 px.

Hierarchy comes from weight and space, not from size jumps and not from capitals. The readout
stays below the name at every width. Text is left-aligned in `container-text`, which holds about 75
characters.

## Space and layout

- `spacing`: 4 px base. Use multiples (4, 8, 12, 16, 24, 32, 48, 80).
- `spacing-section`: 80 px between major blocks on desktop (`py-section`); 48 px on phones
  (`py-12`).
- `size-target`: 44 px, the minimum height (and width for icon-only controls) of buttons,
  segmented options, StepNav, Reset, Menu and standalone links: `min-h-(--size-target)`.
- `header-h`: 64 px, the `SiteHeader` height.
- `container-text` 680 px, `container-figure` 960 px, `container-page` 1136 px (the frame, the header and the footer share it).
- Page side padding: 32 px desktop, 16 px phone.
- Radius: `radius-sm` 4 px (badges), `radius-md` 8 px (inputs and buttons: `rounded-md`),
  `radius-chip` 7 px (chips), `radius-xl` 12 px (tiles and cards: `rounded-xl`), `radius-pill`
  (dots, toasts and the tools' pills). No shadows exist.
- The frame: `main` carries `data-frame`, a hairline rail at each side of the content column. An
  element with `data-rule` is ruled off by a top hairline that runs from rail to rail.

## Breakpoints

| Name | Width | What changes at and above it |
|---|---|---|
| (none) | under 480 px | Segmented options stack as a radio list. The header's glyph is a 28 by 10 px variant of the 48 by 10 px mark (same bar, end caps and dot with its halo), and Menu is a word without its icon, so the header stays on one row at 375 and 390 px. |
| `xs` | 480 px | Segmented options sit in one row. The header shows the 48 px glyph and the Menu icon. |
| `sm` | 640 px | `ChartFrame` uses its wide layout; below 640 px it redraws a narrow layout. |
| `md` | 768 px | Home headline `text-display-lg`, readout `text-readout`; section spacing 80 px; side padding 32 px; the header shows the full navigation, and sticks if the screen is also at least 700 px tall. |
| `lg` | 1024 px | The Home band shows the stack (pinned and unfolding where scroll timelines exist and the screen is at least 700 px tall); below it, the three sheets are a static column. |
| `xl` | 1440 px | Content stays at `container-page` (1136 px); only the margins grow. |

The screen-share size (1024 by 576) sits exactly on `lg`, so it gets the `lg` layout; it is a test
target, not a breakpoint; the header scrolls away there (below 700 px of height it would take more
than a tenth of the screen), and in-page anchors only reserve room for it while it sticks.

## Layers

| Token | Value | Use |
|---|---|---|
| `z-header` | 20 | `SiteHeader`, sticky from `md` on screens at least 700 px tall |
| `z-menu` | 30 | the phone Menu panel |

Use them as `z-(--z-header)`. Nothing else sets a z-index.

## Motion

| Token | Value | Use |
|---|---|---|
| `duration-fast` | 120 ms | hover and press feedback |
| `duration-base` | 240 ms | an interactive Figure changing; a clickable card's 4 px lift |
| `duration-settle` | 1000 ms | a proof figure's interval line closing, once on load |
| `duration-lean` | 500 ms | a card, a button or the hero field following a fine pointer, and springing back |
| `duration-arrive` | 800 ms | one row of the hero field, or one load-sequence element, arriving once on load |
| `perspective-scene` | 1300 px | the hero field's vanishing distance (`perspective: var(--perspective-scene)`; rising groups use it plus 100 px) |
| `ease-standard` | `cubic-bezier(.2,0,0,1)` | most transitions |
| `ease-emphasis` | `cubic-bezier(.3,0,0,1.1)` | the interval dot settling |

Tailwind v4 has no duration namespace, so durations are written `duration-(--duration-fast)`.
`--default-transition-duration` is `var(--duration-fast)` and
`--default-transition-timing-function` is `var(--ease-standard)`, so a bare `transition-colors`
follows the tokens. Under `prefers-reduced-motion: reduce`, every duration is 0 ms.

### Depth: the motion language

Motion follows the reader (scroll position or a fine pointer) or plays once on load. Nothing
loops. The CSS is in `globals.css`, keyed on data attributes, so a component only adds the
attribute. Scroll-linked rules use `animation-timeline` with linear timing and sit inside
`@supports`; without scroll timelines, under reduced motion and in print every element is visible
and untransformed. Only transform, opacity and clip-path change. Keyframes are named `depth-*`.
Every fade-in is fully opaque by the middle of its range while the movement runs on to the end,
so a block whose painted box is already in view is never part-faded.

- `[data-depth-band]`, `[data-depth-pin]`, `[data-depth-rig]`, `[data-depth-sheet]` (`1` to `3`), `[data-depth-link]`: The Home band. Wide screens rest in an isometric stack that leans to a fine pointer (`--mx`, `--my` on `[data-depth-stack]`); with scroll timelines, a screen at least 1024 by 700 px and motion allowed, the band pins and the stack unfolds into a row joined by two links on the band's view timeline (`--depth-band`); below lg a static column; reduced motion and print the flat row. Keyframes: `depth-rig`, `depth-sheet-1` to `depth-sheet-3`, `depth-link`.
- `[data-depth-arrive]` (`--n`), `[data-depth-close]`: The band's sheets arrive once on load, and the test sheet's intervals close once. Keyframes: `depth-sheet-arrive`, `depth-close`.
- `[data-depth-load]` (`--d`): A small rise and fade in order, once on load. Never on the h1. Keyframes: `depth-load`.
- `[data-depth-progress]`: A 2 px hairline under the header that fills with the page's scroll. Keyframes: `depth-progress`.
- `[data-depth-rise]`, `[data-depth-rise="heading"]`: Rises out of depth on entry; siblings 2 to 4 start later. Headings use a smaller tilt. Keyframes: `depth-rise`, `depth-rise-heading`.
- `[data-depth-draw]`: A hairline draws from the left on entry. Keyframes: `depth-draw`.
- `[data-depth-book="left"]`, `="right"`: Two tiles open like a book on entry. Keyframes: `depth-book-left`, `depth-book-right`.
- `[data-depth-ribbon]`: A row of words slides sideways with the scroll. Keyframes: `depth-ribbon`.
- `[data-depth-scale]`: Very large type scales in from depth on entry. Keyframes: `depth-scale`.
- `[data-depth-parallax]` (`--p`, px): A block drifts against the scroll. Keyframes: `depth-parallax`.
- `[data-depth-drift]` (`bl`, `br`, `tr`, `tl`): Drift. A block comes in once from its own corner, out of depth with its own perspective, and settles flat; `tl` (a portrait) plays once on load. Keyframes: `depth-drift-bl`, `depth-drift-br`, `depth-drift-tr`, `depth-drift-tl`.
- `[data-depth-hinge]`, `[data-depth-hinge="load"]`: Hinge. A sketch sheet stands up from its bottom edge on entry; a page's glance block tips up once on load. Keyframes: `depth-hinge`, `depth-hinge-load`.
- `[data-depth-turn]`: Turn. A tile turns toward the reader as it enters. Keyframes: `depth-turn`.
- `[data-depth-focus]`: A photo's frame opens from a smaller inset while the photo settles from a slight zoom. Keyframes: `depth-focus`, `depth-focus-in`.
- `[data-depth-trace]` (`proof`, `row`, `experience`, `timeline`): Trace. The dividers of a row, the rule after a group's chip, and a timeline's spine draw as the block enters; a timeline's dots appear row by row. Keyframes: `depth-trace-x`, `depth-trace-y`, `depth-dot`.
- `[data-depth-follow]` (`--mx`, `--my`, `--gx`, `--gy`): A scene follows a fine pointer by a few pixels per layer; a site sketch tilts slightly with a sheen. No keyframes.
- `[data-depth-glow]`: A soft disc on the ink sheet that follows a fine pointer. No keyframes.
- `[data-depth-lean]` (`--rx`, `--ry`, `--gx`, `--gy`): A card leans toward a fine pointer, with a sheen; springs back. On hover it also rises 4 px (see the clickable card in Interaction states). Keyframes: transition.
- `[data-depth-magnet]` (`--tx`, `--ty`): A button shifts up to 6 px toward a fine pointer. Keyframes: transition.
- `[data-tile]`, `[data-tile="ink"]`: A white tile with a hairline and an ink tile (`radius-xl`, padding). Not motion.

## Base styles in `tokens.css`

`color-scheme: light` on `:root`, so phone browsers do not force a dark theme;
`font-optical-sizing: auto` on `html`; and the `:focus-visible` ring, inside `@layer base` so a
utility can override it.

## Not allowed (enforced by the design lint)

Hex colours outside `tokens.css`; Tailwind default palettes, shadows, sizes and animations (they do
not exist); any `text-transform: uppercase`; the arrow character, the middle dot and emoji in
content; monospace outside code blocks; `@keyframes` not named `depth-*`; `fade-up`,
`animate-in` and `slide-in-from` classes; hover movement (`hover:translate`, `hover:scale`, or a
transform, scale or translate in a `:hover` rule), except the 4 px lift of a clickable card
(`[data-depth-lean]`, `[data-next]`, `[data-how-tab]`, a closed list); dark
mode. The rule ids are listed in `CLAUDE.md`.
