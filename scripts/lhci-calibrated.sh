#!/usr/bin/env bash
# Lighthouse CI on the Mac, calibrated to GitHub's hosted runner (tests/unit/lhci-calibrated.test.ts),
# for local calibration runs only. CI does not use it: it runs the plain `npm run lhci` on GitHub's
# hosted runner.
#
# Lighthouse simulates the throttled CPU by multiplying each main-thread task it measured by
# cpuSlowdownMultiplier. Lighthouse's own benchmark index puts a capped Docker container on a quiet
# Mac (nothing else running) at 2810.5 against 2309 for GitHub's hosted runner (the median
# of its 35 runs on 2026-11-10), which would suggest 4 x 2810.5 / 2309 = 4.9; but against GitHub's
# hosted scores of the same commits, x1.5 under-throttled and x4.9 over-throttled (the benchmark
# overstates this arm64 VM's speed on real page work), and 2.8 matched the hosted TBT on the two
# references from GitHub's common hardware: an empirical calibration. It only holds while the
# machine is as fast as when it was measured, so after collecting, the median benchmark index of the
# runs must lie within +/-20% of 2810.5 (2248-3373, scripts/lhci-benchmark-guard.ts). Outside, it collects once more; still
# outside, it fails as "machine too busy to measure", never as a budget failure. The runs, URL and
# budgets are lighthouserc.json's, unchanged. Chromium runs as root in a Docker container, hence
# --no-sandbox.
set -euo pipefail

MULTIPLIER=2.8
BAND=2248-3373
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
guard() { node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/lhci-benchmark-guard.ts .lighthouseci; }
collect() {
  rm -rf .lighthouseci
  npx --no-install lhci collect --settings.chromeFlags=--no-sandbox --settings.throttling.cpuSlowdownMultiplier="$MULTIPLIER"
}

if [ -z "${CHROME_PATH:-}" ]; then
  export CHROME_PATH="$(node -e "console.log(require('playwright-core').chromium.executablePath())")"
fi

collect
if ! bi="$(guard)"; then
  echo "lhci: benchmark index ${bi} is outside ${BAND}; collecting again in ${LHCI_RETRY_PAUSE:-60} s"
  sleep "${LHCI_RETRY_PAUSE:-60}"
  collect
  if ! bi="$(guard)"; then
    npx --no-install lhci upload
    msg="machine too busy to measure (benchmark index ${bi}, expected ${BAND})"
    echo "$msg" >> "$summary"
    echo "::error::${msg}"
    exit 1
  fi
fi
echo "lhci: benchmark index ${bi} (calibrated band ${BAND}, multiplier ${MULTIPLIER})" | tee -a "$summary"
npx --no-install lhci upload
npx --no-install lhci assert
