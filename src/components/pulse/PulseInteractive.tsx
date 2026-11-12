'use client';

// The Pulse dashboard's island, loaded by EagerOrIntent (PulseFigureClient imports it lazily). It
// reads and writes its URL state (`?pulse.channel=email&pulse.range=7d`: the view only, never an
// event), keeps one bus per mount and the event stream in its own state, and sends each action's
// event from the action's handler:
// - mount: Viewed Dashboard, once (session.ts keeps a strict-mode remount from sending it twice);
// - Channel: Applied Filter; Date range: Changed Date Range; Detail (opening): Viewed Chart Detail;
//   Export CSV: Exported Report, with the CSV of the rows shown made in memory and saved by the
//   browser; Save view: Saved View (one view, kept in this component's memory); Load saved view:
//   Loaded Saved View, which brings the saved channel and range back without a filter event;
// - Reset: the preset view, no saved view, no open detail, an empty stream, then one new Viewed
//   Dashboard. Its URL write removes only this Figure's keys.
// Each committed action is announced once, politely; the stream itself is never announced.
//
// It passes `preview={false}` to the Figure: if its charts throw after a change, the fallback shows the
// kit's sentence and the table of the view on screen. `faultAfterChange` (a test seam, absent in
// production) makes the charts throw on the first render after a committed change.
import { useEffect, useRef, useState } from 'react';
import { instantly } from '@/components/kit/Figure';
import { useFigureParams } from '@/components/kit/useFigureParams';
import { createPulseBus, type PulseEvent } from '@/lib/pulse/bus';
import {
  PULSE_ID,
  PULSE_PRESETS,
  PULSE_SCHEMA,
  channelPhrase,
  chartLabel,
  dashboardCsv,
  type ChartKey,
  type DashboardView,
} from '@/lib/pulse/dashboard';
import { connectDashboard, pulseEvents, resetDashboard, type Stream } from '@/lib/pulse/session';
import type { PulseTaxonomyRow } from '@/lib/pulse/taxonomy';
import { PulseControls } from './PulseFigureClient';
import { PulseFigureView } from './PulseView';

export type PulseInteractiveProps = {
  /** The export's event rows, as the server read them. */
  taxonomy: readonly PulseTaxonomyRow[];
  faultAfterChange?: true;
};

/** How long the CSV's object URL lives after the click that saves it, in ms. */
const DOWNLOAD_URL_MS = 10_000;

/** Saves the CSV of the rows shown, made in memory: no request, nothing stored. */
function saveCsv(view: DashboardView) {
  const url = URL.createObjectURL(new Blob([dashboardCsv(view)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pulse-dashboard.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_MS);
}

export default function PulseInteractive({ taxonomy, faultAfterChange }: PulseInteractiveProps) {
  const { values, set, reset } = useFigureParams(PULSE_ID, PULSE_SCHEMA, PULSE_PRESETS);
  const view: DashboardView = { channel: values.channel, range: values.range };

  const [bus] = useState(() => createPulseBus(taxonomy));
  const [stream, setStream] = useState<Stream>([]);
  const mounted = useRef(false);
  useEffect(() => connectDashboard(bus, setStream, mounted), [bus]);

  const [saved, setSaved] = useState<DashboardView | null>(null);
  const [detail, setDetail] = useState<ChartKey | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [changed, setChanged] = useState(false);

  /** Sends the action's event and announces its result once. */
  const send = (event: PulseEvent, said: string) => {
    bus.emit(event);
    setAnnouncement(said);
  };

  return (
    <PulseFigureView
      view={view}
      stream={stream}
      saved={saved}
      detail={detail}
      preview={false}
      announcement={announcement}
      faultAfterChange={faultAfterChange}
      changed={changed}
      controls={
        <PulseControls
          view={view}
          onChannel={(channel) => {
            set('channel', channel);
            setChanged(true);
            send(pulseEvents.appliedFilter(channel), `Applied Filter sent. Showing ${channelPhrase(channel)}.`);
          }}
          onRange={(range) => {
            set('range', range);
            setChanged(true);
            send(pulseEvents.changedDateRange(range), 'Changed Date Range sent. The charts show the new range.');
          }}
          onReset={() =>
            instantly(PULSE_ID, () => {
              reset();
              setSaved(null);
              setDetail(null);
              resetDashboard(bus);
              setAnnouncement('Dashboard reset. Viewed Dashboard sent.');
            })
          }
        />
      }
      handlers={{
        onDetail: (chart) => {
          if (detail === chart) {
            setDetail(null);
            return;
          }
          setDetail(chart);
          send(pulseEvents.viewedChartDetail(chart), `Viewed Chart Detail sent. The ${chartLabel(chart)} detail is open.`);
        },
        onExport: () => {
          saveCsv(view);
          send(pulseEvents.exportedReport(), 'Exported Report sent. The CSV file of the made-up numbers is downloading.');
        },
        onSave: () => {
          setSaved(view);
          send(pulseEvents.savedView(), 'Saved View sent. The current channel and range are saved on this page.');
        },
        onLoad: () => {
          if (saved === null) return;
          set('channel', saved.channel);
          set('range', saved.range);
          send(pulseEvents.loadedSavedView(), 'Loaded Saved View sent. The saved channel and range are back.');
        },
      }}
    />
  );
}
