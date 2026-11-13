// A Figure's control row of sliders (the Lab's planner, duration and split check, and the Audible
// framework): one layout for all.
// - From xs the controls sit side by side, top-aligned, so every label and legend starts on one line.
// - Each slider's readout always takes its own line under the input, whatever its length, so no
//   control's input moves down beside another's.
// - Reset sits in a wrapper whose top padding is one label line plus the label's gap, so the button
//   lines up with the inputs, not with the labels.
export const CONTROL_ROW =
  'flex flex-col gap-4 max-xs:w-full xs:flex-row xs:flex-wrap xs:items-start xs:gap-x-6 [&_[data-slider-readout]]:basis-full';

export const CONTROL_ROW_RESET = 'max-xs:w-full xs:pt-[calc(var(--text-sm)*var(--text-sm--line-height)+var(--spacing))]';
