# Running the live experiment: the owner's runbook

This page is for me, the site's owner. It lists, step by step, what I do by hand around the live
experiment: the secrets, the firewall rule, the domains, leaving my own browsers out of the counts,
the launch check, and what to do if the A/A calibration fails. Nothing here contains a secret
value, and no value should ever be pasted into a chat, an issue, a commit or a log.

Two placeholders stand for values of my own setup: `<repo checkout>` is the folder that holds my
clone of this repository, and `<team>` is the slug of the Vercel team that owns the project.
Where a step says "Terminal", it means a terminal in `<repo checkout>` (`cd <repo checkout>`).
Where it says "Vercel", it means the dashboard at <https://vercel.com/dashboard>, team `<team>`,
project `portfolio`.

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
openssl rand -hex 32 | npx vercel env add RATELIMIT_HMAC_KEY production --scope <team>
```

### `INTERNAL_TRAFFIC_SECRET` (the same value in Vercel and GitHub)

In Terminal, one line at a time. The value goes into a temporary file, from there into both places,
and the file is then deleted:

```sh
umask 077
its=$(mktemp)
openssl rand -hex 32 > "$its"
npx vercel env add INTERNAL_TRAFFIC_SECRET production --scope <team> < "$its"
gh secret set INTERNAL_TRAFFIC_SECRET --repo MaHmOuDeB/portfolio < "$its"
rm "$its"
```

`umask 077` and `mktemp` make the file readable by my user only.

### `EXCLUDE_TOKEN` (I keep this one)

```sh
umask 077
ex=$(mktemp)
openssl rand -hex 32 > "$ex"
npx vercel env add EXCLUDE_TOKEN production --scope <team> < "$ex"
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
npx --no-install vercel env ls production --project portfolio --scope <team>
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

It reads the Vercel team from `VERCEL_SCOPE` (for example `VERCEL_SCOPE=<team> npm run launch:check
-- ...`), or else from `.vercel/project.json`, which `npx vercel link` writes; without either it
reports the team as unknown.

It prints one `unmet:` line for each launch condition that is not met yet, and ends with "all
launch conditions met" once none is left. It checks:

- the calibration start date is set (`calibration.startedOn` in `src/experiment.values.ts`, set in
  the launch commit);
- every provider fact the privacy page states is confirmed, and no page shows a "Not confirmed yet"
  note;
- the deployed checks `split`, `isr`, `headers`, `firewall` and `domains` are recorded as `PASS`,
  and the `headers` row was run against the canonical domain;
- the secrets of step 1 exist (it reads their names only);
- the GitHub repository variables `LAUNCHED` and `LAUNCH_SHA` exist (it reads their names only).
  They exist only after the launch step, where I set `LAUNCH_SHA` first and then `LAUNCHED`. Before
  that, `unmet` lines for them are expected and are never a reason to set either one;
- the `prereg-v1` tag exists, is pushed to GitHub, and matches the current design.

It is not part of the everyday checks or CI: before launch it is supposed to fail.

CI runs every job on GitHub's hosted runner (`runs-on: ubuntu-24.04`). The check still prints an
`unmet` line for each workflow that names a self-hosted runner (the `self-hosted` or `portfolio-mac`
labels), and one while GitHub lists any runner for the repository (or cannot be asked): before the
repository is made public, both of my former runners must be deregistered and removed, because a
self-hosted runner must never run a public repository's pull requests.

The privacy page currently waits for one fact: whether the counter database keeps backups. To
confirm it, open <https://console.upstash.com>, select the database, open **Backups**, and check
whether **Daily Backup** is on and for how long backups are kept. Keep it off unless there is a
reason; then ask Claude to write what you saw into the privacy page.

Optional read-only check of the production store (it prints only two status lines):

```sh
npx vercel env pull .env.production.local --environment=production --scope <team> && node --env-file=.env.production.local --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/experiment-check.ts --storage; rm .env.production.local
```

Expected before launch: `redis: ok (0 fields in exp:aa-v1)` and
`edge config: ok (item experiment: missing)`. The last part deletes the pulled file again; make
sure it is gone.

### The one commit production may deploy: `LAUNCH_SHA`

