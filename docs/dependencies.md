# Dependency overrides

`package.json` has an `overrides` block nested under `vercel` (the Vercel CLI, a dev dependency
pinned at 62.2.0). It moves vulnerable transitive packages of the CLI to a patched version **within
the same major** and only inside the CLI's own tree. Each key is `name@major`, so a different major
is never forced. On Linux (CI and the deploy job) the CLI runs as JavaScript from `node_modules`,
so these are the copies that run there.

| Override | Closes |
|---|---|
| `tar@7` -> 7.5.23 | GHSA-23hp-3jrh-7fpw (critical) and the other tar advisories up to 7.5.20 |
| `undici@5` -> 5.29.0 | GHSA-c76h-2ccp-4975, GHSA-cxrh-j4jr-qwg3 |
| `zod@4` -> 4.6.7 | GHSA-mrhx-c7xc-m3w5 (the zod 4 copies) |
| `path-to-regexp@6` -> 6.3.0, `@8` -> 8.4.2 | GHSA-9wv6-86v2-598j, GHSA-j3q9-mxjg-w52f, GHSA-27v5-c462-wpq7 |
| `minimatch@10` -> 10.2.6 | GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74 |
| `js-yaml@4` -> 4.3.2 | GHSA-h67p-54hq-rp68, GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj, GHSA-2883-xcg3-v3hh |
| `smol-toml@1` -> 1.9.1 | GHSA-v3rj-xjv7-4jmq, GHSA-7w5x-hrqm-74c2, GHSA-r4xh-jqrq-34v2 |
| `ajv@8` -> 8.20.0 | GHSA-2g4f-4pwh-qvx6 |

Still open, because each fix is a new major: undici 5 (needs 6), zod 3 in four `@vercel/*`
builders (needs 4), `@fastify/busboy` 2 (needs 3), glob 13 (needs 14) and the moderate minimatch
advisory (needs 11).

**On every `vercel` bump:** re-check each key against the new tree and `npm audit`, drop the ones
the new version no longer needs, and update `tests/unit/vercel-overrides.test.ts`, which fails
while the overrides exist and the CLI is not exactly 62.2.0. If the overridden zod ever breaks a
CLI command, drop only the `zod@4` override.
