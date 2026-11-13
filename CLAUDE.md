# CLAUDE.md

Guidance for Claude Code in this repository: the portfolio site of Mahmoud El Bergui, an
experimentation and growth analyst in Berlin.

@AGENTS.md

> **Status:** the walking skeleton (CI, tests and tooling) and the Figure kit are in place. Pages
> and visual design follow the approved plan.

## Principles

- **Every figure is a `<Fact>`.** Numbers come from vendored source exports (`sources.lock.json`),
  never from typed numerals. A truth audit scans the built HTML for stray numbers, deny-listed
  terms, banned phrases and e-mail addresses, and the public client scripts (`.next/static`) for
  deny-listed terms. It runs in CI on the build job, with the deny-list from the `TRUTH_DENYLIST`
  repository secret (a CI run without it fails, except a pull request from a fork, which gets no
  secrets: there the deny-list part is skipped with a notice and runs on the push to main), and
  locally with `npm run truth:audit` after `npm run build`, where it skips the deny-list with a
  notice unless `TRUTH_DENYLIST` is set. The secret holds one term per line, each matched as
  literal text (not a regular expression), ignoring case. It reports a deny-list hit by its
  position in the list, never by its text.
- **One system.**
  - Every chart and interactive element is built from the Figure kit (see the primitives
    catalogue): a title, one control row, Reset, URL state, a provenance badge and a table
    fallback.
  - Colours, type and spacing come only from `src/styles/tokens.css`, documented in
    `docs/design/tokens.md`.
  - `/kitchen-sink`, a dev-only route, shows every component in every state.
- **Low-traffic first.** The live experiment will usually be in a "collecting" state. That state
  is designed first and must look deliberate, never empty or broken.
- **Statistics are tested first.** Reference values come from scipy and statsmodels via
  `stats-ref/generate.py`. Simulations are seeded.

## Stack and commands

Next 16.4.6 (App Router), React 19.2.8, Tailwind 4.3.3, Vitest, Playwright, Node 24. Next 16 has
breaking changes: read `AGENTS.md` and the guide in `node_modules/next/dist/docs/` before writing
Next code.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server. `KITCHEN_SINK=1 npm run dev` also serves `/kitchen-sink` and `/kitchen-sink/live`. |
| `npm run build` | Production build. `prebuild` first checks the obfuscated constants and the vendored sources. |
| `npm run check` | The local gate: typecheck, ESLint, Stylelint, unit tests and `lint:design:src`. Run it before every push. |
| `npm run test` | Vitest unit tests (`tests/unit`). `npm run test:cov` adds the coverage gate on `src/lib/stats`. |
| `npm run test:e2e` | Playwright (`tests/e2e`). It builds with `KITCHEN_SINK=1` and serves on port 3123, so rebuild without the flag afterwards. It also starts a local fake of the experiment store on port 8079 (`scripts/fake-upstash.ts`) and runs both servers on a test clock after the experiment's fixture start. Visual tests are skipped locally. |
| `npm run test:e2e:docker` | The same Playwright suite inside the image the CI e2e job uses (needs Docker): the repository is mounted read-only and copied to a volume, `npm ci` installs the Linux modules there, and it runs with `CI=true`. Use it to reproduce a failure that appears only in CI, for example `npm run test:e2e:docker -- tests/e2e/shell.spec.ts --project=desktop-chromium`. Visual baselines are missing there too, so add `--grep-invert @visual`. |
| `npm run lint:design` | The design lint over the source and the built CSS (run `npm run build` first). |
| `npm run lint:design:src` | The design lint over the source only (part of `npm run check`). |
| `npm run gen:obf` | Regenerates `src/lib/stats/obf-constants.generated.ts`. |
| `npm run sources:sync` | Vendors the pinned source exports and regenerates `src/lib/facts/facts.generated.ts`. |
| `npm run truth:audit` | The truth audit over a finished build (CI runs it on the build job). |
| `npm run og:render` | Renders the sharing images `public/og/*.png` (1200x630) from `content/seo.ts` with Playwright's Chromium, local fonts and tokens only, and writes `scripts/og-images.lock.json`. `-- --preview <dir>` also writes each card at 350 px wide. Re-run after changing a card, the template, the tokens or the font. |
| `npm run seo:origin-check -- --canonical <host>` | On a production build: fails if any built page, RSC payload, sitemap or robots file has a `.invalid` test origin, or a canonical, sharing URL, sitemap location or robots Sitemap line off `https://<host>`. |
| `npm run assert:no-kitchen-sink` | Fails if the build contains a kitchen-sink route. CI runs it after `npm run build`, and the deploy workflow after `vercel build`. |
| `npm run experiment:check -- --url <origin>` | Prints the live experiment's state from `<origin>/experiment/data.json`. `--storage` (with the production variables in the environment) checks the read-only store token and the Edge Config connection, printing two status lines and never a value. |
| `npm run launch:check -- --canonical <domain>` | The launch gate, by hand only (never in `npm run check` or CI): exits 1 naming each unmet launch condition (start date, unverified privacy facts and launch placeholders, deployed checks with `headers` on the canonical domain, secrets and the `LAUNCHED`, `LAUNCH_SHA` and `CANONICAL_HOST` variables by name, with `CANONICAL_HOST` matching `--canonical`, the `prereg-v1` tag locally and on origin, no self-hosted runners in the workflows or registered). Run `npm run build` first. See `docs/experiment/runbook.md`. |

Also: `npm run typecheck`, `npm run lint`, `npm run lint:css`, `npm run build:meta`,
`npm run lhci` and `npm run links`.

## Structure

| Path | What lives there |
|---|---|
| `src/app` | Routes (App Router). `kitchen-sink/**/page.dev.tsx` is built only with `KITCHEN_SINK=1`. |
| `src/components/kit` | The Figure kit (frozen). `src/components/kit/index.ts` is the import path for server-safe components, `src/components/kit/client.ts` for the client ones. |
| `src/components/shell` | Site header, navigation, footer, skip link and error message. |
| `src/lib/stats` | The statistics (tested against `stats-ref`). |
| `src/lib/figure` | Pure Figure logic: URL state, states, scales, glyph geometry, formatting, time. |
| `src/lib/facts` | The `<Fact>` data, formatters and checked lookup. |
| `src/styles/tokens.css` | The design tokens. |
| `content/` | Content as data: the privacy notice (`content/privacy.ts`) and the frozen experiment headlines. MDX pages come later. |
| `data/sources/` and `sources.lock.json` | Vendored source exports, written by `scripts/sync-sources.ts`. |
| `scripts/` | Build, audit and lint tooling, run with Node's type stripping. |
| `tests/unit`, `tests/e2e` | Vitest and Playwright. Visual baselines are `tests/e2e/__screenshots__/**`. |
| `stats-ref/` | Python that generates `reference.json` from scipy and statsmodels. |
| `docs/` | Public documentation, such as `docs/design/tokens.md`. |

## Edit these / leave these alone

| Edit these | Why |
|---|---|
| `content/**` | Content is data. |
| A page's own `src/app/<page>/**` | One page per PR. |
| `docs/**` | Documentation. |

| Leave these alone without a stated reason | Instead |
|---|---|
| `src/styles/tokens.css` | A change is a design-system change: update `docs/design/tokens.md` with it. |
| `src/components/kit/**` | Frozen. A new component needs its own PR and a row in the primitives catalogue below (and in `index.ts` or `client.ts`). |
| `src/lib/stats/**` | Test-first against `stats-ref`. |
| `*.generated.ts` and `stats-ref/reference.json` | Regenerate (`npm run sources:sync`, `npm run gen:obf`, `stats-ref/generate.py`), never hand-edit. |
| `tests/e2e/__screenshots__/**` | CI only: the `update-baselines` label on a PR regenerates them in the Playwright container. |
| `data/sources/**` | Written by the sync script only. |
| `.github/workflows/**` | Pipeline changes get their own PR. |

## Content as data

