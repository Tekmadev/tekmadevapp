import { useState, type ReactNode } from 'react';

import type { LeadNeed, LeadsMeta } from '@/api/schemas/leads';
import { Select } from '@/components/form/Select';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';

import { needOptions } from './logic';
import { clearLeadFieldError, LIMITS, type LeadForm } from './outreach';

/**
 * The lead form's state: the values, the inline errors, and `set`, which
 * clears the field's error and the rule it shares with its pair (a business
 * answers "Enter a name or a business.", a phone "Enter an email or a phone
 * number."). Shared by "Add a lead" and "Edit lead".
 */
export function useLeadForm(initial: LeadForm) {
  const [form, setForm] = useState<LeadForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof LeadForm>(key: K, value: LeadForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((current) => clearLeadFieldError(current, key));
  };
  return { form, errors, setErrors, set };
}

export type LeadFormFieldsProps = {
  form: LeadForm;
  errors: Record<string, string>;
  meta: LeadsMeta | undefined;
  onChange: <K extends keyof LeadForm>(key: K, value: LeadForm[K]) => void;
  /** Shown right under Need ("They want a demo" on Add a lead). */
  afterNeed?: ReactNode;
};

/**
 * The lead's details, in the same order, with the same labels and help on
 * "Add a lead" and "Edit lead" (and the website's forms): Name, Business,
 * Email, Phone, Website or profile, Need, Note. Errors arrive under the
 * server's field keys.
 */
export function LeadFormFields({ form, errors, meta, onChange, afterNeed }: LeadFormFieldsProps) {
  return (
    <>
      <TextField
        label="Name"
        value={form.name}
        onChangeText={(v) => onChange('name', v)}
        error={errors.name}
        maxLength={LIMITS.name}
        showCount={false}
        autoCapitalize="words"
        autoComplete="off"
        textContentType="none"
        returnKeyType="next"
      />
      <TextField
        label="Business"
        value={form.business}
        onChangeText={(v) => onChange('business', v)}
        error={errors.business}
        maxLength={LIMITS.business}
        showCount={false}
        autoCapitalize="words"
        autoComplete="off"
        returnKeyType="next"
      />
      <TextField
        label="Email"
        value={form.email}
        onChangeText={(v) => onChange('email', v)}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="none"
      />
      <TextField
        label="Phone"
        value={form.phone}
        onChangeText={(v) => onChange('phone', v)}
        error={errors.phone}
        keyboardType="phone-pad"
        autoComplete="off"
        textContentType="none"
      />
      <TextField
        label="Website or profile"
        value={form.website}
        onChangeText={(v) => onChange('website', v)}
        error={errors.website}
        help="Their site, or a handle like instagram.com/name."
        maxLength={LIMITS.website}
        showCount={false}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
      />
      <Select<LeadNeed>
        label="Need"
        options={needOptions(meta)}
        value={form.need}
        onChange={(v) => onChange('need', v)}
        onClear={() => onChange('need', null)}
        placeholder="Not sure yet"
        error={errors.need}
        sheetTitle="What they need"
      />
      {afterNeed}
      <TextArea
        label="Note"
        value={form.message}
        onChangeText={(v) => onChange('message', v)}
        error={errors.message}
        help="What you know about them: where you found them, what they asked."
        maxLength={LIMITS.message}
        showCount={false}
      />
    </>
  );
}
