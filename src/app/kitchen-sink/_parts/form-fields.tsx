// The form fields in every state: TextField, TextArea with its counter, SelectField and the submit
// button. Each specimen sits in the text column, as on a page; the e2e checks them at 320 px too.
// Every number goes through the counter's data-derived with the ref 'simulated'; the texts are
// fictional and hold no digits.
import { SelectField } from '@/components/kit/SelectField';
import { SubmitButton } from '@/components/kit/SubmitButton';
import { TextArea } from '@/components/kit/TextArea';
import { TextField } from '@/components/kit/TextField';
import { Specimen } from './Specimen';

const LIMIT = 200;
const SENTENCE = 'A fictional message for the counter specimen, written to fill the field. ';
/** Fictional text of exactly `length` characters, with no digits. */
const filler = (length: number) => SENTENCE.repeat(Math.ceil(length / SENTENCE.length)).slice(0, length);

const REASONS = [
  { value: 'job', label: 'Job opportunity' },
  { value: 'interview', label: 'Interview or recruiting' },
  { value: 'project', label: 'Question about a project' },
  { value: 'privacy', label: 'Privacy or data request' },
  { value: 'other', label: 'Something else' },
] as const;

const column = 'max-w-text';

export function FormFieldsSection() {
  return (
    <>
      <Specimen id="field--empty" title="Text field: empty" note="Label in ink, no placeholder, no colon, no asterisk.">
        <div className={column}>
          <TextField id="ks-name-empty" name="ks-name-empty" label="Name" autoComplete="off" />
        </div>
      </Specimen>
      <Specimen id="field--hint" title="Text field: with a hint" note="The hint is read after the label.">
        <div className={column}>
          <TextField id="ks-email-hint" name="ks-email-hint" type="email" label="E-mail address" hint="I reply to this address." autoComplete="off" spellCheck={false} />
        </div>
      </Specimen>
      <Specimen id="field--filled" title="Text field: filled" note="The same box, with the value in ink. No tick, no green.">
        <div className={column}>
          <TextField id="ks-name-filled" name="ks-name-filled" label="Name" defaultValue="Ada Lovelace" autoComplete="off" />
        </div>
      </Specimen>
      <Specimen id="field--error" title="Text field: error" note="The error is a sentence above the control, with a rule at the left and a warn border.">
        <div className={column}>
          <TextField id="ks-name-error" name="ks-name-error" label="Name" error="Enter your name" autoComplete="off" />
        </div>
      </Specimen>
      <Specimen id="field--error-filled" title="Text field: error, filled" note="The visitor's text stays in the field.">
        <div className={column}>
          <TextField
            id="ks-email-error"
            name="ks-email-error"
            type="email"
            label="E-mail address"
            hint="I reply to this address."
            error="Enter a full e-mail address, with an @ and a domain"
            defaultValue="ada at home"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </Specimen>
      <Specimen id="field--disabled" title="Text field: disabled" note="The disabled state from the tokens: a line border and muted text.">
        <div className={column}>
          <TextField id="ks-subject-disabled" name="ks-subject-disabled" label="Subject" defaultValue="A fictional subject" disabled />
        </div>
      </Specimen>
      <Specimen id="field--long-label" title="Text field: a long label that wraps" note="The label wraps; the control keeps its full width.">
        <div className={column}>
          <TextField
            id="ks-long"
            name="ks-long"
            label="What would you like me to know about the role, the team and the timeline before we talk"
            hint="A fictional label, long on purpose."
            autoComplete="off"
          />
        </div>
      </Specimen>
      <Specimen id="field--focus" title="Text field: keyboard focus" note="The site's one focus ring; the border does not change on focus.">
        <div className={column}>
          <TextField id="ks-focus" name="ks-focus" label="Subject" autoComplete="off" />
        </div>
      </Specimen>

      <Specimen id="area--empty" title="Text area: empty" note={'Eight rows, resizable in height. Without JavaScript the counter reads "Up to" the limit; with it, how many are left.'}>
        <div className={column}>
          <TextArea id="ks-message-empty" name="ks-message-empty" label="Message" limit={LIMIT} refs={['simulated']} />
        </div>
      </Specimen>
      <Specimen id="area--error" title="Text area: error" note="An error with its rule, and the counter under the control.">
        <div className={column}>
          <TextArea id="ks-message-error" name="ks-message-error" label="Message" error="Enter your message" limit={LIMIT} refs={['simulated']} />
        </div>
      </Specimen>
      <Specimen id="area--disabled" title="Text area: disabled" note="The disabled state from the tokens.">
        <div className={column}>
          <TextArea id="ks-message-disabled" name="ks-message-disabled" label="Message" defaultValue={filler(60)} limit={LIMIT} refs={['simulated']} disabled />
        </div>
      </Specimen>
      <Specimen id="counter--below" title="Counter: well below the limit" note="How many characters are left. Not announced.">
        <div className={column}>
          <TextArea id="ks-count-below" name="ks-count-below" label="Message" defaultValue={filler(80)} limit={LIMIT} refs={['simulated']} rows={3} />
        </div>
      </Specimen>
      <Specimen id="counter--last-tenth" title="Counter: the last tenth" note="Still muted; a screen reader now hears the count after typing stops.">
        <div className={column}>
          <TextArea id="ks-count-tenth" name="ks-count-tenth" label="Message" defaultValue={filler(190)} limit={LIMIT} refs={['simulated']} rows={3} />
        </div>
      </Specimen>
      <Specimen id="counter--limit" title="Counter: the limit reached" note="No characters left.">
        <div className={column}>
          <TextArea id="ks-count-limit" name="ks-count-limit" label="Message" defaultValue={filler(LIMIT)} limit={LIMIT} refs={['simulated']} rows={3} />
        </div>
      </Specimen>
      <Specimen id="counter--over" title="Counter: over the limit" note="The count turns warn with the alert icon, and the box takes a warn border. No error until a submit.">
        <div className={column}>
          <TextArea id="ks-count-over" name="ks-count-over" label="Message" defaultValue={filler(212)} limit={LIMIT} refs={['simulated']} rows={3} />
        </div>
      </Specimen>

      <Specimen id="select--empty" title="Select: nothing chosen" note={'"Choose one" is muted while it is chosen; the open list stays ink.'}>
        <div className={column}>
          <SelectField id="ks-reason-empty" name="ks-reason-empty" label="Why are you getting in touch?" options={REASONS} />
        </div>
      </Specimen>
      <Specimen id="select--chosen" title="Select: a reason chosen" note="The longest reason fits at 320 px.">
        <div className={column}>
          <SelectField id="ks-reason-chosen" name="ks-reason-chosen" label="Why are you getting in touch?" options={REASONS} defaultValue="project" />
        </div>
      </Specimen>
      <Specimen id="select--error" title="Select: error" note="Left empty and submitted.">
        <div className={column}>
          <SelectField id="ks-reason-error" name="ks-reason-error" label="Why are you getting in touch?" options={REASONS} error="Choose why you are getting in touch" />
        </div>
      </Specimen>
      <Specimen id="select--disabled" title="Select: disabled" note="The chevron stays muted.">
        <div className={column}>
          <SelectField id="ks-reason-disabled" name="ks-reason-disabled" label="Why are you getting in touch?" options={REASONS} defaultValue="job" disabled />
        </div>
      </Specimen>

      <Specimen id="submit--default" title="Submit button" note="The primary button. Hover and focus turn the fill muted, a colour change only. Never full width, never an icon.">
        <SubmitButton>Send message</SubmitButton>
      </Specimen>
      <Specimen id="submit--pending" title="Submit button: pending" note="A word, no spinner. aria-disabled, never disabled, so focus stays; the width does not change.">
        <SubmitButton pending pendingLabel="Sending…">
          Send message
        </SubmitButton>
      </Specimen>
      <Specimen id="submit--disabled" title="Submit button: disabled" note="The tokens' disabled state. A page validates on submit instead of disabling its button.">
        <SubmitButton disabled>Send message</SubmitButton>
      </Specimen>
    </>
  );
}
