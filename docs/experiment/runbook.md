# Running the live experiment: the owner's runbook

This page is for me, the site's owner. It lists, step by step, what I do by hand around the live
experiment: the secrets, the firewall rule, the domains, leaving my own browsers out of the counts,
the launch check, and what to do if the A/A calibration fails. Nothing here contains a secret
value, and no value should ever be pasted into a chat, an issue, a commit or a log.

Where a step says "Terminal", it means the Terminal app on my Mac, in the `portfolio` folder
(`cd ~/code/portfolio`). Where it says "Vercel", it means the dashboard at
<https://vercel.com/dashboard>, team `mahmoud-s-team`, project `portfolio`.

## 1. Create the secrets (once, before launch)

The site needs three secrets of its own. Each is a long random value that I generate and hand
straight to Vercel, so I never have to read or copy it, except the exclusion token, which I keep.

| Name | Where | What it does |
|---|---|---|
| `INTERNAL_TRAFFIC_SECRET` | Vercel (Production) and GitHub | Marks the site's own test and Lighthouse runs, so they are never counted. |
| `EXCLUDE_TOKEN` | Vercel (Production), and my password manager | Unlocks the private link that leaves my own browsers out. At least 32 characters, or the site treats it as unset. |
| `RATELIMIT_HMAC_KEY` | Vercel (Production) | The key that turns a visitor's IP address into a short-lived hash for the rate limit. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Created by Vercel; copied to GitHub | Lets the deployed checks reach a protected preview. |

First make sure both command-line tools are logged in (each opens a browser to confirm):

```sh
npx vercel login
gh auth login
```

### `RATELIMIT_HMAC_KEY`

In Terminal:

```sh
openssl rand -hex 32 | npx vercel env add RATELIMIT_HMAC_KEY production --scope mahmoud-s-team
```

### `INTERNAL_TRAFFIC_SECRET` (the same value in Vercel and GitHub)

In Terminal, one line at a time. The value goes into a temporary file, from there into both places,
and the file is then deleted:

```sh
umask 077
its=$(mktemp)
openssl rand -hex 32 > "$its"
npx vercel env add INTERNAL_TRAFFIC_SECRET production --scope mahmoud-s-team < "$its"
gh secret set INTERNAL_TRAFFIC_SECRET --repo MaHmOuDeB/portfolio < "$its"
rm "$its"
```

`umask 077` and `mktemp` make the file readable by my user only.

### `EXCLUDE_TOKEN` (I keep this one)

```sh
umask 077
ex=$(mktemp)
openssl rand -hex 32 > "$ex"
npx vercel env add EXCLUDE_TOKEN production --scope mahmoud-s-team < "$ex"
open -e "$ex"
```

The last line opens the value in TextEdit. Copy it into my password manager as "portfolio exclude
token", close TextEdit without saving changes, then delete the file:

```sh
rm "$ex"
```

### `VERCEL_AUTOMATION_BYPASS_SECRET`

1. Vercel: project `portfolio`, **Settings**, then **Deployment Protection**.
2. Under **Protection Bypass for Automation**, select **Add Secret** (or **Create**), and save.
   Vercel then adds the secret to every deployment by itself.
3. Copy the secret with the copy button next to it.
4. In Terminal, run the command below, paste the secret when it asks for the value, and press
   Return:

   ```sh
   gh secret set VERCEL_AUTOMATION_BYPASS_SECRET --repo MaHmOuDeB/portfolio
   ```

### Check the names (never the values)

```sh
npx --no-install vercel env ls production --project portfolio --scope mahmoud-s-team
gh secret list --repo MaHmOuDeB/portfolio
```

The first list must show `INTERNAL_TRAFFIC_SECRET`, `EXCLUDE_TOKEN` and `RATELIMIT_HMAC_KEY`, next
to the store's `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN` and the
`GLOBAL_CONFIG` that came with the integrations. The second must show `INTERNAL_TRAFFIC_SECRET` and
`VERCEL_AUTOMATION_BYPASS_SECRET`. These secrets belong to **Production only**: never add them to
Preview or Development.

## 2. The firewall rate-limit rule (launch blocker)

The site limits each address to a number of event messages a minute, but every refused request
still costs a call to the counter database, whose free quota is finite. A Vercel Firewall rule
stops a flood before it reaches the site. The Hobby plan allows one rate-limit rule per project,
so one rule covers both API paths (`/api/e` and `/api/exclude`; they are the only ones).

1. Vercel: project `portfolio`, **Firewall** in the sidebar.
2. **Configure** (top right), then **+ New Rule**.
3. Name: `Rate limit the API`.
4. **If**: `Request Path`, `Starts with`, `/api/`.
5. **Then**: `Rate Limit`. If a pricing dialog appears, read it and select **Continue**. If the
   dialog asks for a payment method or a plan upgrade, stop: that is a purchase, and I decide it
   separately.
6. Strategy: **Fixed Window**. Time Window: `10m` (the longest Hobby allows). Request Limit: `40`.
   Key: **IP**. A real visit to the home page usually sends 3 to 6 requests, so this allows several
   home-page visits in ten minutes from one address, and stops a flood after 40 requests. A
   shorter window would let a flood through at a steadier rate, and each request it lets through
   costs the database.
7. Action: leave **Default (429)**.
8. **Save Rule**, then **Review Changes** (top right), then **Publish**.
9. Record it: add a row to the log in [deployed-checks.md](deployed-checks.md) with today's date,
   the production URL, check `firewall`, result `PASS`, and a note such as "40 per 10 min per IP on
   /api/".

