// The Live test page's words, English. Each sentence that holds a number, a date or a link is a function
// that returns its children with `seq`, so the markup is the same as when the page wrote them inline;
// the German twin is content/de/live.ts, typed by the same `LiveCopy` (a missing key fails the
// typecheck). Numbers are never typed here: they arrive as arguments, each carrying its refs.
import type { ReactNode } from 'react';
import { seq } from '@/components/kit/text';
import { STOP_REASONS_EN, type StopReasons } from '@/lib/experiment/reasons';

export type StepId = 'calibration' | 'ab' | 'decision';
export type Outcome = 'ship-b' | 'stop-for-harm' | 'inconclusive';
export type BaseKind = 'entry' | 'analysed' | 'both';
export type RejectKey = 'bot' | 'internal' | 'self' | 'forced' | 'not_entry' | 'rate_limited' | 'ceiling';
export type Check = 'passed' | 'failed' | 'not-evaluated';
export type ModeKey =
  | 'not-started'
  | 'closure-check'
  | 'unavailable'
  | 'settings-unreadable'
  | 'held'
  | 'srm-suppressed'
  | 'aa-failed'
  | 'paused'
  | 'calibrating'
  | 'ab-running'
  | 'counting-closed'
  | 'result-being-confirmed';

export type LiveCopy = {
  head: { chip: string; title: string; quiet: string; intro: string };
  sections: {
    results: string;
    resultsDecided: string;
    plan: string;
    health: string;
    funnel: string;
    checkItYourself: string;
  };
  nav: { plan: string };
  keyPoints: {
    tested: { title: string; body: string; calibrationExtra: string };
    standing: {
      title: string;
      inconclusive: string;
      decided: string;
      notRunning: string;
      calibration: string;
      running: string;
      body: (p: { status: ReactNode; standing: ReactNode }) => ReactNode;
    };
    expect: {
      title: string;
      titleDecided: string;
      body: (p: { cap: ReactNode; lift: ReactNode; eight: ReactNode; ten: ReactNode }) => ReactNode;
    };
    why: { title: string; body: string };
  };
  result: {
    range: string;
    hollow: (range: string) => string;
    calibrationBar: (range: string) => string;
    bar: (range: string, open: boolean) => string;
    collecting: (target: ReactNode) => ReactNode;
  };
  plan: {
    meaning: string;
    fixes: string;
    planning: (p: { cap: ReactNode; eight: ReactNode; ten: ReactNode; lift: ReactNode; small: ReactNode; one: ReactNode; twenty: ReactNode }) => ReactNode;
    guardrail: (p: { secs: ReactNode; margin: ReactNode; low: ReactNode; high: ReactNode }) => ReactNode;
    views: string;
    short: (p: { version: ReactNode; hash: ReactNode }) => ReactNode;
    readLink: string;
    recordSummary: string;
    record: (p: { version: ReactNode; tag: ReactNode; hash: ReactNode }) => ReactNode;
    build: (p: { commit: ReactNode }) => ReactNode;
  };
  health: {
    splitTitle: string;
    detectableTitle: string;
    split: {
      lead: (p: { one: ReactNode; three: ReactNode }) => ReactNode;
      noData: string;
      heldFailed: string;
      heldNotReported: string;
      entry: (status: ReactNode) => ReactNode;
      analysed: (status: ReactNode) => ReactNode;
      checks: Record<Check, string>;
      later: string;
    };
    detectableLead: (p: { eight: ReactNode; ten: ReactNode }) => ReactNode;
    detectableTakeaway: string;
    detectableSummary: string;
  };
  funnel: { lead: string; reasonsSummary: string };
  decision: {
    none: { ahead: string; shown: string };
    decided: (p: { word: ReactNode; when: ReactNode | null }) => ReactNode;
    end: (p: { earliest: boolean; when: ReactNode }) => ReactNode;
  };
  check: {
    download: string;
    data: (p: { one: ReactNode; four: ReactNode; small: ReactNode }) => ReactNode;
    recomputeHost: string;
    recomputeNoHost: string;
    commands: string;
    scriptSummary: string;
    script1: string;
    script2: (small: ReactNode) => ReactNode;
    fixture: string;
    local: string;
    readScript: string;
  };
  close: { lab: string; prereg: string; body: string };
  status: {
    title: string;
    stepsLabel: string;
    steps: Record<StepId, string>;
    done: string;
    stepWord: { now: string; paused: string; stopped: string; closed: string; reached: string };
    decisionWords: Record<Outcome, string>;
    stateWords: Record<ModeKey, string>;
    statusLabel: string;
    progressLabel: string;
    progressBoth: (p: { a: ReactNode; b: ReactNode }) => ReactNode;
    progressBothNote: (target: ReactNode) => ReactNode;
    progressOf: (p: { smaller: ReactNode; target: ReactNode }) => ReactNode;
    progressOfNote: (target: ReactNode) => ReactNode;
    decidedOn: string;
    timeLimit: string;
    plannedEnd: string;
    sooner: string;
    read: (p: { date: ReactNode; time: ReactNode }) => ReactNode;
  };
  state: {
    notStarted: string;
    closureCheck: string;
    unavailableClosed: string;
    unavailableCountingClosed: string;
    unavailable: string;
    settingsUnreadable: string;
    heldCounts: string;
    heldInterval: string;
    held: (p: { reason: string; on: ReactNode; split: ReactNode }) => ReactNode;
    srm: (split: ReactNode) => ReactNode;
    aaFailed: (p: { on: ReactNode; reason: ReactNode; split: ReactNode }) => ReactNode;
    aaStopped: (split: ReactNode) => ReactNode;
    paused: (p: { on: ReactNode; reason: ReactNode }) => ReactNode;
    pausedPlain: string;
    outcome: Record<Outcome, string>;
    laterSplit: string;
    closedNoDecision: string;
    beingConfirmed: string;
    abStarted: (when: ReactNode) => ReactNode;
    abRunning: string;
    calibrating: string;
    calibratingPassed: (day: ReactNode) => ReactNode;
    splitAlso: string;
    splitIt: string;
    /** The sentence's lead with the spaces the markup holds around it. */
    splitLead: (lead: string) => string;
    splitFailure: (p: { lead: string; day: ReactNode; base: string }) => ReactNode;
    base: Record<BaseKind, string>;
    viewsAt: Record<'entry' | 'analysed', (p: { a: ReactNode; b: ReactNode }) => ReactNode>;
  };
  next: {
    closed: string;
    confirming: string;
    restart: string;
    abStart: string;
  };
  /** The stop and pause reasons the page and the data file state, by key (see src/lib/experiment/reasons.ts). */
  reasons: StopReasons;
  funnelFigure: {
    notPublished: string;
    noData: string;
    stages: { beacons: string; bot: string; entry: string; inview: string };
    columns: { stage: string; a: string; b: string };
    note: string;
    pair: (p: { a: ReactNode; b: ReactNode }) => ReactNode;
    title: string;
    caption: string;
    method: string;
    noCounts: string;
    reasons: Record<RejectKey, [string, string]>;
    exclusionsCaption: string;
    exclusionsColumns: [string, string, string];
    preview: (zero: ReactNode) => ReactNode;
    footnote: string;
  };
  detectable: {
    method: string;
    caption: (p: { power: ReactNode; ten: ReactNode; rate: ReactNode; ab: boolean }) => ReactNode;
    noData: string;
    atNowCount: (p: { count: ReactNode; lift: ReactNode }) => ReactNode;
    atNow: (lift: ReactNode) => ReactNode;
    noViews: string;
    smallCell: (five: ReactNode) => ReactNode;
    beyond: string;
    title: string;
    columns: [string, string];
    note: string;
    aria: (marked: boolean) => string;
    xLabel: string;
    yLabel: string;
  };
  results: {
    caption: string;
    seriesCaption: string;
    seriesColumns: [string, string];
    groups: { a: string; b: string };
    seriesNote: string;
    columns: [string, string, string, string, string];
    note: string;
    closedConfirmed: string;
    beingConfirmed: string;
    paused: string;
    settings: string;
    held: string;
    decision: string;
    reached: (target: ReactNode) => ReactNode;
    progress: (p: { smaller: ReactNode; target: ReactNode }) => ReactNode;
    appear: (target: ReactNode) => ReactNode;
    xLabel: string;
    yLabel: string;
    unavailable: string;
    srm: string;
    aaFailed: string;
    figureTitle: string;
    titles: {
      held: string;
      paused: string;
      settings: string;
      final: string;
      confirming: string;
      latest: string;
      none: string;
      noneShown: string;
    };
    noEstimateCaption: string;
  };
};

