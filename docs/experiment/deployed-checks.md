# Deployed checks for the live experiment

Status: **unverified**. None of these checks has run against a real deployment yet. Until each one
has passed on Vercel, what it checks is an assumption, and the experiment does not launch.

The unit and browser tests run the site under `next start` with a local fake of the store. Some
behaviour exists only on the platform, so it can only be checked on a deployment:

- the CDN cache in front of the static group pages;
- whether Vercel's revalidation requests pass through the proxy;
- the client address the platform hands to the event route;
- the headers Vercel adds (HSTS);
- where the proxy runs.

## Running the script

The script reads the deployment protection bypass from the environment and sends it as the
`x-vercel-protection-bypass` header, only over `https` (or to this machine). It never prints the
value. Set it in your own shell and never
paste it anywhere else:

```sh
VERCEL_AUTOMATION_BYPASS_SECRET=... npm run experiment:preview-check -- https://<deployment-url>
```

No request follows a redirect, so the secret only ever goes to the deployment: a redirect fails
the check and names the status. Run it again against the URL it points to.

`--only split,isr` runs only the named checks. The default is `split`, `isr` and `headers`. Each
check prints `PASS` or `FAIL` with its counts, and the exit code is non-zero if any check failed.

| Check | What it does | What a FAIL means |
|---|---|---|
| `split` | 200 GETs of `/` with a desktop Chrome user agent. Both groups must appear, the split must pass the sample-ratio check, no response may set a cookie, no response may carry a `Cache-Control` that a shared cache may store (not `private`, `no-store` or `no-cache`, and any of `s-maxage`, a `max-age` above 0, or `public` without `max-age`; Vercel sends `public, max-age=0, must-revalidate`), and no single group may take every `x-vercel-cache: HIT`. It also prints the `Cache-Control` and `Vary` values it saw. | A cache is serving, or may serve, one group's page for `/` to everyone behind it, which would bias the experiment. |
| `isr` | A direct `/v/a` must be the 404 page. Before the wait it GETs `/` until both groups have appeared once. After a 310 s wait it GETs `/` until each group has been seen at least twice: every response must be a 200, and each group must serve a copy whose `age` is under 300 s and whose `x-vercel-cache` is `HIT` or `REVALIDATED` (a copy of the cached page made after the wait; a `MISS` or `PRERENDER` copy does not count). Then `readAt` in `/experiment/data.json` must have advanced too. | If a group never serves a young copy, or `/` turns into a 404, that group's page did not regenerate. The likely cause is that the proxy also matches Vercel's revalidation request for `/v/a` or `/v/b`. The matcher exempts requests that carry `x-prerender-revalidate`; find the header Vercel actually sends (Vercel's ISR documentation), fix the matcher and run the check again. If only `data.json` fails, regeneration itself is broken, not the proxy. |
| `headers` | `/` must carry the CSP (`connect-src 'self'`, `frame-ancestors 'none'`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and `Strict-Transport-Security`. It prints the region part of `x-vercel-id`. | A header is missing on the platform. Run it against the canonical domain as well, because HSTS has to be on the canonical host: after the first production deployment, once the probes in the runbook's "After the first production deployment" hold (the canonical domain answers `200` without a login). |

### Production checks

These two need the production store, so they only work in production after the calibration has
started. Before the start the event route refuses at once, and the check fails with that reason.
Each request is an event batch that can never count (a later event of a view with no entry), so the
checks change no count.

| Check | What it does | What a FAIL means |
|---|---|---|
| `spoof` | It sends 31 batches from one machine within one minute, with a different fake `x-real-ip` and `x-forwarded-for` on each. The 31st must be refused with 429. | The rate limit trusts a header that the client controls. The route reads the first `x-forwarded-for` entry, which Vercel documents it overwrites. Find the header that carries the real client address on Vercel and use it. |
| `pause` | First set the pause flag in Edge Config. The check then posts every 5 s and must see the route answer `paused` within 60 s (the route caches the flags for 45 s). Clear the flag afterwards. | The route does not read the flag, or caches it for too long. |

## Standing rule

Never put a proxying CDN (or any other shared cache) in front of the Vercel domain. The proxy draws
the group before Vercel's own cache, but a cache in front of Vercel would store one group's `/` and
serve it to everyone behind it. The `split` check fails on a shareable `Cache-Control`, but it cannot
see a cache that ignores the header.

## Checks without a script

Record each result, and the date, in the log below.

- **What a direct `/v/*` request gets.** A plain request gets the 404 page. A request that carries
  an `x-prerender-revalidate` header skips the proxy (so that Vercel's revalidation works) and gets
  the group page itself. It cannot be counted: the beacon counts only a first load of `/`.
- **Where the proxy runs.** Look at the function region in the deployment's details and at the
  region in `x-vercel-id` (printed by `headers`). The privacy notes depend on it.
- **`after()` during ISR regeneration.** The closing check runs through `after()` when a page or
  `data.json` regenerates. Two things show that it works:
  - the runtime logs have no `"evt":"snapshot","outcome":"error"` lines;
  - once a decision is due, the first regeneration after 00:31 Berlin time writes an
    `"evt":"close"` line.
- **`VERCEL=1` with `VERCEL_ENV` set.** A deployment where `VERCEL_ENV` is missing logs
  `"reason":"misconfigured"` and keeps its last good page. Check that no such line appears.
- **HSTS on the canonical domain.** Run `--only headers` against the canonical URL.

## Checks recorded by hand before launch

Two launch conditions have no script. Record each in the log with the check name below and `PASS`
once it holds (the steps are in [runbook.md](runbook.md)):

- **`firewall`**: a Vercel Firewall rate-limit rule covers both `/api/e` and `/api/exclude`, and
  POSTs to `/contact` (the contact form). The in-code limit cannot bound what rejected requests
  cost the store, so this rule is a launch blocker.
- **`domains`**: the project has exactly one production domain, the canonical domain. Any other
  domain of the project (an old `vercel.app` name included) redirects to it at the domain level,
  keeping the path, so a visit through an alias is never counted as a fresh entry. The generated
  URLs (each deployment's own URL and the `portfolio-<team>.vercel.app` alias) cannot be redirected;
  they sit behind Vercel Authentication with Standard Protection. Record it only after the first
  production deployment, once the runbook's probes hold: `curl -sI` on the canonical domain answers
  `200` without a login and is not redirected, the old alias answers `3xx` to the same path on the
  canonical domain, and a deployment URL and `portfolio-<team>.vercel.app` answer `302` to Vercel's
  sign-in.

## Log

`npm run launch:check` reads this table. A row counts when its date is written as `YYYY-MM-DD`
and its result is `PASS`. Before launch it needs a `PASS` row for each of `split`, `isr`,
`headers`, `firewall` and `domains`. A `headers` row counts only when its Deployment cell is the
canonical domain given as `npm run launch:check -- --canonical <domain>` (HSTS must be on that
host).

| Date | Deployment | Check | Result | Notes |
|---|---|---|---|---|
| 2026-11-13 | Vercel project portfolio (active firewall config) | firewall | PASS | Rule "Rate limit the API", active, firewall enabled: path prefix `/api/` (covers `/api/e` and `/api/exclude`), fixed window keyed by IP, 40 requests per 600 s, action rate limit (429). Read with `vercel api /v1/security/firewall/config/active`. |
| 2026-11-13 | Vercel project portfolio (active firewall config) | firewall | PASS | The same rule extended to the contact form: path matches the regex `^/(api/|contact$)` (`/api/e`, `/api/exclude` and `/contact`, any method; not `/contacts` or `/contact/x`), fixed window keyed by IP, 40 requests per 600 s, action rate limit (429), firewall enabled. Re-read with `vercel api /v1/security/firewall/config/active`. |
