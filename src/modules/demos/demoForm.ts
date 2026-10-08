import type { DemoPatch, NewDemoInput } from '@/api/endpoints/demos';
import type { DemoBusiness, DemoField, DemoRequest } from '@/api/schemas/demos';
import { formatCount } from '@/lib/format';

import { isDemoLink } from './labels';

/**
 * The demo request form (pure, no React): the contract's fields, the limits
 * the server checks, and the bodies for POST /demos and PATCH /demos/:id.
 * "Already built? Demo link" (owners and managers, `demos.manage`): a link
 * sent with the request saves it as ready to show.
 * Local checks only catch the obvious; the server decides and its field
 * errors (same keys) are shown inline.
 */

/** Keys are the server's field error keys, so its `fields` land on the right input. */
export type DemoForm = {
  businessName: string;
  businessType: string;
  area: string;
  offer: string;
  website: string;
  brand: string;
  customers: string;
  wants: string;
  /** `YYYY-MM-DD` (a Toronto calendar date) or null. */
  neededBy: string | null;
  /** "Already built? Demo link": only on "Request a demo", only for `demos.manage`. Empty: an ordinary request. */
  demoUrl: string;
};

/** The text fields with a plain length limit (the link has its own check). */
export type DemoTextField = Exclude<keyof DemoForm, 'neededBy' | 'demoUrl'>;
export type DemoFormErrors = Partial<Record<DemoField, string>>;

/** The contract's limits (characters). */
export const DEMO_LIMITS: Readonly<Record<DemoTextField, number>> = {
  businessName: 120,
  businessType: 80,
  area: 120,
  offer: 1000,
  website: 500,
  brand: 500,
  customers: 500,
  wants: 2000,
};

export const REQUIRED_DEMO_FIELDS: readonly DemoTextField[] = ['businessName', 'businessType', 'area', 'offer'];

/** The same words the server uses. */
const REQUIRED_MESSAGE: Readonly<Record<string, string>> = {
  businessName: 'Enter the business name.',
  businessType: 'Enter the kind of business.',
  area: 'Enter the city or area they serve.',
  offer: 'Say what they sell or do.',
};
const tooLong = (limit: number) => `Keep this to ${formatCount(limit)} characters or fewer.`;

/** The server's word for a link it does not take (POST /demos and the link sheet). */
export const DEMO_LINK_MESSAGE = 'Enter a full link starting with https://.';

/** The server's longest demo link. */
export const DEMO_LINK_LIMIT = 2000;

export type DemoPrefill = { businessName?: string; area?: string };

/**
 * A fresh form with what is known filled in, cut to the form's limits (a lead's
 * business may be 200 characters, a demo's 120), like the website's prefill.
 */
export function emptyDemoForm(prefill: DemoPrefill = {}): DemoForm {
  return {
    businessName: (prefill.businessName?.trim() ?? '').slice(0, DEMO_LIMITS.businessName).trim(),
    businessType: '',
    area: (prefill.area?.trim() ?? '').slice(0, DEMO_LIMITS.area).trim(),
    offer: '',
    website: '',
    brand: '',
    customers: '',
    wants: '',
    neededBy: null,
    demoUrl: '',
  };
}

/** The form for editing a request (null fields as empty text). The link has its own sheet. */
export function demoFormFrom(d: Pick<DemoRequest, 'business' | 'wants' | 'neededBy'>): DemoForm {
  return {
    businessName: d.business.name,
    businessType: d.business.type,
    area: d.business.area,
    offer: d.business.offer,
    website: d.business.website ?? '',
    brand: d.business.brand ?? '',
    customers: d.business.customers ?? '',
    wants: d.wants ?? '',
    neededBy: d.neededBy,
    demoUrl: '',
  };
}

export type DemoFormOptions = {
  /** The "Already built? Demo link" field is on the form (`demos.manage`). */
  withLink?: boolean;
};

