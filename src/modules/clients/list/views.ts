import type { ClientAttention } from '@/api/schemas/clients';

/**
 * Quick filters Home's "Needs you" cards open: `/customers?segment=clients&view=blocked`.
 * Each maps to the server's `attention` filter, which uses the same rules as the
 * card's count, so the list always shows exactly what the card counted.
 */
export const CLIENT_VIEWS = ['blocked', 'review', 'intake', 'behind'] as const;
export type ClientsView = (typeof CLIENT_VIEWS)[number];

export type ClientsViewInfo = {
  attention: ClientAttention;
  /** The removable chip above the rows. */
  label: string;
  /** What TalkBack says the list is showing. */
  spoken: string;
};

export const VIEW_INFO: Record<ClientsView, ClientsViewInfo> = {
  blocked: { attention: 'blocked', label: 'Blocked: waiting on something', spoken: 'clients whose onboarding is blocked' },
  review: { attention: 'calls_to_review', label: 'Calls from the CRM to review', spoken: 'clients with CRM appointments waiting for your review' },
  intake: { attention: 'intake_to_review', label: 'Intakes to review', spoken: 'clients whose intake is waiting for review' },
  behind: { attention: 'behind_pace', label: 'Behind pace on the guarantee', spoken: 'live clients behind pace on the guarantee' },
};

/** The route param as a known view, or null (unknown values are ignored, never an error). */
export function toClientsView(value: unknown): ClientsView | null {
  return (CLIENT_VIEWS as readonly unknown[]).includes(value) ? (value as ClientsView) : null;
}