Once `LAUNCHED` is `true`, the deploy workflow deploys production only for the commit named in the
GitHub repository variable `LAUNCH_SHA`, written as the full 40-character commit SHA in lower case.
Any other commit, an empty `LAUNCH_SHA` or a shortened one makes the deploy fail at its first step,
before anything is built, so a CI run that was queued before launch, or a re-run of an older one,
never reaches production. Only I set these two variables, and only in the launch step: first
`LAUNCH_SHA` to the launch merge commit, then `LAUNCHED`, in the same sitting:

```sh
gh variable set LAUNCH_SHA --repo MaHmOuDeB/portfolio --body "<full merge commit SHA>"
gh variable set LAUNCHED --repo MaHmOuDeB/portfolio --body true
```

After launch, every merge I approve deploys only if `LAUNCH_SHA` names it. A squash merge's commit
exists only once it is merged, so right after each merge, before that commit's CI run on `main`
finishes, I set `LAUNCH_SHA` to the new commit's full SHA. If I am too late, its Deploy fails at
"Guard production SHA" by design and deploys nothing; then I set `LAUNCH_SHA` and re-run that
commit's CI run, which starts a fresh Deploy. Vercel's Instant Rollback and "Promote" do not go
through this workflow, so the guard does not cover them (see step 11).

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
   date and time with its offset, for example `2026-12-07T00:00:00+01:00`). The new start is the
   day this commit is deployed, never a later day, and the same holds for `ab.startedOn` in the
   switch to the A/B: before its start date the site says the experiment has not started, which is
   false once a run has begun.
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


### If the closure cannot be reproduced

A snapshot log with category `closure-mismatch` and `closureMismatch: true` in
`/experiment/data.json` mean the stored stop day or reason could not be corroborated.
The recorded stop still controls counting. A conflicting A/B result is withheld while
the discrepancy is investigated. Keep the original closed marker and calibration
failure flag. Review the counters and the flag history before using a fresh namespace.
See [Redis conformance](redis-conformance.md) for the staging checks.

## 10. Watch the command quota

The counter database's free tier allows 500,000 commands a month. The experiment is built to stay
under it at the daily limit of 200 counted views: 200 views x 48 commands x 30 days is 288,000,
page reads add up to 55,000, and I allow 156,000 for refused entries beyond the daily limit (650 a
day at 8 commands each: the room left under the quota, not a measured figure). A server that has
already seen that day's limit reached answers a lone entry without touching the database, so the
real cost is lower, but a refused request that also carries later events still pays the full 8.
The total is 499,000, so there is almost no spare room if the assumptions are wrong.

1. Upstash console, the database, **Usage**: look at the command count once a week and after any
   day with unusual traffic.
2. Set a usage alert at 70% of the monthly quota (350,000 commands) if the console offers one for
   this plan. If it does not, note the date I last looked and check again within a week of the
   count passing 250,000.
3. If the count passes 70% before the 20th of a month, look for a flood (the Vercel Firewall
   should have stopped it, step 2) before anything else. When the quota runs out, counting stops
   for the rest of the month in both groups alike and the live test page says it is paused or
   unreadable; nothing is lost silently, but the run's views are fewer.

## 11. Before the first live write: no older writer may run

The experiment's claims use a packed layout (arm, day, expiry and which events were counted, in
one value). A server running the earlier layout writes separate keys, and the two must never write
the same namespace at once. The simplest way to guarantee that is deploy order, and it holds here
without extra code because of how the project is wired:

- Only a production deployment ever writes to the store; a preview never does, even with the
  credentials present (`tests/unit/experiment/access.test.ts`, the preview cases). `main` deploys as
  a preview until `LAUNCHED` is `true` (the deploy workflow), so no deployment of any earlier
  layout has ever been in production.
- So the first production deployment is already the packed layout. Before setting `LAUNCHED=true`,
  check that the deployment about to go live was built from a commit on `main` that contains
  `ATOMIC_LATER_SCRIPT` in `src/lib/experiment/store.ts`.
- After launch, do not roll back or promote a deployment older than that commit (Vercel's Instant
  Rollback and "Promote" both do exactly that). If a rollback to an older layout is ever needed,
  stop counting first (step 9), then use a fresh namespace for the next run (as in step 8) rather
  than let two layouts share one.

## 12. What the home page's HTML holds for the two groups

Each featured case-study card holds both groups' headline strings in the HTML, in one grid cell, so
the card is the same size in both groups at every width, zoom and font. Viewing the page source of
`/` therefore shows both headlines of every card; that is expected and is not a leak. Only the
headline of the reader's group (group A's in the calibration, for everyone) is visible and read out
by screen readers; the other string is `visibility: hidden` and `aria-hidden`, and it holds no link.

