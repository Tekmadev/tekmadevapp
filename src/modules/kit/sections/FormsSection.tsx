import { PickerDemos } from './forms/PickerDemos';
import { TextInputDemos } from './forms/TextInputDemos';
import { ToggleDemos } from './forms/ToggleDemos';

/**
 * Every form control in its default, focus, filled, error and disabled states.
 * The three groups render fragments, so every demo card stays a direct child
 * of the section (its visibility math depends on that).
 */
export function FormsDemos() {
  return (
    <>
      <TextInputDemos />
      <PickerDemos />
      <ToggleDemos />
    </>
  );
}
