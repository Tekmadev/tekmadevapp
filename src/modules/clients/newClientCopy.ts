/**
 * The lines under the New client form (pure, no React).
 *
 * Credit (owner decision 2026-10-05): a client added by hand, not from a lead,
 * credits the person adding it as finder and booker (100%), whatever their
 * role; one created from a lead copies the lead's finder and booker. The
 * server records it; these lines only say so.
 */

export const REUSE_NOTE = 'If a client with this email already exists, it is reused and updated instead of duplicated.';
export const FROM_LEAD_NOTE = 'Linked to the lead, so the people who found it and booked the call get credit for this client.';
export const CREATOR_CREDIT_HINT = 'You get the credit for this client.';

export type NewClientNotes = {
  /** Under the fields: reuse, and the lead's credit line when it comes from a lead. */
  note: string;
  /** One line next to the submit button: only when it is not from a lead. */
  creditHint: string | null;
};

export function newClientNotes(fromLead: boolean): NewClientNotes {
  return fromLead ? { note: `${FROM_LEAD_NOTE} ${REUSE_NOTE}`, creditHint: null } : { note: REUSE_NOTE, creditHint: CREATOR_CREDIT_HINT };
}
