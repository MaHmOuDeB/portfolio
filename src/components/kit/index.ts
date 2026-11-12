// The kit's main entry: every server-safe component, helper and type, in one import.
//
//   import { Figure, ChartFrame, Fact } from '@/components/kit';
//
// Nothing re-exported here is a client module, so importing one component (Callout, say) does not
// ship the controls to the page. The client components, the error boundary and the
// useFigureParams hook are in `@/components/kit/client`. Two server-safe components use a client
// module: Figure (it wraps its chart in the per-Figure error boundary, which a page that uses
// Figure needs anyway) and TextArea (its live CharacterCount, which a page with the field needs). Neither entry file has a 'use client' directive: that
// would turn every export into a client reference.
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
export { Field, fieldControlClass } from './Field';
export { Figure, instantly, type FigureProps } from './Figure';
export { Icon, type IconName } from './Icon';
export { IntervalGlyph } from './IntervalGlyph';
export { ProgressLine, UpdatedLabel } from './LiveLabels';
export { LiveStateBody } from './LiveStateBody';
export { NowRow } from './NowRow';
export { PhaseLabel, type TestNote } from './PhaseLabel';
export { SelectField } from './SelectField';
export { ProvenanceBadge, type Provenance } from './ProvenanceBadge';
export { Stat } from './Stat';
export { SubmitButton } from './SubmitButton';
export { TextArea } from './TextArea';
export { TextField } from './TextField';
export { TextLink } from './TextLink';
