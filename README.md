# Mahmoud El Bergui

I'm an experimentation and growth analyst based in Berlin, Germany. This portfolio brings together interactive analytics case studies and a live experiment on the site's own visitors: an A/A calibration checks the instrumentation before an A/B comparison of case-study card headlines. I built it to make the reasoning behind an analysis explorable. The shared Figure kit and experiment infrastructure are in place; the case-study pages and finished home page are still being built.

## How the site stays honest

Reported project figures come from pinned, tested exports of public source repositories and render through `<Fact>`. Profile facts have a separate checked data file; computed and live values carry source references. CI scans the built HTML for untraced numbers and prohibited claims. Simulated data is labelled “Simulated”, and the statistics are tested against scipy and statsmodels reference values. See the [architecture](docs/architecture.md) for how these checks fit together.

## Stack and local development

Next.js App Router, React and TypeScript, with Tailwind for styling, D3 scales and shapes for charts, Vitest for unit tests and Playwright for browser tests. Use the Node version in [.nvmrc](.nvmrc), then install dependencies with `npm ci`.

| Command | Purpose |
|---|---|
| `npm run dev` | Start development. `KITCHEN_SINK=1 npm run dev` also enables the component showcase. |
| `npm run build` | Build for production, after checking generated constants and vendored sources. |
| `npm run check` | Run typechecking, ESLint, Stylelint, unit tests and source design lint. |
| `npm run test` | Run Vitest unit tests. `npm run test:cov` adds the statistics coverage gate. |
| `npm run test:e2e` | Run Playwright with the component showcase and a local fake experiment store. Rebuild without the showcase flag afterwards. Visual tests are skipped locally. |
| `npm run test:e2e:docker` | Run the browser suite in the CI image; requires Docker. Missing visual baselines require `--grep-invert @visual`. |

## Repository map

| Path | Contents |
|---|---|
| `src/app` | Routes and API endpoints. |
| `src/components/kit` | Shared Figure frame, charts, controls and accessible table fallbacks. |
| `src/components/shell` | Header, navigation, footer and error messages. |
| `src/lib/figure` | Figure state, URL parameters, geometry and formatting. |
| `src/lib/stats` and `stats-ref` | Statistical methods and Python reference generation. |
| `src/lib/facts` | Typed facts, formatting and checked lookups. |
| `src/lib/experiment` | Assignment, event counting and experiment snapshots. |
| `src/styles/tokens.css` | Design tokens. |
| `content` | Content data, including experiment headlines. |
| `data/sources` and `sources.lock.json` | Vendored exports and their pinned source revisions. |
| `scripts` | Source sync, build checks and audits. |
| `tests/unit` and `tests/e2e` | Unit and browser tests. |
| `docs` | Public design and engineering documentation. |

Read the [architecture](docs/architecture.md), [design tokens](docs/design/tokens.md), [experiment pre-registration](docs/experiment/prereg.md) and [deployed checks](docs/experiment/deployed-checks.md).

## Licence

Code is licensed under [MIT](LICENSE). Written copy, case-study text, photos, the CV and design assets other than code are all rights reserved and are not covered by that licence. The bundled Inter font retains its [SIL Open Font License](src/app/fonts/OFL.txt).
