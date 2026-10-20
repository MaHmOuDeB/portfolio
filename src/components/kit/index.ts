// The kit's public surface: every component, helper and type a page may use, in one import.
//
//   import { Figure, ChartFrame, Fact } from '@/components/kit';
//
// This file is NOT a client module and must never get a 'use client' directive: a Server Component
// imports it, and a directive here would turn every export into a client reference. The client
// components (FigureErrorBoundary, LoadOnIntent, ResetButton, Segmented, Slider, StepNav and the
// useFigureParams hook) keep their directive in their own files; a bundler reads it there, so they
// stay client modules when re-exported. The server-safe components render on the server and in an
// island alike.
export { ButtonLink, buttonClass } from './ButtonLink';
export { Callout } from './Callout';
export {
  ChartFrame,
  MARK_UNITS,
  MarkLayer,
  type Annotation,
  type AxisSpec,
  type ChartFrameProps,
  type Layout,
  type PlotContext,
} from './ChartFrame';
export { ConfidenceChart } from './ConfidenceChart';
export { DataTable, type ColumnFormat, type TableData } from './DataTable';
export { Derived, derivedAttr, type DerivedRef } from './Derived';
export { Fact } from './Fact';
export { Figure, instantly, type FigureProps } from './Figure';
export {
  FigureErrorBoundary,
  FigureErrorFallback,
  type FallbackBody,
  type FigureErrorFallbackProps,
} from './FigureErrorBoundary';
export { Icon, type IconName } from './Icon';
export { IntervalGlyph } from './IntervalGlyph';
export { ProgressLine, UpdatedLabel } from './LiveLabels';
export { LiveStateBody } from './LiveStateBody';
export { LoadOnIntent } from './LoadOnIntent';
export { NowRow } from './NowRow';
export { PhaseLabel, type TestNote } from './PhaseLabel';
export { ProvenanceBadge, type Provenance } from './ProvenanceBadge';
export { ResetButton } from './ResetButton';
export { Segmented, type SegmentedProps } from './Segmented';
export { Slider, type SliderProps } from './Slider';
export { Stat } from './Stat';
export { StepNav, type StepNavProps } from './StepNav';
export { TextLink } from './TextLink';
export { useFigureParams } from './useFigureParams';
