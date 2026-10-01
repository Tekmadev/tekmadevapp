/**
 * Form controls (brief section 6). Import from '@/components/form'.
 * Every control is themed in both schemes, keeps a 48dp touch target, has
 * error and disabled states and speaks its label to TalkBack.
 */

export { Field, FieldMessage, CharacterCount } from './Field';
export type { FieldProps, FieldCount } from './Field';
export { countState, type CountState } from './count';

export { TextField } from './TextField';
export type { TextFieldProps } from './TextField';
export type { BaseInputProps } from './BaseInput';

export { TextArea, useAutosave, useDraftRestore, clearDraft, isDraftNewer } from './TextArea';
export type { TextAreaProps, Autosave, DraftRestore, StoredDraft } from './TextArea';
export { AUTOSAVE_MS } from './autosave';

export { NumberField, numberRangeError } from './NumberField';
export type { NumberFieldProps, NumberMode, RangeRule } from './NumberField';

export { PasswordField } from './PasswordField';
export type { PasswordFieldProps } from './PasswordField';

export { SearchField } from './SearchField';
export type { SearchFieldProps } from './SearchField';

export { Select, OptionList } from './Select';
export type { SelectProps, OptionListProps, SelectOption, OptionValue } from './Select';
export { filterOptions, SEARCH_THRESHOLD } from './options';

export { DateField, dateRangeError } from './DateField';
export type { DateFieldProps } from './DateField';
export { DateTimeField, dateTimeRangeError } from './DateTimeField';
export type { DateTimeFieldProps } from './DateTimeField';
export { Calendar } from './Calendar';
export type { CalendarProps } from './Calendar';
export { TimePicker } from './TimePicker';
export type { TimePickerProps } from './TimePicker';
export { formatFieldDate, formatSpokenDate } from './calendarMath';
export { combineToInstant, formatFieldDateTime, splitInstant } from './dateTime';
export { formatClockTime, parseTimeInput, type ClockTime } from './time';

export { Switch, SwitchRow } from './Switch';
export type { SwitchProps, SwitchRowProps } from './Switch';

export { Checkbox, CheckboxBox } from './Checkbox';
export type { CheckboxProps, CheckState } from './Checkbox';

export { Slider } from './Slider';
export type { SliderProps } from './Slider';

export { ChipsInput } from './ChipsInput';
export type { ChipsInputProps } from './ChipsInput';

export { FormSection } from './FormSection';
export type { FormSectionProps } from './FormSection';

export { FieldTrigger } from './FieldTrigger';
export type { FieldTriggerProps } from './FieldTrigger';
export { FieldIconButton, type FieldFill } from './InputChrome';

export { DraftRestoreNotice } from './DraftRestoreNotice';
export type { DraftRestoreNoticeProps } from './DraftRestoreNotice';