export const LIVE_EN: LiveCopy = {
  head: {
    chip: 'Live test',
    title: 'A real A/B test on this site,',
    quiet: 'run in the open.',
    intro:
      'The test is about the three featured cards on the home page. In group A their headlines name the topic; in group B they state the finding. The question is whether the finding headlines get more clicks. I published the plan before any data came in, and this page shows every step, including a result that may well be: not enough data to say.',
  },
  sections: {
    results: 'Result so far',
    resultsDecided: 'Result',
    plan: 'The plan, fixed before the start',
    health: 'Is the test healthy?',
    funnel: 'How views are counted',
    checkItYourself: 'Check it yourself',
  },
  nav: { plan: 'The plan' },
  keyPoints: {
    tested: {
      title: 'What is tested',
      body: 'The three featured cards on the home page. Group A: headlines that name the topic. Group B: headlines that state the finding. Nothing else differs.',
      calibrationExtra: ' The comparison starts after the calibration; during it both groups see group A’s headlines.',
    },
    standing: {
      title: 'Where it stands',
      inconclusive: 'Inconclusive reports the final interval as the range of effects consistent with the data, never as no effect.',
      decided: 'The first decision is final, so later looks change nothing.',
      notRunning: 'The card above has the details.',
      calibration:
        'Calibration is a dry run: both groups see the same headlines, so the counting and the split can be checked before the real comparison starts.',
      running: 'The two groups see different headlines. The counts on this page are current; the interval and the verdict change once a day.',
      body: (p) => seq(p.status, '. ', p.standing),
    },
    expect: {
      title: 'What I expect',
      titleDecided: 'What I expected',
      body: (p) =>
        seq(
          'Probably no clear answer. At the planned ',
          p.cap,
          ' views per group, only a lift of about ',
          p.lift,
          ' percentage points would be found ',
          p.eight,
          ' times in ',
          p.ten,
          ', and I said so before the test started.',
        ),
    },
    why: {
      title: 'Why run it then',
      body: 'Because how a test is planned, checked and reported matters more than whether it wins. The results here can be recomputed from the published data.',
    },
  },
  result: {
    range: 'the range of differences between the groups that the data are compatible with',
    hollow: (range) => `The hollow mark stands in for the bar: ${range}.`,
    calibrationBar: (range) => `The bar is ${range}. In the calibration both groups see the same page, so the bar should include zero.`,
    bar: (range, open) =>
      `The bar is ${range}. Wholly on the side marked B higher, B is ahead; across zero, there is no clear answer${open ? ' yet' : ''}.`,
    collecting: (target) => seq('No estimate is drawn until each group has ', target, ' views. That threshold was fixed before the start.'),
  },
  plan: {
    meaning:
      'Pre-registered means the design, the numbers I plan with and the decision rule were fixed and published before any visitor was counted, so they cannot be changed quietly after seeing results.',
    fixes:
      'The pre-registration fixes the design, the numbers I plan with, the decision rule and what I will do in each outcome. Its hypothesis: “Featured case-study cards that state the finding get more clicks than cards that name the topic.”',
    planning: (p) =>
      seq(
        'I planned the test at ',
        p.cap,
        ' views per group. At that size, the smallest lift it would find ',
        p.eight,
        ' times in',
        ' ',
        p.ten,
        ' is about ',
        p.lift,
        ' percentage points. Even a ',
        p.small,
        '-point lift would be found about ',
        p.one,
        ' time in',
        ' ',
        p.twenty,
        '. Inconclusive is the likely, honest outcome.',
      ),
    guardrail: (p) =>
      seq(
        'There is also a guardrail, a second measure that must not get worse: quick exits. A quick exit is a view whose visitor leaves within ',
        p.secs,
        ' seconds without interacting. To ship B, the data must rule out a rise in quick exits of',
        ' ',
        p.margin,
        ' percentage points or more. To show that, even two identical groups would need about ',
        p.low,
        ' to',
        ' ',
        p.high,
        ' entry views (fresh arrivals on the home page) each. That is a planning figure, not a target.',
      ),
    views: 'The test counts views, not people: one person can count more than once, and in both groups.',
    short: (p) => seq('Pre-registration ', p.version, ', design hash ', p.hash, '.'),
    readLink: 'Read the pre-registration at its tag',
    recordSummary: 'Pre-registration record',
    record: (p) => seq('Pre-registration ', p.version, ', tag ', p.tag, ', design hash ', p.hash, '.'),
    build: (p) => seq('This page was built from commit ', p.commit, '.'),
  },
  health: {
    splitTitle: 'Did both groups get a fair share?',
    detectableTitle: 'How small a difference this test can see',
    split: {
      lead: (p) =>
        seq(
          'The split check asks whether the two groups got the share of views chance would give them (sample ratio mismatch, SRM). If it fails, the split is further from even than chance would plausibly give, so something may have moved views between the groups, and no result is shown. Because it is checked at every completed day, the chance of a false flag over the whole run is about',
          ' ',
          p.one,
          '% to ',
          p.three,
          '%.',
        ),
      noData: 'No split check is shown: this page has no data.',
      heldFailed: 'The split check also failed, as the note at the top of this page says.',
      heldNotReported: 'The split check is not reported after the consistency check failed.',
      entry: (status) => seq('Entry views: ', status),
      analysed: (status) => seq('Analysed views: ', status),
      checks: { passed: 'passed', failed: 'failed', 'not-evaluated': 'not checked yet' },
      later: 'A later split check failed; the recorded decision is unchanged.',
    },
    detectableLead: (p) =>
      seq(
        'How big a difference could this test notice? The line is the smallest lift it would catch ',
        p.eight,
        ' times in',
        ' ',
        p.ten,
        ' at each number of views.',
      ),
    detectableTakeaway: 'Smaller real differences will mostly end as inconclusive, which is not the same as no effect.',
    detectableSummary: 'How the line is computed',
  },
  funnel: {
    lead: 'Not every page load counts. Raw signals from the home page are filtered down to the views the analysis uses.',
    reasonsSummary: 'Why views were not counted',
  },
  decision: {
    none: { ahead: 'No decision yet.', shown: 'No decision is shown.' },
    decided: (p) => seq('Decision: ', p.word, p.when !== null ? seq(', on ', p.when) : null, '.'),
    end: (p) =>
      seq(
        p.earliest ? 'Earliest end' : 'Planned end',
        ': ',
        p.when,
        '.',
        p.earliest
          ? ' During the calibration this is the earliest date the A/B test’s time limit can fall; a decision can end the test sooner.'
          : null,
      ),
  },
  check: {
    download: 'Download the data (data.json)',
    data: (p) =>
      seq(
        'The data are aggregated daily counts, no identifiers. They are not anonymous: someone who knows when a person visited could link a change between two days to that visit. A count from ',
        p.one,
        ' to ',
        p.four,
        ' is shown as “',
        p.small,
        '”, here and in the file.',
      ),
    recomputeHost: 'To recompute the results yourself, run this from a copy of the repository:',
    recomputeNoHost:
      'To recompute the results yourself, save the file from the address of this page followed by /data.json, then run this from a copy of the repository:',
    commands: 'Commands',
    scriptSummary: 'How the script treats small counts',
    script1:
      'The script uses the Python standard library only and imports nothing from this site. It recomputes the split check, both intervals over the daily looks, the decision and the detectable effect, and checks the publishing rules. Each check agrees with the published value to within a hundred-millionth, or the script reports it as failed; a check the published data cannot settle is reported as indeterminate, with its reason.',
    script2: (small) =>
      seq(
        'Where a check depends on a count shown as “',
        small,
        '”, the script tries every value the cell may hold. The check passes when all of them give the published result, fails when none does, and is reported as indeterminate otherwise. It never prints those values. Its own tests run it on saved copies of published data, built by the site’s code from known counts.',
      ),
    fixture: 'This build has no store, so the numbers on this page are a stand-in, not visitors.',
    local: 'This build reads a local test store, so its numbers are simulated, not visitors.',
    readScript: 'Read the script',
  },
  close: {
    lab: 'Try the same checks in the Lab',
    prereg: 'See the pre-registration',
    body: 'Here I publish the plan before the data, show the checks beside the result, say in advance when a test is too small to settle the question, and give you the data to prove me wrong.',
  },
  status: {
    title: 'Where the test stands',
    stepsLabel: 'The steps of the test',
    steps: { calibration: 'Calibration', ab: 'A/B test', decision: 'Decision' },
    done: 'Done',
    stepWord: { now: 'Now', paused: 'Paused', stopped: 'Stopped', closed: 'Closed', reached: 'Reached' },
    decisionWords: { 'ship-b': 'Ship B', 'stop-for-harm': 'Stop for harm', inconclusive: 'Inconclusive at the limit' },
    stateWords: {
      'not-started': 'Not started',
      'closure-check': 'Checking the stored result',
      unavailable: 'Counts not loaded',
      'settings-unreadable': 'Counting is stopped',
      held: 'Stopped for a data fault',
      'srm-suppressed': 'Split check failed',
      'aa-failed': 'Calibration stopped',
      paused: 'Paused',
      calibrating: 'Calibrating',
      'ab-running': 'A/B test running',
      'counting-closed': 'Counting has closed',
      'result-being-confirmed': 'Result being confirmed',
    },
    statusLabel: 'Status',
    progressLabel: 'Progress',
    progressBoth: (p) => seq(p.a, ' and ', p.b),
    progressBothNote: (target) => seq('analysed views in group A and group B. Both groups have reached ', target, ' views.'),
    progressOf: (p) => seq(p.smaller, ' of ', p.target),
    progressOfNote: (target) => seq('views in the smaller group. Estimates appear at ', target, ' views per group.'),
    decidedOn: 'Decided on',
    timeLimit: 'Time limit',
    plannedEnd: 'Planned end',
    sooner: 'A decision can end the test sooner.',
    read: (p) =>
      seq(
        'These numbers were read on ',
        p.date,
        ' at',
        ' ',
        p.time,
        '. The page reads the data again at most every five minutes, when someone opens it. If a read fails, it keeps showing the numbers it last read, with this time.',
      ),
  },
  state: {
    notStarted: 'The experiment has not started. Nothing is counted yet.',
    closureCheck: 'Counting has stopped for this run. I am checking the stored result before showing it.',
    unavailableClosed: 'The live counts could not be loaded, and counting has closed.',
    unavailableCountingClosed: 'The live counts could not be loaded.',
    unavailable: 'The live counts could not be loaded. They will appear at the next update.',
    settingsUnreadable: 'Counting is stopped because the experiment settings could not be read.',
    heldCounts: 'The test stopped because the counts failed a consistency check.',
    heldInterval: 'The test stopped because the interval failed a consistency check.',
    held: (p) =>
      seq(p.reason, ' Results use only the data up to the last check that passed. The check failed on ', p.on, '.', p.split),
    srm: (split) => seq('The split check failed, so no result is shown.', split),
    aaFailed: (p) => seq('Calibration stopped on ', p.on, ': ', p.reason, '.', p.split),
    aaStopped: (split) => seq('Calibration stopped.', split),
    paused: (p) => seq('Paused on ', p.on, ': ', p.reason, '.'),
    pausedPlain: 'The experiment on this site is paused.',
    outcome: {
      'ship-b': 'Ship B.',
      'stop-for-harm': 'Stop for harm.',
      inconclusive: 'Inconclusive at the limit; this is not evidence of no effect.',
    },
    laterSplit: ' A later split check failed; the recorded decision is unchanged.',
    closedNoDecision: 'Counting has closed; no decision is recorded in this snapshot.',
    beingConfirmed: 'The result is being confirmed.',
    abStarted: (when) => seq('A/B started ', when, '.'),
    abRunning: 'The A/B test is running.',
    calibrating: 'Calibrating: both groups see the same page.',
    calibratingPassed: (day) => seq('Calibrating: both groups see the same page. The calibration passed its checks on ', day, '.'),
    splitAlso: 'The split check also failed on',
    splitIt: 'It failed on',
    splitLead: (lead) => ` ${lead} `,
    splitFailure: (p) => seq(p.lead, p.day, ', on ', p.base, '.'),
    base: { entry: 'entry views', analysed: 'analysed views', both: 'entry and analysed views' },
    viewsAt: {
      entry: (p) => seq(' Entry views at that check: ', p.a, ' in group A and ', p.b, ' in group B.'),
      analysed: (p) => seq(' Analysed views at that check: ', p.a, ' in group A and ', p.b, ' in group B.'),
    },
  },
  next: {
    closed: 'Counting has stopped; later looks change nothing.',
    confirming:
      'The test has reached its decision; the result is being confirmed. The first decision is final, so later looks change nothing.',
    restart: 'The calibration restarts on {date}.',
    abStart: 'The A/B test starts on {date}.',
  },
  reasons: STOP_REASONS_EN,
  funnelFigure: {
    notPublished: 'Not published',
    noData: 'No data',
    stages: { beacons: 'Beacons received', bot: 'After the bot filter', entry: 'Counted entry views', inview: 'Cards in view (analysed views)' },
    columns: { stage: 'Stage', a: 'Group A', b: 'Group B' },
    note: 'Views per group. A count from one to four is shown as less than five.',
    pair: (p) => seq('group A ', p.a, ', group B ', p.b),
    title: 'Only the last two stages are published',
    caption:
      'Each stage keeps what the one before it let through. The first two totals are not published, because a total could give away a count that is shown only as less than five.',
    method:
      'The beacon on the home page (a small signal the page sends when it loads) sends events, and the server decides which of them count. These are beacons received, not visitors: one person can send many. Nothing comes from bots that never run JavaScript, or from visitors whose browser sends Global Privacy Control or Do Not Track, so they are in no count.',
    noCounts: 'No counts are shown: this page has no data.',
    reasons: {
      bot: ['Known bots', 'A bot user agent, or a browser driven by automation'],
      internal: ['Automated test and Lighthouse runs', 'Requests carrying the site’s own test header'],
      self: ['My own devices', 'Browsers I excluded on the exclusion page'],
      forced: ['Forced demo views', 'A group asked for in the address'],
      not_entry: ['Not an entry view', 'A view that is not a fresh arrival on the home page'],
      rate_limited: ['Over the rate limit', 'Too many requests from one network address in a minute'],
      ceiling: ['After the daily ceiling', 'Entries after the day’s limit was reached'],
    },
    exclusionsCaption: 'Entries turned away, by reason',
    exclusionsColumns: ['Reason', 'Entries', 'What it means'],
    preview: (zero) =>
      seq('Preview deployments: ', zero, '. A preview never writes to the store, so this is always ', zero, '.'),
    footnote:
      'Each row counts entries turned away for one reason, with two exceptions: “Over the rate limit” counts at most one per network address a minute, and “After the daily ceiling” counts one for each day the limit was reached. Once a day is full, entries that would have counted are turned away without being counted under any reason. The rows are not visitors lost and do not add up: one visitor can appear under several reasons, and some visits never reach the server at all.',
  },
  detectable: {
    method: 'It is computed for one look at n under the confidence sequence’s boundary, not the power of the sequential stopping rule.',
    caption: (p) =>
      seq(
        'The smallest lift this many views per group would detect ',
        p.power,
        ' times in ',
        p.ten,
        ', assuming',
        ' ',
        p.ab ? seq('the planning click rate from the calibration, ', p.rate) : seq('the planning click rate of ', p.rate),
        ', at one look.',
      ),
    noData: 'No data is shown, so there is no point for the current size.',
    atNowCount: (p) =>
      seq('At the current size, ', p.count, ' views in the smaller group, the smallest detectable lift is about ', p.lift, ' percentage points.'),
    atNow: (lift) => seq('At the current size the smallest detectable lift is about ', lift, ' percentage points.'),
    noViews: 'No views are counted yet, so there is no point for the current size.',
    smallCell: (five) => seq('While a group has fewer than ', five, ' views, the point for the current size is not shown.'),
    beyond: 'At the current size the detectable lift is beyond the range this calculation covers, so no point is shown.',
    title: 'More views per group, smaller detectable lifts',
    columns: ['Views per group', 'Smallest detectable lift (points)'],
    note: 'Percentage points, for one look at that size.',
    aria: (marked) => `The smallest detectable lift falls as views per group grow${marked ? ', with the current size marked' : ''}`,
    xLabel: 'Views per group',
    yLabel: 'Smallest detectable lift (percentage points)',
  },
  results: {
    caption:
      'B minus A in percentage points of analysed views, under the confidence sequence, which stays valid however often it is looked at. Each look is a completed Berlin day.',
    seriesCaption: 'Analysed views per group so far',
    seriesColumns: ['Group', 'Analysed views'],
    groups: { a: 'A', b: 'B' },
    seriesNote: 'No look is drawn yet: the analysed views per group so far.',
    columns: ['Group A views', 'Group B views', 'Lower end', 'Estimate', 'Upper end'],
    note: 'Analysed views per group, and B minus A in percentage points, one row per look drawn.',
    closedConfirmed: 'Counting has closed with no estimate to show.',
    beingConfirmed: 'The result is being confirmed, so no estimate is shown.',
    paused: 'Counting is paused, so no estimate is shown.',
    settings: 'No estimate is shown while the experiment settings cannot be read.',
    held: 'The test stopped before an estimate could be drawn, so none is shown.',
    decision: 'No interval is shown with this decision.',
    reached: (target) => seq('Both groups have reached ', target, ' views; no estimate is shown yet.'),
    progress: (p) => seq('Progress: ', p.smaller, ' of ', p.target, ' in the smaller group.'),
    appear: (target) => seq('Estimates appear at ', target, ' views per group, as the pre-registration says.'),
    xLabel: 'Views per group',
    yLabel: 'B − A (percentage points)',
    unavailable: 'No results are shown: this page has no data.',
    srm: 'No result is shown while the split check has failed.',
    aaFailed: 'The calibration stopped, so no result is shown.',
    figureTitle: 'The interval of B minus A as views grow',
    titles: {
      held: 'The last interval before the test stopped',
      paused: 'The last interval before the pause',
      settings: 'The last interval before the settings could not be read',
      final: 'The final interval',
      confirming: 'The latest interval, while the result is being confirmed',
      latest: 'The latest interval',
      none: 'No estimate yet',
      noneShown: 'No estimate is shown',
    },
    noEstimateCaption: 'The difference between the groups, B minus A, in percentage points, with the hollow mark in place of an interval.',
  },
};
