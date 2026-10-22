// The kit's client entry: the controls, boundary and hook a page uses directly.
//
//   import { Slider, Segmented, ResetButton, useFigureParams } from '@/components/kit/client';
//
// Every module re-exported here starts with a 'use client' directive, so importing this file from
// a Server Component hands the bundler client references and ships their code. That is why they
// are not in the main entry (`@/components/kit`): importing a server-safe component such as
// Callout there must not pull the controls into the page's JavaScript. This file is not a client
// module itself and has no directive of its own.
export {
  FigureErrorBoundary,
  FigureErrorFallback,
  type FallbackBody,
  type FigureErrorFallbackProps,
} from './FigureErrorBoundary';
export { LoadOnIntent } from './LoadOnIntent';
export { ResetButton } from './ResetButton';
export { Segmented, type SegmentedProps } from './Segmented';
export { Slider, type SliderProps } from './Slider';
export { StepNav, type StepNavProps } from './StepNav';
export { useFigureParams } from './useFigureParams';
