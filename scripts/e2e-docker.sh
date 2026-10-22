#!/usr/bin/env bash
# Runs the Playwright suite inside the image the CI e2e job uses, so a Linux-only difference (font
# rasterisation, scrollbars, subpixel layout) can be reproduced on a Mac:
#
#   npm run test:e2e:docker                                    # the whole suite
#   npm run test:e2e:docker -- tests/e2e/shell.spec.ts --project=desktop-chromium
#
# The repository is mounted read-only. A copy goes to the named volume `portfolio-e2e-work`, where
# `npm ci` installs the Linux builds of the native modules (the host's node_modules is never touched;
# the install is repeated only when package-lock.json changes),
# and the run uses CI=true and HOME=/root like the workflow. The arguments after `--` go to
# `playwright test`. Visual baselines are written only by CI (the `update-baselines` label), so with
# CI=true a missing baseline is reported as a failure here, as it is there. Needs Docker.
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.63.0-noble"
VOLUME="portfolio-e2e-work"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker run --rm \
  -e CI=true -e HOME=/root \
  -v "$ROOT":/src:ro \
  -v "$VOLUME":/work \
  -w /work \
  "$IMAGE" \
  bash -euc '
    # Replace the sources, keep node_modules between runs.
    find /work -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
    tar -C /src \
      --exclude=./node_modules --exclude=./.next --exclude=./.git --exclude=./private \
      --exclude=./test-results --exclude=./reports --exclude=./coverage --exclude=./.vercel \
      --exclude=./.superpowers --exclude=./tsconfig.tsbuildinfo -cf - . | tar -C /work -xf -
    # Reinstall only when the lockfile changed since the volume was filled.
    want="$(sha256sum package-lock.json | cut -d" " -f1)"
    if [ ! -d node_modules ] || [ "$(cat node_modules/.lock-hash 2>/dev/null)" != "$want" ]; then
      npm ci --no-audit --no-fund
      echo "$want" > node_modules/.lock-hash
    fi
    # Two workers by default: the Docker VM is slower than a CI runner, and three parallel workers on the
    # 144-Figure live page time out. An explicit --workers in the arguments wins.
    npx playwright test --workers="${E2E_WORKERS:-2}" "$@"
  ' bash "$@"
