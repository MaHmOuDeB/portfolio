# CLAUDE.md

Guidance for Claude Code in this repository: the portfolio site of Mahmoud El Bergui, an
experimentation and growth analyst in Berlin.

@~/code/portfolio/private/CLAUDE.private.md

> **Status: pre-build.** The stack, commands and structure sections are completed in Phase 3,
> after the design direction is approved. Until then, no product code is written.

## Principles

- **Every figure is a `<Fact>`.** Numbers come from vendored source exports (`sources.lock.json`),
  never from typed numerals. A truth audit in CI scans the built HTML for stray numbers.
- **One system.**
  - Every chart and interactive element is built from the Figure kit: title stating the finding,
    one control row, reset, URL state, provenance badge, table fallback.
  - Colours, type and spacing come only from `src/styles/tokens.css`.
  - `/kitchen-sink`, a dev-only route, shows every component in every state.
- **Low-traffic first.** The live experiment will usually be in a "collecting" state. That state
  is designed first and must look deliberate, never empty or broken.
- **Statistics are tested first.** Reference values come from scipy and statsmodels via
  `stats-ref/generate.py`. Simulations are seeded.

## Design guardrails

- **Vocabulary.** Visitor-facing copy says "group". Code says "arm".
- **Motion.**
  - The Home scroll moment is the only motion the visitor doesn't trigger. No other page has any.
  - All other motion answers a visitor's action.
  - Respect `prefers-reduced-motion`.
  - No scroll-jacking and no fade-up-on-every-section.
- **Banned by `scripts/design-lint.ts`:**
  - raw hex outside `tokens.css`;
  - `uppercase` with `tracking-*` labels;
  - `→` in content;
  - monospace labels outside code;
  - default shadows;
  - `fade-up` classes.
- **Quality floor.**
  - Responsive at 375/390/768/1024/1440, and at 1280×720 with 125% zoom (screen-share).
  - 44px touch targets.
  - Visible keyboard focus.
  - WCAG AA contrast.
  - Colour-blind-safe chart series.

## Repository notes

- **Skills.** `.claude/skills/` is git-ignored and restored from `skills-lock.json` with
  `npx skills experimental_install`.
  - The restore can pull newer, unaudited versions, so after every restore compare each skill's
    hash with the lock before using it.
  - Review the diff before `npx skills update -p`.
- **Reference clones.** `.references/` is git-ignored and holds read-only reference clones. Never
  copy code from them.
- **Git.** Conventional Commits, trunk-based, short-lived branches.