Turning on the Firewall's challenge mode or Vercel BotID would set cookies on visitors' browsers.
The privacy page says the site sets none, so either one means updating the privacy page first.

## 3. Domains: one canonical address

Only the canonical domain counts views. A visit through another address of the same project would
start a fresh view there, so every other domain must redirect to the canonical one.

1. Vercel: project `portfolio`, **Settings**, then **Domains**.
2. For each domain that is not the canonical one, select **Edit**, choose **Redirect to Another
   Domain**, pick the canonical domain, keep `308 Permanent Redirect`, and **Save**. If Vercel does
   not offer a redirect for the `*.vercel.app` address, leave it: the site itself sends the home
   page there to the canonical domain.
3. Record it in the log of [deployed-checks.md](deployed-checks.md) with check `domains` and
   result `PASS`.

**Standing rule: never put a proxying CDN (such as Cloudflare with the orange cloud on) in front of
the Vercel domain.** A shared cache in front of Vercel could store one group's home page and serve
it to everyone behind it. DNS only is fine.

## 4. The Vercel Toolbar on previews

The site's Content Security Policy allows scripts from this site only, so the Vercel Toolbar
(which loads from `vercel.live`) cannot run on preview deployments, and the browser console shows a
policy error there. That is expected. To avoid the noise, turn the toolbar off: Vercel, project
`portfolio`, **Settings**, **General**, **Vercel Toolbar**, set Preview to **Off**, and **Save**.
Do not loosen the policy for it.

## 5. Leave my own browsers out of the counts

Do this on each of my own browsers (laptop, phone), after launch, on the canonical domain:

1. Open my password manager and copy the exclude token.
2. In the browser, open `https://<canonical domain>/exclude#t=` followed by the token (no spaces).
   It must be `https`, or the browser refuses the cookie.
3. The page says "This browser is now left out of the counts." The page removes the token from the
   address bar straight away.
4. Delete that address from the browser's history (it may still be there), and never share it.

The cookie lasts a year and is sent only to the event endpoint. Clearing the browser's cookies
removes it: repeat the steps then. "Count this browser again" on the same page removes it on
purpose.

## 6. Check before launch: `npm run launch:check`

In Terminal:

```sh
npm run build
npm run launch:check -- --canonical <canonical domain>
```

It prints one `unmet:` line for each launch condition that is not met yet, and ends with "all
launch conditions met" once none is left. It checks:

- the calibration start date is set (`calibration.startedOn` in `src/experiment.values.ts`, set in
  the launch commit);
- every provider fact the privacy page states is confirmed, and no page shows a "Not confirmed yet"
  note;
- the deployed checks `split`, `isr`, `headers`, `firewall` and `domains` are recorded as `PASS`,
  and the `headers` row was run against the canonical domain;
- the secrets of step 1 exist (it reads their names only);
- the `prereg-v1` tag exists, is pushed to GitHub, and matches the current design.

It is not part of the everyday checks or CI: before launch it is supposed to fail.

The privacy page currently waits for one fact: whether the counter database keeps backups. To
confirm it, open <https://console.upstash.com>, select the database, open **Backups**, and check
whether **Daily Backup** is on and for how long backups are kept. Keep it off unless there is a
reason; then ask Claude to write what you saw into the privacy page.

Optional read-only check of the production store (it prints only two status lines):

```sh
npx vercel env pull .env.production.local --environment=production --scope mahmoud-s-team && node --env-file=.env.production.local --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/experiment-check.ts --storage; rm .env.production.local
```

Expected before launch: `redis: ok (0 fields in exp:aa-v1)` and
`edge config: ok (item experiment: missing)`. The last part deletes the pulled file again; make
sure it is gone.

## 7. Tag the pre-registration (`prereg-v1`)

After the branch is merged, on the merge commit, before any data is collected:

```sh
git checkout main && git pull
npm run prereg:hash
git tag -s prereg-v1 -m "Pre-registration v1 (A/A calibration), committed before data collection, hash <the hash printed above>" <merge commit>
git push origin prereg-v1
git show prereg-v1:docs/experiment/prereg.md | tail -n 3
```

Use `git tag -a` instead of `git tag -s` if there is no signing key. The last command must show the
same hash as `npm run prereg:hash`.

## 8. If the A/A calibration fails: restart as `aa-v1.1`

A failed calibration stops counting and shows why on the site. To restart after the fault is fixed:

1. In `src/experiment.values.ts`, set `namespace` to `'aa-v1.1'`, the pre-registration version to
   `'v1.1'` and its tag to `'prereg-v1.1'`, and set `calibration.startedOn` to the new start (a
   date and time with its offset, for example `2026-12-07T00:00:00+01:00`).
2. Run `npm run prereg:hash`, write the new hash at the end of `docs/experiment/prereg.md`, and add
   a short note there on what failed and what changed.
3. Commit, merge, tag `prereg-v1.1` on the merge commit (as in step 7) and let it deploy.
4. Only after that deployment is live: Vercel, **Storage**, the Edge Config store, **Items**, open
   the `experiment` item and remove its `aaFailed` entry (or the whole item if nothing else is in
   it), and **Save**. The fresh namespace starts empty, so the old counts never enter the new run.

## 9. Pausing

To pause counting, set the `experiment` item in Edge Config to
`{"paused": {"on": "<now, with offset>", "reason": "<a short reason>"}}`. The reason is shown on the
site: it must never name a person. Counting stops within a minute; pages show it within about ten
minutes. Remove the `paused` entry to resume.
