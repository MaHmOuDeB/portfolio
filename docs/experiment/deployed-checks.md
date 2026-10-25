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
`x-vercel-protection-bypass` header. It never prints the value. Set it in your own shell and never
paste it anywhere else:

```sh
VERCEL_AUTOMATION_BYPASS_SECRET=... npm run experiment:preview-check -- https://<deployment-url>
```

`--only split,isr` runs only the named checks. The default is `split`, `isr` and `headers`. Each
check prints `PASS` or `FAIL` with its counts, and the exit code is non-zero if any check failed.

| Check | What it does | What a FAIL means |
|---|---|---|
| `split` | 200 GETs of `/` with a desktop Chrome user agent. Both groups must appear, the split must pass the sample-ratio check, no response may set a cookie, and no single group may take every `x-vercel-cache: HIT`. It also prints the `Cache-Control` and `Vary` values it saw. | A cache is serving one group's page for `/`, which would bias the experiment. |
| `isr` | A direct `/v/a` must be the 404 page. Then it reads `readAt` from `/experiment/data.json`, waits 310 s and reads it again (twice, with retries). `readAt` must advance. | Regeneration does not run. The likely cause is that the proxy also matches Vercel's revalidation request. The matcher exempts requests that carry `x-prerender-revalidate`; find the header Vercel actually sends (Vercel's ISR documentation), fix the matcher and run the check again. |
| `headers` | `/` must carry the CSP (`connect-src 'self'`, `frame-ancestors 'none'`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and `Strict-Transport-Security`. It prints the region part of `x-vercel-id`. | A header is missing on the platform. Run it against the custom domain as well, because HSTS has to be on the canonical host. |

### Production checks

These two need the production store, so they only work in production after the calibration has
started. Before the start the event route refuses at once, and the check fails with that reason.
Each request is an event batch that can never count (a later event of a view with no entry), so the
checks change no count.

| Check | What it does | What a FAIL means |
|---|---|---|
| `spoof` | It sends 31 batches from one machine within one minute, with a different fake `x-real-ip` and `x-forwarded-for` on each. The 31st must be refused with 429. | The rate limit trusts a header that the client controls. The route reads the first `x-forwarded-for` entry, which Vercel documents it overwrites. Find the header that carries the real client address on Vercel and use it. |
| `pause` | First set the pause flag in Edge Config. The check then posts every 5 s and must see the route answer `paused` within 60 s (the route caches the flags for 45 s). Clear the flag afterwards. | The route does not read the flag, or caches it for too long. |

## Checks without a script

Record each result, and the date, in the log below.

- **Where the proxy runs.** Look at the function region in the deployment's details and at the
  region in `x-vercel-id` (printed by `headers`). The privacy notes depend on it.
- **`after()` during ISR regeneration.** The closing check runs through `after()` when a page or
  `data.json` regenerates. Two things show that it works:
  - the runtime logs have no `"evt":"snapshot","outcome":"error"` lines;
  - once a decision is due, the first regeneration after 00:31 Berlin time writes an
    `"evt":"close"` line.
- **`VERCEL=1` with `VERCEL_ENV` set.** A deployment where `VERCEL_ENV` is missing logs
  `"reason":"misconfigured"` and keeps its last good page. Check that no such line appears.
- **HSTS on the custom domain.** Run `--only headers` against the canonical URL.

## Log

| Date | Deployment | Check | Result | Notes |
|---|---|---|---|---|
| | | | | |
