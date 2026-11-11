'use strict';
// Preloaded into every Node process of the deploy build (NODE_OPTIONS=--require, set by
// scripts/vercel-build-isolated.sh): the Vercel CLI, npm, `next build` and its workers. When
// BUILD_ENV_CANARY_OUT names a file, it appends one JSON line when the process starts and one when
// it exits (after Next has loaded any env files of its own), saying only whether any of the store's
// write credentials (KV_REST_API_TOKEN, KV_URL, REDIS_URL; the same list as WRITE_CREDENTIALS in
// scripts/build-env-isolation.ts) or its read-only token was in that process's environment, and
// whether the process is the `next build` command. It never records a value, a variable name or
// the command line, which can hold a CLI token. scripts/build-env-isolation.ts checks the records.
//
// Security: in the deploy this file runs inside the Vercel CLI process, whose argv and environment
// hold VERCEL_TOKEN. Any change to it is a secret-handling change and needs a security review.
// No require(): the module is loaded through process.getBuiltinModule (Node 22.3 and later).
const { appendFileSync } = process.getBuiltinModule('node:fs');

const WRITE_CREDENTIALS = ['KV_REST_API_TOKEN', 'KV_URL', 'REDIS_URL'];
const out = process.env.BUILD_ENV_CANARY_OUT;
if (out) {
  const entry = (process.argv[1] || '').replace(/\\/g, '/');
  const nextBuild =
    /(?:^|\/)(?:node_modules\/\.bin\/next|next\/dist\/bin\/next)$/.test(entry) && process.argv.slice(2).includes('build');
  const record = (at) => {
    const line = JSON.stringify({
      at,
      nextBuild,
      write: WRITE_CREDENTIALS.some((key) => Object.prototype.hasOwnProperty.call(process.env, key)),
      read: Object.prototype.hasOwnProperty.call(process.env, 'KV_REST_API_READ_ONLY_TOKEN'),
    });
    appendFileSync(out, `${line}\n`);
  };
  record('start');
  process.on('exit', () => record('exit'));
}