/**
 * Required fields filled and nothing over its limit; with the link field, a
 * link (when there is one) passes the link sheet's https check. Empty: fine to send.
 */
export function demoFormErrors(form: DemoForm, options: DemoFormOptions = {}): DemoFormErrors {
  const errors: DemoFormErrors = {};
  for (const field of Object.keys(DEMO_LIMITS) as DemoTextField[]) {
    const value = form[field].trim();
    if (!value && REQUIRED_DEMO_FIELDS.includes(field)) errors[field] = REQUIRED_MESSAGE[field];
    else if (value.length > DEMO_LIMITS[field]) errors[field] = tooLong(DEMO_LIMITS[field]);
  }
  const link = demoLinkOf(form, options);
  if (link && (link.length > DEMO_LINK_LIMIT || !isDemoLink(link))) errors.demoUrl = DEMO_LINK_MESSAGE;
  return errors;
}

/** The link to send: trimmed, only when the field is on the form; null when there is none. */
export function demoLinkOf(form: DemoForm, options: DemoFormOptions = {}): string | null {
  return (options.withLink && form.demoUrl.trim()) || null;
}

const orNull = (value: string) => value.trim() || null;

/** The business as the API takes it: trimmed, blank optional fields as null. */
export function demoBusiness(form: DemoForm): DemoBusiness {
  return {
    name: form.businessName.trim(),
    type: form.businessType.trim(),
    area: form.area.trim(),
    offer: form.offer.trim(),
    website: orNull(form.website),
    brand: orNull(form.brand),
    customers: orNull(form.customers),
  };
}

/** Who the request is for. Exactly one of the two, as the server asks; null when there is neither. */
export type DemoFormTarget = { clientId: string } | { leadId: string };

export function demoTarget(clientId: string | null | undefined, leadId: string | null | undefined): DemoFormTarget | null {
  const client = clientId?.trim();
  const lead = leadId?.trim();
  if (client) return { clientId: client };
  if (lead) return { leadId: lead };
  return null;
}

/**
 * POST /demos body (without the key). `demoUrl` only when a link was typed on
 * a form that has the field: without it the request is an ordinary one (and
 * the server hashes it as before the shortcut).
 */
export function newDemoInput(target: DemoFormTarget, form: DemoForm, options: DemoFormOptions = {}): NewDemoInput {
  const input: NewDemoInput = { ...target, business: demoBusiness(form), wants: orNull(form.wants), neededBy: form.neededBy };
  const link = demoLinkOf(form, options);
  if (link) input.demoUrl = link;
  return input;
}

/** PATCH /demos/:id with only what changed (empty when nothing did). */
export function demoPatchFrom(d: Pick<DemoRequest, 'business' | 'wants' | 'neededBy'>, form: DemoForm): DemoPatch {
  const next = demoBusiness(form);
  const business: Partial<DemoBusiness> = {};
  for (const key of Object.keys(next) as (keyof DemoBusiness)[]) {
    if (next[key] !== d.business[key]) (business as Record<string, string | null>)[key] = next[key];
  }
  const patch: DemoPatch = {};
  if (Object.keys(business).length > 0) patch.business = business;
  const wants = orNull(form.wants);
  if (wants !== d.wants) patch.wants = wants;
  if (form.neededBy !== d.neededBy) patch.neededBy = form.neededBy;
  return patch;
}

/** Whether the form holds anything typed (for the local draft). */
export function demoFormHasText(form: DemoForm, prefill: DemoPrefill = {}): boolean {
  const base = emptyDemoForm(prefill);
  return (Object.keys(form) as (keyof DemoForm)[]).some((k) => (form[k] ?? '') !== (base[k] ?? ''));
}

/** A saved draft on top of a fresh form: a draft saved by an older build has no link field. */
export function restoredDemoForm(initial: DemoForm, draft: Partial<DemoForm>): DemoForm {
  return { ...initial, ...draft };
}
