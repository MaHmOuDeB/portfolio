# Design tokens: Clarity (light only)

`src/styles/tokens.css` is the source of truth. This file documents every name in it. A CI check
compares the two and fails if a token exists in one and not the other.

## Why this direction

The design is called Clarity and is light only. It extends the CV's design to the web: one neutral
sans, hierarchy from weight and space, grey links with an underline. Inter is the most common web
face, so the character comes from elsewhere: the interval glyph, the chart system and a tuned Inter
(optical sizes, `cv05`).

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

| Token | Hex | Use | Contrast on bg |
|---|---|---|---|
| `bg` | `#FFFFFF` | page and figure background, the 2 px ring round dots, annotation halos | n/a |
| `ink` | `#1D1D1F` | text, primary button fill, selected segment, zero line | 16.83 |
| `muted` | `#6E6E73` | secondary text, links and their underline, captions, input borders, the slider track edge, badge border, the running estimate line | 5.07 |
| `line` | `#E8E8ED` | rules, chart grid, the inactive track fill | decorative |
| `surface` | `#F5F5F7` | tiles and cards on the white page (`bg-surface`); `muted` text on it is 4.66, `ink` 16.0 | decorative |
| `accent` | `#0A5FD9` | controls: focus ring, the active part of a slider track | 5.75 |
| `series-1` | `#0A5FD9` | the first chart series, interval bounds (1 px lines), the glyph bar and caps | 5.75 |
| `series-2` | `#D9620A` | the current estimate, the point being made | 3.68 (fills, lines and dots only, never text) |
| `series-ghost` | `#CEDFF7` | band fill only, the projected width at the cap, inactive curves | decorative |
| `ok` | `#1B7F3B` | the word for a passed check (for example "SRM passed") | 5.07 |
| `warn` | `#B04A00` | the word for a real warning (SRM, paused, error) | 5.49 |

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
- No other colours. No gradients, no tinted greys, no black (`#000`).
- Links are `muted` with a `muted` underline, never blue, and turn `ink` on hover and focus.
- Input borders and the slider track edge are `muted`, never `line` (1.22:1). The active part of
  the track is filled in `accent`.

## Interaction states

All states use existing tokens; there are no extra tints.

| State | Rule |
|---|---|
| hover | `muted` text, icons, underlines and borders turn `ink`. The primary button keeps its `ink` fill. A colour change only: no movement, no scale, no shadow. |
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
`font-weight-medium` 500, `font-weight-semibold` 600. Code blocks only use `font-code`, which
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
| `text-display-lg` | 88 px | 1.02, -0.03 em | the Home headline from 1024 px |
| `text-display-sm` | 44 px | 1.04, -0.02 em | the name in the hero under 768 px |
| `text-display` | 72 px | 1.04, -0.02 em | the name in the hero |

Hierarchy comes from weight and space, not from size jumps and not from capitals. The readout
stays below the name at every width. Text is left-aligned in `container-text`, which holds about 75
characters.

## Space and layout

- `spacing`: 4 px base. Use multiples (4, 8, 12, 16, 24, 32, 48, 80).
- `spacing-section`: 80 px between major blocks on desktop (`py-section`); 48 px on phones
  (`py-12`).
- `size-target`: 44 px, the minimum height (and width for icon-only controls) of buttons,
  segmented options, StepNav, Reset, Menu and standalone links: `min-h-(--size-target)`.
- `chart-h-phone`: 40svh, the sticky chart's height on phones.
- `header-h`: 64 px, the `SiteHeader` height; the sticky chart's top offset from `md` up.
- `container-text` 680 px, `container-figure` 960 px, `container-page` 1280 px.
- Page side padding: 32 px desktop, 16 px phone.
- Radius: `radius-sm` 4 px (badges), `radius-md` 8 px (inputs), `radius-xl` 28 px (tiles and cards: `rounded-xl`), `radius-pill` (buttons: `rounded-pill`). `rounded-full` is used only for dots.
  No shadows exist.

## Breakpoints

| Name | Width | What changes at and above it |
|---|---|---|
| (none) | under 480 px | Segmented options stack as a radio list. The header's glyph is a 28 by 10 px variant of the 48 by 10 px mark (same bar, end caps and dot with its halo), and Menu is a word without its icon, so the header stays on one row at 375 and 390 px. |
| `xs` | 480 px | Segmented options sit in one row. The header shows the 48 px glyph and the Menu icon. |
| `sm` | 640 px | `ChartFrame` uses its wide layout; below 640 px it redraws a narrow layout. |
| `md` | 768 px | Name `text-display`, readout `text-readout`; section spacing 80 px; side padding 32 px; the header shows the full navigation, and sticks if the screen is also at least 700 px tall; the sticky chart sits beside the steps, offset by `header-h`. |
| `lg` | 1024 px | The hero name runs on one line across the page, with identity and evidence split 7/5 below it. |
| `xl` | 1440 px | Content stays at `container-page`; only the margins grow. |

