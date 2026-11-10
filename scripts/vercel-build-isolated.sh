#!/usr/bin/env bash
# Runs `vercel build` for a deployment without the store's write credentials, and proves it from
# inside the build. The deploy workflow builds through it, and CI runs it on a synthetic pulled
# environment (the Build token isolation job):
#
#   bash scripts/vercel-build-isolated.sh production|preview
#
# `vercel pull` writes the deployment's environment to .vercel/.env.<target>.local and `vercel
# build` loads that file into every process of the build, so unsetting the variables in this shell
# alone would not keep them out. The store's write credentials are KV_REST_API_TOKEN (the REST
# write token) and KV_URL and REDIS_URL (connection strings with the database password; the app
# reads neither). Only the read-only token (with KV_REST_API_URL) is needed to build. So:
# 1. the build gets a copy of the pulled file without those three (the pulled file is kept in a
#    private work folder), and runs with all three unset;
# 2. scripts/build-env-canary.cjs is preloaded into every Node process of the build and records,
#    as booleans, whether each one had any write credential and whether it had the read-only token;
# 3. the pulled file is put back byte for byte (also when the build fails); the deployment's own
#    runtime environment comes from the Vercel project and keeps the write credentials;
# 4. the check fails unless no process had a write credential, the Next build ran, and it had the
#    read-only token exactly when it was pulled.
# Without --yes, `vercel build` never pulls the environment again; if anything rewrites the file
# during the build, step 3 fails. VERCEL_TOKEN, when set, is passed to the CLI as --token. Nothing
# here prints a value.
set -euo pipefail

target="${1:-}"
case "$target" in
  production) target_flag=--prod ;;
  preview) target_flag=--target=preview ;;
  *)
    echo "usage: bash scripts/vercel-build-isolated.sh production|preview" >&2
    exit 2
    ;;
esac

case "$PWD" in
  *[[:space:]]*)
    echo "vercel-build-isolated: the checkout path contains whitespace, which NODE_OPTIONS cannot carry" >&2
    exit 1
    ;;
esac

env_file=".vercel/.env.${target}.local"
work="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/build-env.XXXXXX")"
chmod 700 "$work"

isolation() {
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/build-env-isolation.ts "$@"
}

isolation sanitize "$env_file" "$work"
# If the build fails, the pulled file is still put back (the failure is what the step reports).
trap 'isolation restore "$env_file" "$work" > /dev/null || true' EXIT

token_args=()
if [ -n "${VERCEL_TOKEN:-}" ]; then token_args=(--token="$VERCEL_TOKEN"); fi

env -u KV_REST_API_TOKEN -u KV_URL -u REDIS_URL \
  BUILD_ENV_CANARY_OUT="$work/canary.jsonl" \
  NODE_OPTIONS="--require=$PWD/scripts/build-env-canary.cjs${NODE_OPTIONS:+ $NODE_OPTIONS}" \
  npx --no-install vercel build "$target_flag" ${token_args[@]+"${token_args[@]}"}

isolation restore "$env_file" "$work"
trap - EXIT
isolation verify "$env_file" "$work"