- Numbers appear only through `<Fact id>` (from `src/lib/facts`, rendered by the kit's `Fact`). Fact
  ids are typed, so an unknown id fails the typecheck.
- Computed, simulated and live numbers carry `data-derived`, always written with
  `derivedAttr(refs)` (or the `Derived` component) and never empty. Refs are fact ids,
  `source:<id>`, `simulated`, `live` or `build`. The truth audit reports an empty or unknown ref.
- Kit components that print numbers take their refs from the caller, and `refs` is required on the
  live components (no default). Live components use `['live']`, kitchen-sink demos `['simulated']`.
- Prose lives in MDX under `content/`.
- Negative numbers use the true minus sign (U+2212). Zero has no sign: it prints "0", or "0.0"
  and so on where a fixed number of decimals is asked for, never "+0" or "-0". Every "±" names its
  level. Timestamps render in `Europe/Berlin` inside `<time dateTime>` as `dd.mm` and 24-hour
  `hh:mm`.
- A date that needs its year (a legal notice's version date) prints `dd.mm.yyyy` inside
  `<time dateTime>`; live timestamps stay `dd.mm` and `hh:mm`.

## Caching model

Pages use plain static generation. ISR (`export const revalidate`, see
`node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`) is used on
`/v/[arm]` and `/experiment` only. **No `cacheComponents` in v1.**

## Primitives catalogue

There are two import paths, so that a page using a server-safe component does not ship the
controls' JavaScript:

- `@/components/kit` (`index.ts`) re-exports only server-safe modules. None of them is a client
  module, and none has a `'use client'` directive. Two use a client module: `Figure` (it wraps its
  chart in the error boundary, which a page that uses `Figure` needs anyway) and `TextArea` (its live
  `CharacterCount`).
- `@/components/kit/client` (`client.ts`) re-exports the client modules (marked client below): the
  controls, the error boundary, `LoadOnIntent` and the `useFigureParams` hook. Each of those files
  keeps its own `'use client'` directive.

Every kit export is in exactly one of the two. Neither entry file has a directive of its own. Where
a page needs the smallest possible bundle it can also import a component's file directly, such as
`@/components/kit/Callout`.

| Export | File | Role |
|---|---|---|
| `Figure`, `FigureProps`, `instantly` | `Figure.tsx` | The frame of every chart and interactive part. A chart Figure's optional `lead` is drawn between the title and the control row (a readout seen before the controls); it shows in the default and no-JS states and is hidden, like the result line, when the Figure holds an error fallback (its own: a fallback of a Figure or chart nested inside it hides nothing of the outer Figure). It sits outside the Figure's error boundary and is not announced. `instantly(figureId, apply)` makes a change land without a transition (Reset). |
| `FigureErrorBoundary`, `FigureErrorFallback`, `FigureErrorFallbackProps`, `FallbackBody` | `FigureErrorBoundary.tsx` (client) | Per-Figure error boundary and the fallback that replaces a Figure that throws. |
| `ChartFrame`, `ChartFrameProps`, `AxisSpec`, `Annotation`, `PlotContext`, `Layout`, `MARK_UNITS`, `MarkLayer` | `ChartFrame.tsx` | The SVG frame: grid, axes, tick labels, zero line and one annotation. Marks go in `MarkLayer`. An x tick label is centred on its tick unless the tick is on an end of the domain, and an outermost one stays inside the frame. |
| `ConfidenceChart` | `ConfidenceChart.tsx` | The live experiment's confidence-sequence chart with its "Now" row. Optional `height` (`{ narrow, wide }` plot px, positive and finite, defaults 220 and 280) and `ariaLabel` (a non-empty finding in words, no digit, replaces the generated one, also under a pause); an invalid value throws. |
| `NowRow` | `NowRow.tsx` | The interval glyph on a difference axis under the ConfidenceChart. |
| `LiveStateBody` | `LiveStateBody.tsx` | The body of a live Figure in each state of the state matrix. |
| `UpdatedLabel`, `ProgressLine` | `LiveLabels.tsx` | When live data was updated, and how far a collecting test has got. |
| `PhaseLabel`, `TestNote` | `PhaseLabel.tsx` | The one-sentence note on what the site is testing and which group the reader is in. |
| `DataTable`, `TableData`, `ColumnFormat` | `DataTable.tsx` | The table fallback of every chart; a table can carry its own caption (`TableData.caption`), otherwise the Figure's title names it. `mode="disclosure"` draws the table once: a `details` holding only its summary (`data-js-only`), then the table's body (`data-nojs-only`), open without JavaScript and shown with it only while the summary is open (`globals.css`; print shows it too). `mode="open"` is the bare table. A column format (`number`, `count`, `points`, `signedPoints`, `share` or `{ fixed: n }`) says how a number cell is written; `share` prints a raw fraction as a whole percent through the facts formatter, and `{ fixed: n }` prints exactly n decimals with trailing zeros kept (`formatNumber(v, n, { fixed: true })`, which also serves an axis). |
| `IntervalGlyph` | `IntervalGlyph.tsx` | The signature mark: a bar with end caps is the interval, the dot is the estimate. 48 px wide before the name in the header; under 480 px the header uses `length={28}` so it stays on one row. |
| `ProvenanceBadge`, `Provenance` | `ProvenanceBadge.tsx` | "Simulated", "Public data" or "Live from this site". |
| `Fact` | `Fact.tsx` | A number from the facts data, as `<data data-fact>`. |
| `Derived`, `derivedAttr`, `DerivedRef` | `Derived.tsx` | A computed, simulated, live or build number, as `data-derived`. |
| `Stat` | `Stat.tsx` | A large number with its label and source line. |
| `Slider`, `SliderProps` | `Slider.tsx` (client) | A native range input joined to a number input. An optional `numberText` sets the number input's text (display only, such as "17.2" for a value with many digits). `onCommit` fires on pointer up, key up and number-input blur, and on blur while a key that moved the value is still held; a commit can repeat an unchanged value. |
| `Segmented`, `SegmentedProps` | `Segmented.tsx` (client) | A native radio group drawn as a segmented control. Each radio's id is `${name}-${value}`, so a `name` is used once per page. `disabledReasonId` names the element that says why a disabled group is disabled; it describes the group only while it is disabled. |
| `ResetButton` | `ResetButton.tsx` (client) | Restores the Figure's preset. An optional `id` is set on the button. |
| `StepNav`, `StepNavProps` | `StepNav.tsx` (client) | "3 of 5" between Previous and Next; controlled by the caller. With an `id`, the buttons' ids are `${id}-previous` and `${id}-next`, so a preview's button can hand focus to the island's. |
| `LoadOnIntent` | `LoadOnIntent.tsx` (client) | Shows the server preview and swaps in the lazy island on pointer, focus or idle; optional `eager` (default false) loads it right after hydration instead. During the swap the root keeps the preview's height until the island has been laid out, and the swap itself reads no style or layout (`load` may measure the preview once, before the island is in the page), so the page never gets shorter under a reader further down. An island must not force layout in its own mount effects. |
| `useFigureParams` | `useFigureParams.ts` (client) | Reads and writes a Figure's URL state. Call it inside a `<Suspense>` boundary. |
| `ButtonLink`, `buttonClass` | `ButtonLink.tsx` | A link drawn as a button, and the class list for a real `<button>` that must match. |
| `TextLink` | `TextLink.tsx` | An inline link. |
| `Callout` | `Callout.tsx` | A short note with a rule at the left, for limits and caveats. |
| `Icon`, `IconName` | `Icon.tsx` | The one outline icon set; always decorative. `alert` and `check` sit only beside the status word they repeat, in its colour (`text-warn`, `text-ok`; colour and alignment on a wrapping span, since `Icon` has no `className`); `chevron` only marks a `SelectField`, in `muted`. |
| `Field`, `fieldControlClass` | `Field.tsx` | The anatomy every form field shares, top to bottom: label (`text-sm font-medium`, ink, no colon or asterisk), hint, error (above the control: alert icon, sr-only "Error: ", `text-warn`), control, counter. `aria-describedby` lists only the parts that exist, in that order; an error adds `aria-invalid` and a 2 px warn rule at the left. `fieldControlClass` is the control box: `border-muted`, ink on hover, warn when invalid, `rounded-md`, 18 px text (no iOS zoom), 44 px, the global focus ring and no shadow, and a scroll margin (`scroll-mt-28`), so a control scrolled to (an error summary's link, or focus) keeps its label and error in view. |
| `TextField` | `TextField.tsx` | A text or e-mail input in the `Field` anatomy: required, uncontrolled (`defaultValue`, so a no-JS re-render keeps the visitor's text), no placeholder. The form is `noValidate`, so only the site's own messages show. |
| `TextArea` | `TextArea.tsx` | A textarea in the `Field` anatomy, eight rows, `resize-y`, with a visible `limit` (refs from the caller) and no native `maxLength`, so a paste is never cut off. Its counter is `CharacterCount`. |
| `SelectField` | `SelectField.tsx` | A native select in the `Field` anatomy: "Choose one" first (empty, selected while nothing is chosen, never disabled or hidden, drawn muted), a muted `chevron` icon over its right edge (never a background image). |
| `SubmitButton` | `SubmitButton.tsx` | A submit button drawn with `buttonClass('primary')`, `min-w-36`, never full width and never an icon. `pending` swaps the label (`pendingLabel`) and sets `aria-disabled`, never `disabled`, so focus stays; `disabled` is the tokens' disabled state (kitchen sink only). |
| `CharacterCount` | `CharacterCount.tsx` (client) | The TextArea's counter: "Up to <limit> characters" on the server and without JavaScript, then "<n> characters left", "No characters left" or "<n> characters too many" (warn, alert icon, and a warn border on the textarea). Read on focus through `aria-describedby`; a separate polite node repeats it about a second after typing stops, only in the last tenth of the limit or over it. Only the number carries `data-num` and the caller's refs. It never scrolls the page. |

### Figure rules

- **Titles.** A static Figure's title states its finding. An interactive Figure's title states the
  relationship ("More looks, more false winners"), because a fixed number in the title would turn
  false when a control moves; only the result line (and the lead, if any) carries the live number. Never a topic label.
- **One control row**, at most four controls, ending in Reset. Reset restores the preset and clears
  only its own Figure's URL parameters.
- **URL state** is `?<figureId>.<param>` (for example `?peeking.looks=20&peeking.preset=interview`),
  because a page can hold several Figures. A Figure id matches `[a-z][a-z0-9-]*`, and no parameter
  is named `preset`. Reading never throws: bad values fall back to the preset, numbers are
  clamped, an unknown preset gives `default`. Writes use `history.replaceState`, debounced.
- **Provenance badge** on every chart Figure, set from the data's origin, never hand-written.
  Diagram Figures (`kind: 'diagram'`) have no badge, controls or table.
- **Table fallback** on every chart Figure, readable without JavaScript. The HTML carries it once:
  open without JavaScript, folded behind "Show the numbers as a table" with it.
- **States.** Every Figure has a runtime state (`default`, `no-js`, `error`). A live Figure also
  has a phase, an amount of data and a freshness. The state matrix, with its order of precedence,
  is `src/lib/figure/states.ts`, and the kitchen sink shows every state. An empty body (a Figure
  whose readout is its lead) takes no space (`[data-figure-body]:empty` in `globals.css`); a body
  holding an error fallback is never empty, so the fallback always shows.
- **Presets are always meaningful.** The default view is a real case, never an empty one.
- **Tabular figures are per element.** `tnum` also widens the hyphen, full stop, colon and space,
  so it is on exactly `[data-num]`, `data`, `time`, `output` and `input[type="number"]`
  (`globals.css`), with `text-rendering: geometricPrecision` there, because Linux Chromium rounds
  glyph advances to whole pixels and would otherwise misalign a column of figures. Put `data-num` on an element that is a number (a tick, a numeric table cell, an
  interval, a count), never on a paragraph that merely contains one; `data-derived` marks a source,
  not a number.
- **Chart labels never sit on marks.** `ChartFrame` puts the y tick numbers in a left gutter and the
  zero-line words ("no difference", "B higher", "B lower") in a right margin, both inside the SVG's
  padding, and snaps the y scale to half pixels. Collecting states draw the Now row on the same
  difference axis with a hollow glyph.
- **Chart text.** Tick labels are `text-xs` (13 px) and annotations `text-sm` (15 px) semibold
  with a `bg` halo. No `<text>` inside an SVG that has a `viewBox`. At most two series; `series-2`
  only for the current estimate, and every `series-2` dot has a 2 px `bg` ring.

### Composites

Page-level parts built from the kit. They live outside the kit (`src/components/home`,
`src/components/figures`, `src/components/retention`, `src/components/lab`,
`src/components/live-page`, `src/components/audible`, `src/components/build-notes`,
`src/components/marketingws`, `src/components/docproof`, `src/components/weather`,
`src/components/n8n`, `src/components/work`, `src/components/about`, `src/components/demo` and
`src/components/pulse`), and each is listed here once its file exists.

| Export | File | Role |
|---|---|---|
| `LiveNote` | `src/components/home/LiveNote.tsx` | The Home note on the live test, from the server-only Home model (`src/lib/home/model.ts`): nothing before the start, the kit's `PhaseLabel` while the test runs, and a stated reason with a link to `/experiment` when it is stopped, unreadable or finished. Every count prints by the small-count rule (`src/lib/home/counts.ts`). |
| `NoteFreshness`, `NoteFreshnessView`, `asOfAt` | `src/components/home/NoteFreshness.tsx` (client) | The "as of" time under the active test note, by the reader's clock: nothing on the server or before hydration, then the kit's updated label when the data is stale or the planned end has passed. It takes named props only, never the Home model. |
| `PublishedCountText` | `src/components/home/PublishedCountText.tsx` | A count as the page prints it (`publishedCount`): a number through `Derived`, or "<5" as a marked span. Every printed count on the Home page goes through it. |
| `Hero` | `src/components/home/Hero.tsx` | The Home hero, the same for every visitor: the name across the page (a non-breaking space in the surname), then from `lg` the identity (role, place, proof line with "Why so many?", Try the lab, CV from `md`, LinkedIn) in 7 of 12 columns and `HeroSimulator` in 5. |
| `CaseCard` | `src/components/home/CaseCard.tsx` | One featured case study: glyph, headline, description and the card link (`data-experiment-click="card"`). Both headline strings share one grid cell, so the card has the same size in both groups; the other group's string is `visibility: hidden` and `aria-hidden`, and the headline holds no link. |
| `FeaturedCases` | `src/components/home/FeaturedCases.tsx` | The cards region the experiment watches (`data-experiment="cards"`, labelled "Featured case studies"): three `CaseCard`s, stacked below `lg`, three columns sharing rows (subgrid) from `lg`. |
| `Tools` | `src/components/home/Tools.tsx` | "Tools I've built": one row per tool in `content/home.ts`, its name linking to its page and one line with its figures as Facts. |
| `Parts` | `src/components/home/Parts.tsx` | Content parts from `content/home.ts` (plain text and `{ fact }`) rendered with the kit's `Fact`. |
| `HeroSimulator` | `src/components/home/HeroSimulator.tsx` | The hero's evidence slot: the sample-size planner (`hero-planner`), the same for every visitor. |
| `PlannerFigure` | `src/components/figures/PlannerFigure.tsx` | The sample-size planner for a hypothetical sign-up test: Baseline conversion, Rise in points and Reset, with the visitors per group from Cohen's h (two-sided, significance level 0.05, power 0.8). The server draws the preset and the open table; the rise is capped so the target stays at or under 99% (`src/lib/lab/planner.ts`). |
| `PlannerIsland`, `PlannerControls`, `InertPlannerControls` | `src/components/figures/PlannerFigureClient.tsx` (client) | The planner's client side that the page loads at once: the lazy island (`PlannerFigure` places it with `EagerOrIntent` under its own id) and the control row the island and the preview share; the preview's copy has handlers that do nothing. |
| `PlannerInteractive` | `src/components/figures/PlannerInteractive.tsx` (client) | The lazy planner island: reads and writes its URL state, draws the same view as the server preview and announces the result only on a committed change. |
| `PlannerFigureView`, `PlannerReadout`, `PLANNER_TITLE`, `HYPOTHETICAL`, `BASELINE_NOTE` | `src/components/figures/PlannerView.tsx` | The planner's hook-free view, shared by the server preview (also the no-JS view) and the island: the visitors each group needs for the chosen rise, every number marked simulated. |
| `EagerOrIntent` | `src/components/figures/EagerOrIntent.tsx` (client) | Wraps `LoadOnIntent`: a URL key in one of the given Figure namespaces loads the island right after hydration (`eager`), anything else waits for intent. The query is read from `location` with `useSyncExternalStore` (server snapshot "not eager"), never with `useSearchParams`, so a static page hydrates in place. |
| `CollectingFrame` | `src/components/home/CollectingFrame.tsx` | The scroll moment's Evidence step where the kit's chart may not be used (`chartSnapshot` in `src/lib/home/scroll.tsx` is null: a group count prints as "<5", or a held, paused or closed test has no look to draw): the difference axis drawn with `ChartFrame` (only the 0 tick; the views-per-group axis is named but carries no numbers), the hollow `IntervalGlyph` on the zero line, a text-only progress or stop sentence from the published smaller count, and a masked Group / Views table. Never the kit's `NowRow`, `ProgressLine` or `confidenceTable`. |
| `GuardrailChart` | `src/components/home/GuardrailChart.tsx` | The quick-exit guardrail: one interval of B − A against its labelled, build-derived limit, drawn with `ChartFrame`, with a result sentence (below, still reaching or above the limit) and a table. Without an interval (in the calibration, before 50 views a group, and when the split check or the calibration failed) it is a diagram Figure showing the limit alone, with no badge. |
| `HypothesisDiagram`, `GroupOutlinesDiagram`, `DecisionZonesDiagram` | `src/components/home/StepDiagrams.tsx` | The scroll moment's diagram Figures: identical headlines (calibration) or topic versus finding (A/B), described without quoting either group's headline; two equal, unnumbered group outlines; the three outcomes of the decision rule. These and the two charts above take an optional `id`, which `homeSteps(model, { idPrefix })` sets, so the steps can be drawn twice in one page. |
| `HomeChart` | `src/components/home/HomeChart.tsx` (client) | The scroll moment's live chart: the kit's `ConfidenceChart` sized by a ResizeObserver from its own box, never the window. The narrow layout below a 640 px container; in the phone's sticky canvas the plot is the `--chart-h-phone` (40svh) box less 88 px for the axes, at least 80 px; elsewhere 280 px. Not in the first load: `ScrollShell` loads it later, and until then the server's drawing (`HomeChartView`) stands in. The phone canvas holds the box from the first paint and hides the chart until it has measured, so nothing moves at hydration. The caller's table shows only in the kit's error fallback, in place of the chart. |
| `HomeChartPreview`, `HomeChartBox`, `HomeChartDrawing`, `plotHeight`, `chartLayout` | `src/components/home/HomeChartView.tsx` | The same chart as markup with no hooks: the server draws each scroll-moment chart with it (the fixed 280 px plot, both layouts, CSS picks one), and `HomeChart` draws the same markup before it measures. The sizing rule lives here. |
| `ScrollMoment`, `ScrollMomentView`, `tickFrom` | `src/components/home/ScrollMoment.tsx` | The five steps and the live chart, one server markup for both layouts; `globals.css` picks one before the first paint. Sticky: two columns from 1024 px wide on a screen at least 520 px tall, one column below that from 600 px tall, with the stage (canvas and `StepNav`) beside or above the steps, each step at least 70svh. Stacked still frames without JavaScript, with reduced motion, on shorter screens and whenever no step has a kit chart. Each step body is drawn once; the chart is drawn in the canvas and in its step's stacked frame, and one of them is always `display: none`. One chart Figure frames the moment: its level-2 title above the steps, its caption, badge and one table after them, never in the canvas. A live chart that fails, or whose code cannot load, drops the moment to its stacked frames (the stage keeps only `StepNav`), and a failed chart's fallback table replaces the Figure's. Takes the group, the steps, the server-sliced chart entries (each with `tickAllowed`) and refs, never the Home model; `tickFrom` lets the "your view" tick start only on a fresh, running chart with every count at least 50, from its last look. |
| `ScrollShell` | `src/components/home/ScrollShell.tsx` (client) | The scroll moment's client half. The current step (`aria-current="step"`) follows `StepNav` at once, which scrolls that step into view, and an IntersectionObserver on a thin trigger band otherwise, ignored until the navigation's scroll ends (`src/lib/home/scroll-controller.ts`); nothing scrolls on its own. A held key moves one step. The band and the steps' scroll margin come from the stage's measured height (`--scroll-stage-h`), so on a phone focus never lands behind the stage. Canvas layers cross-fade in opacity over `duration-step`. The chart code loads on approach or idle time, at once on a phone. The first counted view of this group (`experiment:counted`) is kept in memory and drawn as the muted "your view" tick, which fades in once. Does nothing without a kit chart. |
| `HomeSections`, `HomeSectionsView`, `homeScrollProps`, `homeTickAllowed` | `src/components/home/HomeSections.tsx` | The Home page below the header, in page order at every width: `Hero` with `LiveNote`, `FeaturedCases` (the model's headline group), `ScrollMoment` and `Tools`. One server composition for `/v/[arm]` (which renders the beacon first) and the test build's host (no beacon); it takes the server-only Home model and hands each part only what it needs. It builds each scroll-moment chart entry from `chartSnapshot`, `homeChartTable` and `chartAriaLabel`, with `tickAllowed` true only with no ceiling day, a test that is not held, paused, closed or short of data, and data fresh at render time. |
| `ReturnsFigure` | `src/components/retention/ReturnsFigure.tsx` | The returns-cleaning Figure (`returns`): returned-order value per month from the retail export, with reversed orders counted or removed (Segmented and Reset, preset removed). The value axis is the same in both modes, the partial last month is an outline, and the growth compares January to November of both years. The server draws the preset and the open table; the island (`ReturnsFigureClient.tsx`, `ReturnsInteractive.tsx`) gets only the monthly rows (`src/lib/retention/returns.ts`). Its `faultAfterChange` prop is a test seam that only a dev host may set (`tests/unit/lab/fault-seam-guard.test.ts`). |
| `ReturnsFigureClient`, `ReturnsIsland`, `ReturnsControls`, `InertReturnsControls` | `src/components/retention/ReturnsFigureClient.tsx` (client) | Places the returns island with `EagerOrIntent` (`returns` keys load it right after hydration), and the control row the island and the preview share; the preview's copy has handlers that do nothing. |
| `ReturnsInteractive` | `src/components/retention/ReturnsInteractive.tsx` (client) | The lazy returns island: reads and writes its URL state (`?returns.mode=raw`), draws the same view as the server preview and announces the result only on a committed change. |
| `ReturnsFigureView`, `ReturnsChart`, `ReturnsResult` | `src/components/retention/ReturnsView.tsx` | The returns Figure's hook-free view, shared by the server preview (also the no-JS view) and the island: returned-order value per month in the chosen mode, with its result line and table. |
| `CohortFigure` | `src/components/retention/CohortFigure.tsx` | The cohort Figure (`cohorts`): the share of each Jan to Nov 2010 cohort who ordered again in each of the twelve months after their first order (month zero, the first order, is in the table only). From 600 px up a heatmap of every cohort (one sequential hue with each value printed, the chosen row outlined and labelled); below it the chosen cohort as a line on an axis every cohort shares. Cell values are printed on their cells: the one stated exception to labels-off-marks, ink at least 6.2:1 on the darkest possible cell. Both charts are drawn and CSS shows one with `display: none`. The picker is the kit's StepNav (Previous and Next through the cohorts) with Reset, all three with stable ids, so focus on a preview control passes to the island's. The server draws the preset and the open table; the island (`CohortFigureClient.tsx`, `CohortInteractive.tsx`, view `CohortView.tsx`) gets only the cohort rows and the badge (`src/lib/retention/cohorts.ts`). Its `faultAfterChange` prop is a test seam that only a dev host may set. |
| `CohortFigureClient`, `CohortIsland`, `CohortControls`, `InertCohortControls` | `src/components/retention/CohortFigureClient.tsx` (client) | Places the cohort island with `EagerOrIntent` (`cohorts` keys load it right after hydration), and the control row the island and the preview share; the preview's copy has handlers that do nothing. |
| `CohortInteractive` | `src/components/retention/CohortInteractive.tsx` (client) | The lazy cohort island: reads and writes its URL state (`?cohorts.cohort=2010-03`), draws the same view as the server preview and announces the result only on a committed change. |
| `CohortFigureView`, `CohortHeatmap`, `CohortLine`, `CohortResult`, `cohortResultText` | `src/components/retention/CohortView.tsx` | The cohort Figure's hook-free view, shared by the server preview (also the no-JS view) and the island: the heatmap, the chosen cohort's line, the result line and the table. |
| `RfmFigure` | `src/components/retention/RfmFigure.tsx` | The RFM Figure (`rfm`, static): share of customers (outlined) and share of spend (filled) per segment on one axis from none to all, each bar labelled with its series and value, segment names on their own line. The Champions customer share is the checked fact, not the export's rounded value (`src/lib/retention/rfm.ts`, which also holds the Champions scores). |
| `ModelFigure` | `src/components/retention/ModelFigure.tsx` | The model Figure (`models`, static): the recency rule and gradient boosting as dots at their ROC AUC on a track from chance to perfect, with no interval on either AUC; the gain and its interval are facts in the result line. The table adds logistic regression and the lapsed-only scores, every AUC to three fixed decimals ("0.710"); the axis ticks print one fixed decimal ("1.0"). |
| `BuildNote`, `BUILD_NOTE_SECTIONS`, `Paragraphs`, `NoteList`, `DiagramStep`, `DiagramConnector` | `src/components/build-notes/BuildNote.tsx` | The one frame of every build note (Weather, n8n, MarketingWS, Docproof), the Retention outline adapted to a tool: the title, its intro (block content; the frame adds no `<p>`) and an optional line on my role (no Summary section), the section links, then the problem, the architecture, "How I checked this", the outcome, the limits and the sources, each a `<section id>` with its own h2. A note may leave a section out, never rename one; only the sections it has are drawn and linked. Section bodies bring their own readable column (`TEXT`). Every diagram draws its steps with `DiagramStep` (an outlined box, `border-muted`) joined by `DiagramConnector` (a drawn, `aria-hidden` line). No motion and no card grid. |
| `NoteShot` | `src/components/build-notes/NoteShot.tsx` | A real screenshot in a build note: the picture, its caption and, when its text is small beside the column, a link to the full-size file. A 1 px border and the site radius, no shadow; it never grows past its capture size or overflows the column. |
| `WeatherPage`, `WEATHER_SECTIONS` | `src/components/weather/WeatherPage.tsx` | The Weather build note (`/work/weather`): the pipeline diagram (`weather-pipeline`, an ordered list of stages, so it is its own text alternative) and the open "Checks by level" table with its badge. The counts per level come from the source adapter `src/lib/weather/checks.ts`, which passes no check name, failing-row count or reading to the page; prose in `content/weather.tsx`. It links the dataset and the repository at a fixed commit (`content/weather.tsx`). |
| `N8nPage`, `N8N_SECTIONS` | `src/components/n8n/N8nPage.tsx` | The n8n build note (`/work/n8n`), the last Work item: the flow diagram (`n8n-flow`, the e-invoice intake and the error alerts as two ordered lists). Its one figure is the test count fact; the repository links name a fixed commit (`content/n8n.tsx`). |
| `SrmFigure` | `src/components/lab/SrmFigure.tsx` | The Lab's split check (`srm`): Group A visitors, Group B visitors, Expected share in group A and Reset, with paired bars of observed (filled) and expected (outlined) visitors per group. The chi-square test is the statistics library's `srmTest` (one degree of freedom); a split is flagged below a p-value of 0.001 (`SRM_THRESHOLD`, held equal to `srmTest`'s flag by a unit test), and a flagged p-value prints as below the threshold. No visitors at all is its own state with no test. The caption says a flag is a warning to investigate, the approximation is rough under 5 expected visitors, and these are simulated diagnostics, not live results. The server draws the preset and the open table; the island (`SrmFigureClient.tsx`, `SrmInteractive.tsx`, view `SrmView.tsx`) receives no data and computes with the same model (`src/lib/lab/diagnostics.ts`; the client-safe values in `diagnostics-values.ts`). Its `faultAfterChange` prop is a test seam that only a dev host may set. |
| `SrmFigureClient`, `SrmIsland`, `SrmControls`, `InertSrmControls` | `src/components/lab/SrmFigureClient.tsx` (client) | Places the split-check island with `EagerOrIntent` (`srm` keys load it right after hydration), and the control row the island and the preview share; the preview's copy has handlers that do nothing. |
| `SrmInteractive` | `src/components/lab/SrmInteractive.tsx` (client) | The lazy split-check island: reads and writes its URL state (`?srm.nA=120&srm.nB=60`), draws the same view as the server preview and announces the result only on a committed change. |
| `SrmFigureView`, `SrmChart`, `SrmResultLine` | `src/components/lab/SrmView.tsx` | The split-check Figure's hook-free view, shared by the server preview (also the no-JS view) and the island: paired observed and expected bars per group and the result line, every number marked simulated. |
| `CurseFigure` | `src/components/lab/CurseFigure.tsx` | The Lab's exaggeration Figure (`curse`): True effect, Standard error (the same arbitrary units) and Reset, at a fixed two-sided significance level of 0.05. Power, the wrong-sign rate and the exaggeration among significant estimates come from the statistics library's `retrodesign`; the chart is the analytic exaggeration over every reachable ratio (0.02 to 50, on a log10 x-axis) with the current ratio's own datum as the orange dot, and its table row uses the readout's words. A zero effect has no dot and says exaggeration is undefined; any non-finite result is words only. Island files as for `SrmFigure` (`CurseFigureClient.tsx`, `CurseInteractive.tsx`, view `CurseView.tsx`). Its `faultAfterChange` prop is a test seam that only a dev host may set. |
| `CurseFigureClient`, `CurseIsland`, `CurseControls`, `InertCurseControls` | `src/components/lab/CurseFigureClient.tsx` (client) | Places the exaggeration island with `EagerOrIntent` (`curse` keys load it right after hydration), and the control row the island and the preview share; the preview's copy has handlers that do nothing. |
| `CurseInteractive` | `src/components/lab/CurseInteractive.tsx` (client) | The lazy exaggeration island: reads and writes its URL state (`?curse.trueEffect=0.5&curse.se=2`), draws the same view as the server preview and announces the result only on a committed change. |
| `CurseFigureView`, `CurseChart`, `CurseReadout`, `CurseResultLine`, `CURSE_X_LABEL` | `src/components/lab/CurseView.tsx` | The exaggeration Figure's hook-free view, shared by the server preview (also the no-JS view) and the island: the exaggeration chart, the readout and the result line, every number marked simulated. |
| `RetentionPage`, `RETENTION_SECTIONS` | `src/components/retention/RetentionPage.tsx` | The Retention case study, the golden page (below): the analysis template's sections in order, each a `<section>` with an id and its own h2, the four Figures above and the two open sizing tables with their badges. Its prose comes from `content/retention.tsx`. Optional `planner` places a planner Figure in the win-back section, after the sourced sizing table and before the links to the Lab and to the Home planner. `RetentionCaseStudy` is the page as it ships, with `FullPlanner` (`winback` and `winback-duration`, `context="retention"`) as its planner; `src/app/work/retention/page.tsx` and its dev host both mount it. |
| `MarketingwsPage`, `MARKETINGWS_SECTIONS`, `MARKETINGWS_TITLE` | `src/components/marketingws/MarketingwsPage.tsx` | The MarketingWS build note, in the shared `BuildNote` frame, with the problem, the architecture, how I checked this, the outcome, the limits, and the sources and links (the section names and anchors every build note shares). The architecture is a diagram Figure (`marketingws-steps`): the steps of one request as an ordered list of outlined boxes (brief, draft, check, translate, output, each a `DiagramStep`) joined by `DiagramConnector`s, so the list is its text. No figure, no island and no motion; the repository links are pinned to commits, and the demo link carries its free-tier note in the same list item. Its prose comes from `content/marketingws.tsx`. Mounted by `src/app/work/marketingws/page.tsx`. |
| `DocproofPage`, `DOCPROOF_SECTIONS`, `DocproofDiagram` | `src/components/docproof/DocproofPage.tsx` | The Docproof build note at `/work/docproof`, in the shared `BuildNote` frame: the problem, the architecture with its diagram Figure (`docproof-architecture`: input, orchestration, checks and report as an ordered list of `DiagramStep`s in a grid, no badge, table or controls), "How I checked this" with one recorded run of the verify check, the outcome, the limits, and "Sources and links" (the section names every build note shares). Its prose and the recorded run (inputs, command and output exactly as captured, marked `build`; "Not recorded" without one) come from `content/docproof.tsx`. |
| `WorkPage`, `WORK_SECTIONS`, `WORK_TITLE` | `src/components/work/WorkPage.tsx` | The Work directory at `/work`: the golden page's frame (one h1 "Work" with a one-line intro, one `<section id>` per group with its own h2) over the two groups of `content/work.tsx` in their order, n8n last. Each group is a ruled list under a 1 px `ink` rule (as `CaseCard`): the interval glyph (28 px, `aria-hidden`) as the row marker on the title's first line, the title as the row's one link in an h3, and its sourced line beside it from 768 px up. No dates, cards, Figures or outcome numbers; the one figure is a Fact. Section anchors come from the group label (`#experimentation`, `#tools`). Mounted by `src/app/work/page.tsx`. |
| `FullPlanner` | `src/components/lab/FullPlanner.tsx` | The full sample-size planner, two Figures loaded as one paired island: sizing (`planner`: Baseline conversion, Rise to detect, MDE unit in points or percent of the baseline, Reset; Cohen's h, two-sided, significance level 0.05, power 0.8, equal groups, one look) and duration (`duration`: Total visitors per day and Reset; whole weeks, rounded up). The rise is stored in whole points whatever unit shows it, so a unit switch never changes the sample, and the percent slider steps one point at a time. The server draws the preset pair and both open tables; `EagerOrIntent` loads the island for a key of either Figure (`src/lib/lab/full-planner.ts`, the client-safe values in `full-planner-values.ts`, copy in `content/lab.tsx`). `context="retention"` with its own ids plans a hypothetical uplift on the Retention win-back's observed baseline. Its `faultAfterChange` prop is a test seam that only a dev host may set. |
| `DurationFigure` | `src/components/lab/DurationFigure.tsx` (client) | The duration Figure's live side inside the paired island (`FullPlannerClient.tsx`, views in `FullPlannerView.tsx`, control rows in `FullPlannerControls.tsx`): it owns only its traffic and that URL state, and takes the visitors per group from the sizing Figure. It reports the traffic on screen to the sizing side (`trafficShownRef`), so a committed sizing change announces the weeks it leads to. Its Reset restores the traffic only. |
| `FullPlannerIsland`, `SizingControls`, `DurationControls`, `InertSizingControls`, `InertDurationControls` | `src/components/lab/FullPlannerControls.tsx` (client) | The full planner's client side that the page loads at once (no statistics): the lazy paired island and the two control rows the island and the preview share, with the same control ids in both so focus moves from the preview's control to the island's. The Inert copies have handlers that do nothing. |
| `FullPlannerClient` | `src/components/lab/FullPlannerClient.tsx` (client) | The full planner's paired island: it owns the sizing values once, with their URL state (`planner.*`), and hands the visitors per group to `DurationFigure`. |
| `SizingFigureView`, `DurationFigureView`, `PAIR_CLASS` | `src/components/lab/FullPlannerView.tsx` | The full planner's hook-free view, shared by the server preview (also the no-JS view) and the island: the sizing Figure and the duration Figure, every computed number marked simulated and the Retention context's baseline and target carrying their fact refs. |
| `PeekingFigure` | `src/components/figures/PeekingFigure.tsx` | The peeking Figure (`peeking`, "More looks, more false winners"): the share of simulated A/A runs that found a false winner by each look, with Looks (1 to 50), Schedule (peek daily or look once), Fix (none, O'Brien-Fleming or a confidence sequence) and Reset; `?peeking.preset=interview` is the deep link. Every view is a lookup in the seeded table (`src/lib/lab/peeking.ts`), never a simulation in the browser; chart, result line, caption and table come from one view, and the table prints every percent to one fixed decimal. The result gives the rate with its 95% Monte Carlo range and the price of a fix as planning arithmetic. Looking once disables Fix and says why, and the reason describes the disabled Fix group. The page loads at once only `PeekingFigureClient.tsx` and the values (`src/lib/lab/peeking-values.ts`); the lazy island (`PeekingInteractive.tsx`, with the view `PeekingView.tsx`) brings the model and its table (`tests/unit/lab/peeking-bundle.test.ts`). Its `faultAfterChange` prop is a test seam that only a dev host may set. |
| `PeekingFigureClient`, `PeekingIsland`, `PeekingControls`, `InertPeekingControls` | `src/components/figures/PeekingFigureClient.tsx` (client) | Places the peeking island with `EagerOrIntent` (`peeking` keys load it right after hydration), and the control row the island and the preview share (Looks, Schedule, Fix, Reset). Looking once disables Fix and says why, in a line that keeps its room. It imports the client-safe values only, never the model. |
| `PeekingInteractive` | `src/components/figures/PeekingInteractive.tsx` (client) | The lazy peeking island: reads and writes its URL state (`?peeking.looks=30&peeking.mode=once&peeking.fix=obf`), looks the view up in the precomputed table in render, draws the same view as the server preview and announces the result only on a committed change. |
| `PeekingFigureView`, `PeekChart`, `peekAnnouncement` | `src/components/figures/PeekingView.tsx` | The peeking Figure's hook-free view, shared by the server preview (also the no-JS view) and the island: the chart, the result line, the caption and the table, all read from one view so they never disagree. |
| `DemoPage`, `DEMO_TITLE` | `src/components/demo/DemoPage.tsx` | The interview links at `/demo` (noindex, follow; not in the menu): the home page in each group through the address the proxy already understands (`/?variant=a`, `/?variant=b`), which the beacon refuses as forced, so the view never counts. Those two are plain anchors with the kit link's look, so a click is a full request the proxy assigns: the group pages never read the query, so a `next/link` soft navigation could reuse a payload cached for `/` and show the other group; a note on which headlines that view shows in the configured phase; and two Lab links with their URL state (`?peeking.preset=interview`, and the planner pair's `planner.*` and `duration.*` keys at `#sample-size`), plus the whole Lab. No beacon, no group label, no store read. Copy and links in `content/demo.tsx`. |
| `LabPage`, `LabPeekingPage`, `LAB_TITLE` | `src/components/lab/LabPage.tsx` | The Lab (`/lab`), copying the golden page's structure: the h1 and a one-line intro, the four examples as section links each with one sentence on what it is for, then one `<section id>` per example with its own h2 and Figure (`FullPlanner`, `PeekingFigure`, `SrmFigure`, `CurseFigure`), and the limits. Section anchors (`sample-size`, `peeking-at-results`, `split-check`, `exaggeration`, `limits`) never equal a Figure id, so `/lab#peeking` lands on the Figure. `LabPeekingPage` is the peeking example alone (`/lab/peeking`, the interview link), the same Figure under the heading Lab with a link back. Copy in `content/lab.tsx`; mounted by `src/app/lab/page.tsx`, `src/app/lab/peeking/page.tsx` and their dev hosts. |
| `StateExplanation` | `src/components/live-page/StateExplanation.tsx` | The Live test page's sentence on the state of the experiment, then its next step when there is one. It reads only the allowlisted display shape (`toLivePageDisplay` in `src/lib/live-page/model.ts`, built on the server from the server-only `LivePageModel`), whose counts are the published cells ("<5" for 1 to 4) and which offers the kit's live components the exact snapshot only when every count they would print is 0 or at least 5 (`kitSafe`). The state comes from the Home model's mode; a stop is said to have happened only when it is confirmed, a stored stop under check promises no update, a held test never reads as running, passed or inconclusive, and no sentence names the reader's group. The next step comes only from `nextStepFor` (`src/lib/live-page/next-step.ts`). |
| `MarkedText`, `When`, `provenanceOf`, `BUILD` | `src/components/live-page/Values.tsx` | Small marked values the Live test page prints: a text value from the build or the data (a tag, a hash, a commit, a version) as `<data>` with its refs, and a Berlin date as `<time>`. |
| `AudiblePage`, `AUDIBLE_TITLE`, `AUDIBLE_SECTIONS` | `src/components/audible/AudiblePage.tsx` | The experimentation-method case study in the golden page's template: the title and its intro, the summary box, the section links, then problem, data, method, the ship rule with `FrameworkFigure`, the adoption context (`#why-so-many`), test-account automation with `AutomationFigure` (`#automation`), findings, how I checked this, limits, and sources and links. Every figure is a profile `Fact`. Mounted at `/work/audible`. |
| `FrameworkFigure` | `src/components/audible/FrameworkFigure.tsx` | The ship-rule Figure (`framework`) on a made-up product: the main metric's interval (lower and upper end) and the guardrail's upper end, in percentage points from −10 to +10, on three sliders with Reset (`?framework.lower`, `framework.upper`, `framework.guardrail`). The decision comes from the model in `src/lib/audible/framework.ts`, checked in order: stop, hold (the guardrail past its limit of +2), ship, may ship; the URL schema and preset are in `src/lib/audible/framework-url.ts`. One difference axis that never rescales; the guardrail is drawn by its upper end only, with its limit as a dashed line. Badge "Simulated". The server draws the preset and the open table; the island receives only the preset's values. Its `faultAfterChange` prop is a test seam that only a dev host may set. |
| `FrameworkFigureClient`, `FrameworkIsland`, `FrameworkControls`, `InertFrameworkControls` | `src/components/audible/FrameworkFigureClient.tsx` (client) | Places the ship-rule island with `EagerOrIntent` (the Figure's own id only), and the control row the island and the preview share; the preview's copy has handlers that do nothing. |
| `FrameworkInteractive` | `src/components/audible/FrameworkInteractive.tsx` (client) | The lazy ship-rule island: reads and writes its URL state, keeps the lower end at or below the upper end (moving one end past the other carries it along, and all three keys are written), hands focus from the preview's Reset to its own, and announces on a committed change only. |
| `FrameworkFigureView`, `FrameworkChart`, `FrameworkResult`, `frameworkTable`, `frameworkAnnouncement`, `DECISION_LABEL` | `src/components/audible/FrameworkView.tsx` | The ship-rule Figure's hook-free view, shared by the server preview and the island: the chart, the result line (the decision as a word, then the bounds), the table of the three bounds and the limit, and the announcement. Takes an optional `state` for the no-JS and error views. |
| `AutomationFigure`, `automationTable` | `src/components/audible/AutomationFigure.tsx` | The test-account setup Figure (`setup-time`, static): minutes per test account before the tool and with it, as two bars read from the profile facts, badged "Simulated", with a caption that it is a reconstruction from approximate reported timings. The table cells carry the two facts' refs and the axis ticks `simulated`. Takes an optional `state` for the no-JS and error views. |
| `LivePage`, `LIVE_SECTIONS` | `src/components/live-page/LivePage.tsx` | The Live test page (`/experiment`, ISR 300 s): where the test stands (`StateExplanation`), then the plan with the pre-registration's version, tag and design hash and the build commit, the funnel, the split check, the detectable effect, the results, the decision and end, the data with the recomputation commands, and the colophon. It renders the display shape only (published cells), has no client island, beacon or polling, and assigns no group. |
| `FunnelFigure` | `src/components/live-page/FunnelFigure.tsx` | Beacons received, after the bot filter, counted entry views and cards in view, as a list: the first two totals say "Not published", the last two are the published per-group cells. The exclusions by reason (published cells) and the structural preview row (always 0). A placeholder shows no count. |
| `DetectableFigure` | `src/components/live-page/DetectableFigure.tsx` | The smallest lift each number of views per group would detect 8 times in 10 at the committed planning click rate, for one look at that size, with the current size marked when the published data gives it; otherwise a sentence says why (no views, a small group, beyond the range, no data). |
| `ResultsFigure` | `src/components/live-page/ResultsFigure.tsx` | The results under the confidence sequence: the kit's `ConfidenceChart` only when `kitSafe` and its copy is true for the state (no own-view mark); otherwise a page-owned Figure with the last interval drawn (the kit's `NowRow`) or the hollow mark and a sentence, and a table of published cells. Nothing for a placeholder, a failed split check or a failed calibration. |
| `Colophon` | `src/components/live-page/Colophon.tsx` | The stack (versions from `package.json`) and the deploy's test and audit results from the build metadata embedded at build time (`readBuildMeta`, `src/lib/live-page/build-meta-file.ts`); without it, "Test and audit results are added when the site is deployed." Lighthouse is labelled a CI lab run. |
| `AboutPage`, `ABOUT_SECTIONS`, `ABOUT_TITLE` | `src/components/about/AboutPage.tsx` | The About page: the photograph (`next/image` at 480 px, 960 px for dense screens, lazy, alt text from `content/about-photo.ts`) beside a five-sentence story, then Timeline, Tools I have shipped with, Languages and CV sections, each a `<section>` named by its h2. Prose from `content/about.tsx`. The CV section links the CV page, and shows `CvDownload` only when the build has a checked PDF. |
| `CvPage`, `CV_SECTIONS` | `src/components/about/CvPage.tsx` | The printable CV page: the web CV PDF's claims (each marked `data-cv-claim`), in the CV's order, from `content/about.tsx`. The contact route is LinkedIn. When the build has a checked PDF, `CvDownload` sits at the top as the one primary button. Printing drops the site header, footer and buttons. |
| `CvDownload` | `src/components/about/CvDownload.tsx` | The CV PDF's download button, "Download CV (PDF, <size>)", the size from the build (`data-derived="build"`); hidden in print. Rendered only when the build has a checked PDF. |
| `TimelineRow` | `src/components/about/TimelineRow.tsx` | A row on the About timeline: the months, the role (h3) and where. |
| `Months` | `src/components/about/Months.tsx` | A month range ("Aug 2023 – Apr 2025", "Oct 2026 – present"), each month in a `<time>`. |
| `PulsePage`, `PULSE_SECTIONS`, `PULSE_TITLE`, `PULSE_METADATA_TITLE` | `src/components/pulse/PulsePage.tsx` | The Pulse case study at `/work/pulse`, in the golden page's composition: the h1 is the event count as a `Fact` and the claim it heads, then the summary, the section links and one `<section id>` per part. The event table (`taxonomyTable` in `src/lib/pulse/tables.ts`: the export's rows word for word, `source:pulse` on every cell, no provenance badge) sits in the same section as the sentences that call its questions design hypotheses. Its prose comes from `content/pulse.tsx`. |
| `PulseFigure` | `src/components/pulse/PulseFigure.tsx` | The Pulse dashboard Figure (`pulse`, "Simulated"): the server reads the taxonomy (`src/lib/pulse/taxonomy.ts`, server only) and draws the preset, all channels over 30d, with an empty event list; the island gets only the taxonomy rows, for its bus. Its `faultAfterChange` prop is a test seam that only a dev host may set. |
| `PulseFigureClient`, `PulseControls`, `InertPulseControls`, `PulseIsland` | `src/components/pulse/PulseFigureClient.tsx` (client) | Places the island with `EagerOrIntent` (`ids={[PULSE_ID]}`). The one control row: Channel, Date range (the source's 7d, 30d and 90d, marked `source:pulse`) and Reset, URL keys `pulse.channel` and `pulse.range` (`src/lib/pulse/dashboard.ts`). |
| `PulseInteractive` | `src/components/pulse/PulseInteractive.tsx` (client) | The lazy island: one bus per mount (`createPulseBus` in `src/lib/pulse/bus.ts`), the event stream in its own state through `src/lib/pulse/session.ts`. It sends Viewed Dashboard once per mount and each action's event from its handler; Reset restores the preset, drops the saved view and the open detail, empties the stream and sends one new Viewed Dashboard. Export CSV saves the rows shown, made in memory. Nothing is stored or requested, and only the view is in the URL. |
| `PulseFigureView`, `PulseResult`, `PulseStream`, `RangeText`, `PULSE_FIGURE_TITLE` | `src/components/pulse/PulseView.tsx` | The shared, hook-free view: two line charts of made-up daily numbers on fixed value axes, each with a Detail button; Export CSV, Save view and Load saved view (disabled, with its reason, until a view is saved) as native buttons in the labelled dashboard content, not in the control row; and the last 20 events, newest first, not a live region, with each property value marked by its refs and the local demo prompt version. |

## Golden-page rule

The Retention page is the reference page: `RetentionPage` in
`src/components/retention/RetentionPage.tsx`, mounted by `src/app/work/retention/page.tsx`, with
its prose in `content/retention.tsx`. Later pages copy its structure. When a subagent builds a
page, give it the primitives catalogue above and the golden page.

- **Outline.** One h1 (the page title) with a one-line intro under it, then a Summary box (question,
  my role, method, result, what I would recommend, next step), then the section links
  (`<nav aria-label="On this page">`), then one `<section id>` per part: problem, data, method, one
  section per analysis step with its Figure, findings, "How I checked this", limits, sources and
  links. Each section is labelled by its own h2 (`aria-labelledby` the h2's `<id>-title`); Figure
  and table titles are h3. Anchor ids are descriptive (`returns-cleaning`, not `s4`) and never equal
  a Figure id; the link labels are short ("Cleaning").
- **Width.** Prose in the readable column (`max-w-text`); Figures and tables run to `max-w-figure`.
  Sections are spaced (`mt-12 md:mt-section`), not boxed: no card grid and no motion of the page's
  own.
- **Period and denominator.** Every rate says over which months and of whom ("January to November
  2011 against the same months of 2010", "of lapsed customers", "of customers at the cutoff").
- **Provenance and tables.** Every chart is a Figure with its badge and table; a table shown without
  a chart has its own h3, an open `DataTable` and a `ProvenanceBadge`.
- **URL state.** Interactive Figures keep their setting under their own `?<figureId>.<param>` keys,
  so a link opens the same view; the page itself reads no query.
- **Limits.** At least two concrete limits in their own section, each about this data (what it
  cannot show, what an interval does not cover), never a generic disclaimer.
- **Links.** Every link on the page is a 44 px target (`TextLink` with `standalone`), sources link
  their pinned commits, never a moving branch, and "How I checked this" quotes the code it relies on
  exactly, from the pinned commit.

## Design guardrails

- **Vocabulary.** Visitor-facing copy says "group". Code says "arm".
- **Copy.** First person, plain, sentence case. Status is a word ("SRM passed"), and colour only
  repeats it. Navigation is exactly Work, Lab, Live test, About, CV, Menu.
- **Motion.**
  - The Home scroll moment is the only motion the visitor doesn't trigger. No other page has any.
  - All other motion answers a visitor's action.
  - No transition while a slider is dragged.
  - Respect `prefers-reduced-motion` (the tokens collapse every duration).
  - No scroll-jacking and no fade-up-on-every-section.
- **Banned by `scripts/design-lint.ts`**, one bullet per rule id. Pass 1 reads the CSS the build
  emits (`npm run lint:design`), pass 2 reads the source (`npm run lint:design:src`). Four rules run
  in both passes: in source they also read an inline `style={{ ... }}` object literal and SVG paint
  attributes (a style object built elsewhere and passed by name is not followed).
  - `no-shadow`: any `box-shadow` except the focus-ring utilities, any `drop-shadow()` and any
    `text-shadow`; in source, an inline `boxShadow`, `textShadow` or `drop-shadow` filter.
  - `no-caps`: `text-transform: uppercase`, or an inline `textTransform: 'uppercase'`.
  - `no-mono`: a monospace font family outside `pre`, `code`, `kbd`, `samp` and the code block
    class, or an inline `fontFamily` naming one outside `<code>` and `<pre>`.
  - `no-keyframes`: any `@keyframes` that is not a `scroll-moment-*` one.
  - `no-arbitrary-colour`: a hex, `rgb()` or `hsl()` literal in compiled CSS outside the theme
    variables (blocks `bg-[#fff]`); in source, a colour function or a CSS colour name (`red`) in an
    SVG paint attribute (`fill`, `stroke`, `stopColor`, `floodColor`, `lightingColor`, `color`) or
    an inline colour style. `currentColor`, `none`, `transparent`, `inherit` and
    `var(--color-*)` are fine.
  - `no-fade-up`: `fade-up`, `animate-in` and `slide-in-from` classes.
  - `no-hover-move`: `hover:translate-*`, `hover:scale-*`, or a transform inside a `:hover` rule.
  - `no-dark`: `prefers-color-scheme: dark` and `dark:` variants. The site is light only.
  - `no-hex`: a hex colour in a class name, style, SVG paint attribute or CSS value outside
    `src/styles/tokens.css` (and the favicon `src/app/icon.svg`).
  - `no-arrow-in-content`: an arrow character, or its HTML entity, in text content.
  - `no-middle-dot`: a middle dot, or its HTML entity, in text content.
  - `no-emoji`: an emoji in content. Icons come from the kit's `Icon`.
- **Closed namespaces.** `bg-blue-500`, `shadow-md`, `font-bold`, `text-5xl`, `rounded-lg`,
  `tracking-widest` and `animate-bounce` produce nothing: use the names in
  `docs/design/tokens.md`.
- **Quality floor.**
  - Responsive at 375, 390, 768, 1024 and 1440 px, and at 1280x720 with 125% zoom (screen-share).
  - Content reflows without horizontal scrolling at 320 px and at 400% zoom.
  - Touch targets are at least 44 px (`min-h-(--size-target)`); icon-only controls are 44 px wide
    too. A link inside a sentence of running text follows WCAG's inline exception and may be the
    height of the line; every other target is 44 px.
  - Visible keyboard focus: never put `overflow: hidden` on an ancestor of a control.
  - WCAG AA contrast.
  - Colour-blind-safe chart series, and status is never colour alone.

## Repository notes

- **Skills.** `.claude/skills/` is git-ignored and restored from `skills-lock.json` with
  `npx skills experimental_install`.
  - The restore can pull newer, unaudited versions, so after every restore compare each skill's
    hash with the lock before using it.
  - Review the diff before `npx skills update -p`.
- **Reference clones.** `.references/` is git-ignored and holds read-only reference clones. Never
  copy code from them.
- **Git.** Conventional Commits, trunk-based, short-lived branches.
