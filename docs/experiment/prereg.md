# Pre-registration: card headlines

**Version:** v1 (git tag `prereg-v1`)
**Status:** committed before data collection.

I wrote this before any visitor was counted. It fixes the design, the numbers I plan with, the
decision rule and what I will do in each outcome. The treatment copy and every value below live in
`src/experiment.config.ts` and `content/experiment/headlines.ts`; a hash of both is at the end of
this page, and a test fails if either file changes without this page changing with it.

## Hypothesis

Featured case-study cards that state the finding get more clicks than cards that name the topic.

The only thing that differs between the two groups is the headline of the three featured cards on
the home page. The one-line description, the link, the card size and the page weight are the same,
and the headline area has a fixed height, so the layout above and around the cards cannot differ.

- Group A names the topic.
- Group B states the finding.

## Unit and entry view

The unit is an **entry view** of the home page. I count views, not people.

A view is an entry view when all of these hold, as decided by the page's own beacon:

- it came from a fresh navigation, not a reload or the back and forward buttons;
- it arrived from outside the site;
- it was not restored from the browser's back/forward cache and not prerendered.

All three are known before the group is shown, so filtering on them cannot unbalance the groups.

## Assignment

The server assigns each request to the home page to group A or group B with equal probability. The
group is neither stored nor derived from anything about you: no cookie, no hash, no device storage.
A request that asks for a group in the address (a forced demo view) is shown that group and is
never counted. Known bots are always shown group A and are never counted.

What is stored is separate from assignment and is described on the privacy page: a short-lived
per-view id (at most 30 minutes) and a short-lived hash of the network address used only for rate
limiting (about 2 minutes).

## Exposure

A view is **exposed** when at least half of the cards area has been visible for 1 second, or when
the visitor clicks a featured card. A card click counts as exposure because a click is stronger
evidence of seeing the cards than a timer. Exposure happens after assignment, which is allowed
only because the layout above the cards and the cards' own size are identical in both groups.

## Metrics

| Role | Definition |
|---|---|
| Primary | From an exposed entry view, a click on a featured card. A click to the experiment page itself never counts. |
| Secondary | From that exposed view, a click to a case study or to the Lab. |
| Guardrail | Quick exit: the visitor leaves within 5 seconds without interacting. Denominator: entry views. Margin: +10 percentage points. |
| Descriptive | CV and contact clicks, reported without a decision rule. |
| Descriptive | Intention-to-treat rate: featured-card clicks per entry view, whether or not the cards came into view. |
| Validity | Sample ratio mismatch (SRM) on analysed views after exclusions. |

Engaged means any interaction, or 5 seconds with the page visible. Quick exits are entry views
minus engaged views. Load-speed parity between the groups is measured separately in lab runs, not
by the beacon.

## Inference

- The difference in proportions (B minus A) gets a two-sided **normal-mixture confidence
  sequence** at α = 0.05. It stays valid however often it is looked at.
- Its mixing variance τ² is tuned to be narrowest at the planned sample size:
  - primary: a click rate of 0.15 at 225 views per group;
  - guardrail: a quick-exit rate of 0.5 at 375 entry views per group.
- Both planning rates are placeholders until the calibration measures the real ones. The expected
  detectable effect moves from 13.5 to 17.5 percentage points for click rates of 10% to 30%. Any
  fixed τ² keeps the sequence valid; a poor guess only makes it wider than it could be.
- A variance floor keeps the interval defined when a group has no clicks yet.
- Coverage was validated by simulation at n = 50 to 1,000 views per group. The method is
  conservative in those simulations.
- There are no p-values on the live page.

## Looks

A look is the cumulative count at the end of each completed Berlin day, from 50 per group. A
view's later events count on the day of its entry, so a day's look is read 30 minutes after the
following midnight, once its views' later events can no longer arrive (at the planned end, a
minute after it, because counting stops there). The page's counts are current; its interval and
verdict change once a day. A partial day never decides anything.

## The decision rule

| Outcome | Condition |
|---|---|
| Ship B | The primary interval's lower bound is above 0, **and** the quick-exit interval's upper bound is below +10 percentage points, **and** there is no SRM flag. |
| Stop for harm | The primary interval's upper bound is below 0. |
| Inconclusive | Neither holds by the 6-month cap. |

The **first decision is final**. The first completed-day look at which ship B or stop for harm
holds is the decision. Counting stops at that look and later looks change nothing. An SRM flag
after the decision is reported as a note. If neither holds by the cap, I report the final
interval as the range of effects consistent with the data.

A look is a data fault when either interval (card clicks or quick exits) does not overlap its
running band, or when its cumulative counts break an event's dependency: for example more card
clicks than analysed views, more analysed views than entry views, or more engaged views than entry
views. The analysis then stops at the last clean look before the fault, and nothing from the
fault on is reported; a faulty look that also fails the split check or the A/A keeps that outcome. There is no resume, because resuming after seeing the data would be a choice made after
the fact:

