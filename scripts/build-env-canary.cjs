'use strict';
// Preloaded into every Node process of the deploy build (NODE_OPTIONS=--require, set by
// scripts/vercel-build-isolated.sh): the Vercel CLI, npm, `next build` and its workers. When
// BUILD_ENV_CANARY_OUT names a file, it appends one JSON line when the process starts and one when
// it exits (after Next has loaded any env files of its own), saying only whether the store's write
// token and read-only token were in that process's environment, and whether the process is the
// `next build` command. It never records a value or the command line, which can hold a CLI token.
// scripts/build-env-isolation.ts checks the records.
// No require(): the module is loaded through process.getBuiltinModule (Node 22.3 and later).
const { appendFileSync } = process.getBuiltinModule('node:fs');

const out = process.env.BUILD_ENV_CANARY_OUT;
if (out) {
  const entry = (process.argv[1] || '').replace(/\\/g, '/');
  const nextBuild =
    /(?:^|\/)(?:node_modules\/\.bin\/next|next\/dist\/bin\/next)$/.test(entry) && process.argv.slice(2).includes('build');
  const record = (at) => {
    const line = JSON.stringify({
      at,
      nextBuild,
      write: Object.prototype.hasOwnProperty.call(process.env, 'KV_REST_API_TOKEN'),
      read: Object.prototype.hasOwnProperty.call(process.env, 'KV_REST_API_READ_ONLY_TOKEN'),
    });
    appendFileSync(out, `${line}\n`);
  };
  record('start');
  process.on('exit', () => record('exit'));
}