To see a group's page as a visitor would, open `/?variant=a` or `/?variant=b`. A forced view is
never counted (the beacon reports it as `forced`). A direct `/v/a` or `/v/b` is the 404 page.

## 13. Check the published results independently

`scripts/verify_experiment.py` recomputes the live test's published results from
`/experiment/data.json` alone. It is a second implementation of the formulas in the
pre-registration, in Python with the standard library only: it imports nothing from the site, needs
no package and makes no network request. Anyone can run it; run it after each phase change and
before writing about a result.

In Terminal, from the root of a copy of the repository (Python 3.9 or later):

```sh
curl -sSf https://<canonical domain>/experiment/data.json -o data.json
python3 scripts/verify_experiment.py data.json --reference stats-ref/reference.json
```

On a saved copy of published data, without the network:

```sh
python3 scripts/verify_experiment.py tests/fixtures/experiment-verifier/open.json --reference stats-ref/reference.json
```

`--reference` first reproduces the frozen reference values the statistics are tested against
(`stats-ref/reference.json`, made with scipy and statsmodels): the mixing ratio, the mixture
intervals, the split check and the detectable effect, each within 1e-8. `--json` prints the report
as JSON instead of one line per check.

What it recomputes: the mixing variances from the planning rates and caps; the split check at the
look it rests on, and which split failed; both intervals, intersected over the cumulative daily
looks in order (each look is a running total, never a day's own count); the decision walk, or the
A/A rule in the calibration; blinding; the intention-to-treat rates; the detectable effect; and
whether the final CV and contact counts should be there. It also checks the
publishing rules: no count from 1 to 4 printed as itself, no outcome while blinded or below 50
analysed views a group, no p-value, no look on a day that reached the daily ceiling.

Each check prints PASS, FAIL, INDETERMINATE or NOT-APPLICABLE with its reason. The exit status is
0 when nothing disagrees (some checks may still be indeterminate), 1 when a recomputed value
differs from the published one by more than 1e-8 or a publishing rule is broken, and 2 when the file
cannot be read or is not valid `experiment-data/1` (not UTF-8 text, any NaN or infinite number, a
minimum per group below 5) or the script itself fails ("internal error", which says nothing about
the data). Exit 1 always means a check disagrees. Text from the file is printed as plain ASCII,
with every other character escaped.

Its limits, stated in each check's reason:

- A count from 1 to 4 is published as "<5". Where a check depends on one, the script tries every
  value the cell may hold (1 to 4, never below an earlier look's running total). The check passes
  only when every allowed value gives the published result, fails when none does, and is otherwise
  indeterminate. It never prints those values and never uses a published interval to narrow them,
  so it cannot recover a hidden count, and neither can its output. The published file itself can
  narrow one, and its notes say so: the interval can, and so can the split check's status, which is
  published even when a count it rests on is shown as "<5".
- While the test is blinded no outcome is published, so no interval can be recomputed.
- A look the analysis stopped at for a data fault, and every look after a decision, is not
  published: a held analysis or a split flag after the decision is reported, not recomputed.
- A stop recorded only as a stored closure (the A/A shown as failed on a day the published looks do
  not explain) is reported as indeterminate, not recomputed; so is any state whose stored closure
  the current analysis did not confirm (`closureMismatch`).
- Leaving out a day that reached the daily ceiling changes the analysed totals by amounts that are
  not published, so blinding and the detectable effect at the current size are then indeterminate.
- It does not recompute the design hash (`prereg.configSha256`): compare it with the hash at the
  end of `docs/experiment/prereg.md` at the tag the file names.
- Some published fields cannot be recomputed from the file: the calibration's `days` and
  `evaluatedOn` (they need the calibration's start day, which is not published) and the final CV
  and contact counts (they are in no look; only whether they should be there is checked). The
  detectable-effect points are checked one by one, so a missing point is not noticed.
- The one-minute margin after the planned end, before a test is read as inconclusive, is the
  site's own constant and is not in the file; the script uses the same minute.

The saved fixtures in `tests/fixtures/experiment-verifier/` are real published data, built by the
site's own code from known counts; `tests/unit/live-page/verifier.test.ts` runs the script on them
and on altered copies.
