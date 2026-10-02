import type { ClientPatch } from '@/api/endpoints/clients';
import type { Client, ClientStatus, GuaranteeCountRule, GuaranteeStatus, PlanId } from '@/api/schemas/clients';
import { isBareDomain, isValidEmail } from '@/lib/text';

/**
 * The Account edit sheet's form (brief 8.5, section 10): text as typed, then
 * a partial PATCH with only what changed. Blank optional text clears the field
 * (null); required fields are checked before anything is sent.
 */

export type AccountForm = {
  businessName: string;
  contactName: string;
  legalName: string;
  website: string;
  primaryEmail: string;
  phone: string;
  industry: string;
  status: ClientStatus;
  planId: PlanId | null;
  timezone: string;
  assignedStrategist: string;
  liveDate: string | null;
  serviceArea: string;
  guaranteeEligible: boolean;
  guaranteeTarget: number | null;
  guaranteeWindowDays: number | null;
  guaranteeCountRule: GuaranteeCountRule;
  guaranteeStatus: GuaranteeStatus;
  guaranteeClockStartedOn: string | null;
  internalNotes: string;
};

export const TARGET_RANGE = { min: 1, max: 1000 } as const;
export const WINDOW_RANGE = { min: 1, max: 365 } as const;

export function accountFormFrom(client: Client): AccountForm {
  return {
    businessName: client.businessName,
    contactName: client.contactName ?? '',
    legalName: client.legalName ?? '',
    website: client.website ?? '',
    primaryEmail: client.primaryEmail,
    phone: client.phone ?? '',
    industry: client.industry ?? '',
    status: client.status,
    planId: client.planId,
    timezone: client.timezone,
    assignedStrategist: client.assignedStrategist ?? '',
    liveDate: client.liveDate,
    serviceArea: client.serviceArea ?? '',
    guaranteeEligible: client.guaranteeEligible,
    guaranteeTarget: client.guaranteeTarget,
    guaranteeWindowDays: client.guaranteeWindowDays,
    guaranteeCountRule: client.guaranteeCountRule,
    guaranteeStatus: client.guaranteeStatus,
    guaranteeClockStartedOn: client.guaranteeClockStartedOn,
    internalNotes: client.internalNotes ?? '',
  };
}

const blankToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** "acme.ca" becomes "https://acme.ca"; anything else is sent as typed. */
export function normalizeWebsite(value: string): string | null {
  const text = blankToNull(value);
  if (!text) return null;
  return isBareDomain(text) ? `https://${text}` : text;
}

/** Only the fields that differ from the server's copy. */
export function accountPatch(client: Client, form: AccountForm): ClientPatch {
  const patch: ClientPatch = {};
  const text = <K extends 'legalName' | 'contactName' | 'phone' | 'industry' | 'serviceArea' | 'internalNotes'>(key: K) => {
    const next = blankToNull(form[key]);
    if (next !== (client[key] ?? null)) patch[key] = next;
  };

  const businessName = form.businessName.trim();
  if (businessName !== client.businessName) patch.businessName = businessName;
  const primaryEmail = form.primaryEmail.trim();
  if (primaryEmail.toLowerCase() !== client.primaryEmail.toLowerCase()) patch.primaryEmail = primaryEmail;
  text('contactName');
  text('legalName');
  const website = normalizeWebsite(form.website);
  if (website !== (client.website ?? null)) patch.website = website;
  text('phone');
  text('industry');
  if (form.status !== client.status) patch.status = form.status;
  if (form.planId !== client.planId) patch.planId = form.planId;
  const timezone = form.timezone.trim();
  if (timezone !== client.timezone) patch.timezone = timezone;
  const strategist = blankToNull(form.assignedStrategist);
  if ((strategist?.toLowerCase() ?? null) !== (client.assignedStrategist?.toLowerCase() ?? null)) patch.assignedStrategist = strategist;
  if (form.liveDate !== client.liveDate) patch.liveDate = form.liveDate;
  text('serviceArea');

  if (form.guaranteeEligible !== client.guaranteeEligible) patch.guaranteeEligible = form.guaranteeEligible;
  if (form.guaranteeTarget !== null && form.guaranteeTarget !== client.guaranteeTarget) patch.guaranteeTarget = form.guaranteeTarget;
  if (form.guaranteeWindowDays !== null && form.guaranteeWindowDays !== client.guaranteeWindowDays) {
    patch.guaranteeWindowDays = form.guaranteeWindowDays;
  }
  if (form.guaranteeCountRule !== client.guaranteeCountRule) patch.guaranteeCountRule = form.guaranteeCountRule;
  if (form.guaranteeStatus !== client.guaranteeStatus) patch.guaranteeStatus = form.guaranteeStatus;
  if (form.guaranteeClockStartedOn !== client.guaranteeClockStartedOn) patch.guaranteeClockStartedOn = form.guaranteeClockStartedOn;
  text('internalNotes');
  return patch;
}

/** Inline errors, keyed like the API's `fields` so server and local errors land in the same place. */
export function accountErrors(form: AccountForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.businessName.trim()) errors.businessName = 'Enter the business name.';
  if (!isValidEmail(form.primaryEmail)) errors.primaryEmail = 'Enter a valid email address.';
  if (form.assignedStrategist.trim() && !isValidEmail(form.assignedStrategist)) errors.assignedStrategist = 'Enter a valid email address.';
  if (!form.timezone.trim()) errors.timezone = 'Enter a time zone like America/Toronto.';
  const target = form.guaranteeTarget;
  if (target === null || target < TARGET_RANGE.min || target > TARGET_RANGE.max) errors.guaranteeTarget = 'Enter a whole number of 1 or more.';
  const days = form.guaranteeWindowDays;
  if (days === null || days < WINDOW_RANGE.min || days > WINDOW_RANGE.max) errors.guaranteeWindowDays = 'Enter a number of days from 1 to 365.';
  return errors;
}
