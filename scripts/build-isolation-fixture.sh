#!/usr/bin/env bash
# The synthetic stand-in for what `vercel pull --environment=production` leaves behind, for the
# Build token isolation CI job (scripts/vercel-build-isolated.sh then builds from it):
#
#   bash scripts/build-isolation-fixture.sh
#
# It writes .vercel/project.json (project settings, so `vercel build` runs offline with no token)
# and .vercel/.env.production.local holding every store credential the wrapper must handle: the
# three write credentials it strips (KV_REST_API_TOKEN, and KV_URL and REDIS_URL, connection
# strings with a password) and the read-only token it keeps. Every value is synthetic, and the
# hosts end in the reserved .invalid, so nothing is ever reached.
#
# It sets VERCEL_ENV="preview", because a build on Vercel (VERCEL=1, which `vercel build` sets) with
# no VERCEL_ENV fails on purpose (src/lib/seo/metadata.ts canonicalOrigin), and it deliberately sets
# no KV_REST_API_URL and no VERCEL_PROJECT_PRODUCTION_URL: this job proves the environment
# isolation, it is not a rehearsal of the production build (which would need the production
# canonical host). Anything else a deploy-style build needs before `vercel build` belongs in this
# script, so the workflow itself does not change. `vercel build` sets VERCEL, which next.config.ts
# reads as a deploy build: such a build fails without public/build-meta.json (the deploy writes it
# with npm run build:meta from the CI reports), so this script writes a synthetic one, whose
# all-zero commit and round counts name no real run.
#
# It refuses to overwrite an existing pulled environment or build-metadata file.
set -euo pipefail

if [ -e .vercel/.env.production.local ] || [ -e .vercel/project.json ] || [ -e public/build-meta.json ]; then
  echo "build-isolation-fixture: .vercel/.env.production.local, .vercel/project.json or public/build-meta.json already exists; not overwriting it" >&2
  exit 1
fi

mkdir -p .vercel
printf '%s\n' '{"projectId":"prj_build_isolation","orgId":"team_build_isolation","settings":{"framework":"nextjs"}}' > .vercel/project.json
{
  echo 'KV_REST_API_TOKEN="synthetic-write-token"'
  echo 'KV_URL="rediss://default:synthetic-password@store.invalid:6379"'
  echo 'REDIS_URL="rediss://default:synthetic-password@store.invalid:6379"'
  echo 'KV_REST_API_READ_ONLY_TOKEN="synthetic-read-token"'
  echo 'VERCEL_ENV="preview"'
} > .vercel/.env.production.local
chmod 600 .vercel/.env.production.local
mkdir -p public
printf '%s\n' '{"commit":"0000000000000000000000000000000000000000","builtAt":"2026-01-01T00:00:00.000Z","unitTests":{"passed":1,"total":1,"skipped":0},"e2eTests":{"passed":1,"total":1,"skipped":0,"flaky":0},"axeViolations":0,"lighthouse":{"performance":100,"accessibility":100,"bestPractices":100,"seo":100},"lighthouseLabel":"CI lab run (mobile, simulated throttling)"}' > public/build-meta.json
echo "build-isolation-fixture: wrote .vercel/project.json, .vercel/.env.production.local and public/build-meta.json (synthetic values)"