- in the A/A, a data fault fails the calibration, so it also blocks the switch to the A/B, and the
  calibration restarts in namespace `aa-v1.1`;
- in the A/B, the test is reported as stopped for a data fault and is not resumed; at the cap it
  reports the last clean look's interval, or none;
- an SRM flag after the fault still suppresses the verdict.

## The guardrail disclosure

The guardrail is two-sided by design, and it asks for evidence that B does not hurt, not just an
absence of evidence that it does. That has a cost: ship B needs about 390 to 470 entry views per
group even when the two groups are identical, for quick-exit rates of 30% to 50%. I accept that
cost. It means shipping B takes longer than the primary metric alone would suggest, and
inconclusive is the more likely result.

## SRM

The split is checked at each completed day with a chi-square test on analysed views, and on entry
views, against an expected 50/50 split. A flag is p < 0.001. The first flag suppresses the verdict
and pauses the experiment for investigation. Because it is checked repeatedly, the chance of a
false flag over the whole run is about 1% to 3%; I disclose it rather than hide it.

## Phases and switch criteria

1. **A/A calibration.** Both groups see group A. It runs for at least 2 weeks.
2. **Switch to A/B**, evaluated on the first completed day with at least 14 days elapsed and
   at least 100 analysed views, when there is no SRM flag and the A/A interval contains 0.
3. **A/B.** It starts with a redeploy tagged `prereg-final`, in a fresh namespace, so A/A data
   never enters the A/B analysis. It runs to a 6-month cap.

### The A/A failure rule

The A/A fails if there is an SRM flag at any completed-day look, or if the A/A interval excludes
0: either that look's own interval or the running band. An A/A detects instrumentation faults,
not small biases; the synthetic-traffic and end-to-end tests are the main evidence that the
instrumentation works. If the A/A fails, I stop, fix the
cause, tag `prereg-v1.1` with the reason, and restart in namespace `aa-v1.1`.

## Exclusions and the SRM base

Each exclusion is counted in the funnel under its reason:

- bots;
- views that are not entry views;
- automated test and Lighthouse runs;
- preview deployments (structural, always 0);
- my own devices;
- forced demo views.

Visitors whose browser sends Global Privacy Control or Do Not Track are not counted at all. The
page's script sends nothing for them, because counting them would itself be a request. The
signal is known before the group is shown and the script is identical in both groups, so this
does not unbalance them. The SRM check runs on the views that remain after the exclusions.

## The per-view id window

A view's id lives for 30 minutes, never on your device. It lets the server count each event of a
view once and in order. A click counts for its view only inside that window.

## The daily ceiling

At most 200 counted entry views per Berlin day. After that the reason is "ceiling" and nothing
more is counted that day. That is about 50 times the traffic I expect, and low enough that a month at the ceiling, page reads included, uses about 70 percent of the store's free monthly command allowance. Visits turned away after the ceiling cost a few more commands each.

## Expected detectable effect

About 15 percentage points at 225 views per group. Even a 5-point lift would be found about 1
time in 20, so inconclusive is the likely, honest outcome. Inconclusive reports the final
interval as the range of effects consistent with the data, never "no effect".

## Limits

- n counts views, not people; one person can count more than once and in both groups; the
  interval treats views as independent, so it is somewhat too narrow if many people return; the
  method's measured conservativeness is the margin I rely on.
- Headless browsers with a normal user agent are not caught.
- Visitors who send Global Privacy Control or Do Not Track are not in the data, so the result
  describes the rest.

## Threat model and limits

Scripted inflation of the counts cannot be fully prevented without identifiers, and I will not
add identifiers. The defences are:

- a rate limit per network address;
- the daily ceiling;
- detection: daily counts of rejected events and the SRM check;
- a pause switch.

A flood from one source can use up a day's entry ceiling; any Berlin day that reached the ceiling
is flagged and does not feed a look's decision until reviewed. A view's later events, such as a
click after midnight, count on the day of its entry, so leaving a day out leaves out all of its
views' events.

A pause shows on pages within about 10 minutes and stops counting at once.

## Phase switch procedure

At the switch to the A/B I make one commit, tagged `prereg-final`, with these edits to
`src/experiment.config.ts`, computed by frozen formulas from the A/A data:

- `primary.planningBaseline` = the A/A pooled card click rate, clamped to 0.05 to 0.5;
- `capPerArm` = floor(A/A analysed views per day × days in the 6 months / 2);
- `entryCapPerArm` = the same for entry views;
- `TAU2` follows from `optimalTau2` with those values;
- `phase: 'ab'`, `namespace: 'ab-v1'`, and `ab.startedOn` set to the start;
- a new hash in this page.

For `prereg-v1.1` after a failed A/A the edits are: `prereg: { version: 'v1.1', tag:
'prereg-v1.1' }`, `namespace: 'aa-v1.1'`, `calibration.startedOn` set to the restart, any
corrected design value, and a new hash in this page with the reason.

Pre-registration hash: e21dedcac7a27fffb92d9bb1f46d580ff5fe75ea28ea2d012903369493d51c39