One container breakpoint is not a viewport one: the scroll moment's decision outcomes sit side by
side only when their own column is at least 36rem (576 px) wide (`@container` with
`@min-[36rem]:grid-cols-3`), because the sticky layout gives the steps a narrow column on wide screens.

The screen-share size (1024 by 576) sits exactly on `lg`, so it gets the `lg` layout; it is a test
target, not a breakpoint; the header scrolls away there (below 700 px of height it would take more
than a tenth of the screen), and in-page anchors only reserve room for it while it sticks. The chart is sticky only on screens at least 600 px tall (a height
query).

## Layers

| Token | Value | Use |
|---|---|---|
| `z-chart` | 10 | the sticky scroll-moment chart |
| `z-header` | 20 | `SiteHeader`, sticky from `md` on screens at least 700 px tall |
| `z-menu` | 30 | the phone Menu panel |

Use them as `z-(--z-chart)`. Nothing else sets a z-index.

## Motion

| Token | Value | Use |
|---|---|---|
| `duration-fast` | 120 ms | hover and press feedback |
| `duration-base` | 240 ms | an interactive Figure changing |
| `duration-step` | 320 ms | one scroll-moment step changing |
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

- `[data-depth-field]`, `[data-depth-plane]`, `[data-depth-row]` (`--i`, `--e`, `--shift`): The hero evidence field: rows arrive once, the plane turns to face the reader on the view timeline of `[data-depth-scene]`, a fine pointer (`--mx`, `--my`) moves the vanishing point and turns the plane. Keyframes: `depth-row-arrive`, `depth-plane-face`.
- `[data-proof]` with `[data-proof-bar]`: The interval line closes once on load, siblings 110 ms apart. Keyframes: `depth-settle`.
- `[data-depth-load]` (`--d`): A small rise and fade in order, once on load. Never on the h1. Keyframes: `depth-load`.
- `[data-depth-recede]`: Text scales to 0.94 and fades to 0.35 as its scene scrolls away. Keyframes: `depth-recede`.
- `[data-depth-progress]`: A 2 px hairline under the header that fills with the page's scroll. Keyframes: `depth-progress`.
- `[data-depth-rise]`, `[data-depth-rise="heading"]`: Rises out of depth on entry; siblings 2 to 4 start later. Headings use a smaller tilt. Keyframes: `depth-rise`, `depth-rise-heading`.
- `[data-depth-draw]`: A hairline draws from the left on entry. Keyframes: `depth-draw`.
- `[data-depth-book="left"]`, `="right"`: Two tiles open like a book on entry. Keyframes: `depth-book-left`, `depth-book-right`.
- `[data-depth-ribbon]`: A row of words slides sideways with the scroll. Keyframes: `depth-ribbon`.
- `[data-depth-scale]`: Very large type scales in from depth on entry. Keyframes: `depth-scale`.
- `[data-depth-parallax]` (`--p`, px): A block drifts against the scroll. Keyframes: `depth-parallax`.
- `[data-depth-reveal]`: A chart's marks draw left to right as it enters. Keyframes: `depth-reveal`.
- `[data-depth-lean]` (`--rx`, `--ry`, `--gx`, `--gy`): A card leans toward a fine pointer, with a sheen; springs back. Keyframes: transition.
- `[data-depth-magnet]` (`--tx`, `--ty`): A button shifts up to 6 px toward a fine pointer. Keyframes: transition.
- `[data-tile]`, `[data-tile="ink"]`: A surface tile and an ink tile (`radius-xl`, padding). Not motion.

## Base styles in `tokens.css`

`color-scheme: light` on `:root`, so phone browsers do not force a dark theme;
`font-optical-sizing: auto` on `html`; and the `:focus-visible` ring, inside `@layer base` so a
utility can override it.

## Not allowed (enforced by the design lint)

Hex colours outside `tokens.css`; Tailwind default palettes, shadows, sizes and animations (they do
not exist); any `text-transform: uppercase`; the arrow character, the middle dot and emoji in
content; monospace outside code blocks; `@keyframes` other than the scroll moment's and the `depth-*` ones; `fade-up`,
`animate-in` and `slide-in-from` classes; hover movement (`hover:translate`, `hover:scale`); dark
mode. The rule ids are listed in `CLAUDE.md`.
