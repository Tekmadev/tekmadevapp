import type { CallPatch, NewCallInput } from '@/api/endpoints/clients';
import type { Call, CallSource, CallStatus, DisqualifyReason } from '@/api/schemas/clients';
import { isValidEmail } from '@/lib/text';

import { textOrNull } from '../formText';

/** The call edit sheet and "Log a booked call" forms: what is sent, and the checks before sending. */

export type Qualified = 'unset' | 'yes' | 'no';

export const QUALIFIED_ITEMS = [
  { value: 'unset' as const, label: 'Not reviewed' },
  { value: 'yes' as const, label: 'Yes' },
  { value: 'no' as const, label: 'No' },
];

export const REASON_REQUIRED = 'Pick why it does not count.';

export function toQualified(value: boolean | null): Qualified {
  return value === null ? 'unset' : value ? 'yes' : 'no';
}

export function fromQualified(value: Qualified): boolean | null {
  return value === 'unset' ? null : value === 'yes';
}

/** Only the fields that changed (PATCH is partial). */
export function callPatch(
  call: Pick<Call, 'status' | 'qualified' | 'disqualifiedReason' | 'notes'>,
  form: { status: CallStatus; qualified: Qualified; reason: DisqualifyReason | null; notes: string },
): CallPatch {
  const patch: CallPatch = {};
  if (form.status !== call.status) patch.status = form.status;
  const qualified = fromQualified(form.qualified);
  if (qualified !== call.qualified) patch.qualified = qualified;
  if (qualified === false && form.reason !== call.disqualifiedReason) patch.disqualifiedReason = form.reason;
  const notes = textOrNull(form.notes);
  if (notes !== (call.notes ?? null)) patch.notes = notes;
  return patch;
}

export type LogCallForm = {
  contactName: string;
  phone: string;
  email: string;
  serviceRequested: string;
  bookedAt: string | null;
  bookedFor: string | null;
  status: CallStatus;
  notes: string;
  source: CallSource;
};

export const CONTACT_REQUIRED = 'Add a name, phone or email for this call.';
const EMAIL_INVALID = 'Enter a valid email address.';

/** Inline checks before anything is sent (the server checks the same). */
export function logCallErrors(form: LogCallForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.contactName.trim() && !form.phone.trim() && !form.email.trim()) errors.contactName = CONTACT_REQUIRED;
  if (form.email.trim() && !isValidEmail(form.email)) errors.email = EMAIL_INVALID;
  return errors;
}

/** The POST body: blank fields are left out; no "booked at" means now (the server's clock). */
export function logCallInput(form: LogCallForm): NewCallInput {
  const input: NewCallInput = { status: form.status, source: form.source };
  const contactName = textOrNull(form.contactName);
  const phone = textOrNull(form.phone);
  const email = textOrNull(form.email);
  const serviceRequested = textOrNull(form.serviceRequested);
  const notes = textOrNull(form.notes);
  if (contactName) input.contactName = contactName;
  if (phone) input.phone = phone;
  if (email) input.email = email;
  if (serviceRequested) input.serviceRequested = serviceRequested;
  if (form.bookedAt) input.bookedAt = form.bookedAt;
  if (form.bookedFor) input.bookedFor = form.bookedFor;
  if (notes) input.notes = notes;
  return input;
}

export const EMPTY_LOG_CALL: LogCallForm = {
  contactName: '',
  phone: '',
  email: '',
  serviceRequested: '',
  bookedAt: null,
  bookedFor: null,
  status: 'booked',
  notes: '',
  source: 'manual',
};

