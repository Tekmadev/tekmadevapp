import type { ReactNode } from 'react';

import type { Capability } from '@/auth/capabilities';

/** The sections of the Customers tab, in order (route param `segment`). Demos follows Leads (2026-10-05). */
export const CUSTOMER_SEGMENTS = ['clients', 'leads', 'demos', 'tools', 'subscriptions'] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];

/** What each section needs. Subscriptions is money: owners and managers only. */
export const SEGMENT_CAPABILITIES: Record<CustomerSegment, Capability> = {
  clients: 'clients.view',
  leads: 'leads.view',
  demos: 'demos.view',
  tools: 'tools.view',
  subscriptions: 'billing.view',
};

/** The sections this person may open, in tab order. */
export function visibleSegments(can: (cap: Capability) => boolean): CustomerSegment[] {
  return CUSTOMER_SEGMENTS.filter((s) => can(SEGMENT_CAPABILITIES[s]));
}

export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  clients: 'Clients',
  leads: 'Leads',
  demos: 'Demos',
  tools: 'Free tools',
  subscriptions: 'Subscriptions',
};

/**
 * The section to show for a route param. Unknown or missing values open the
 * first section this person may open (Clients for every role today); so does
 * a section they may not open (an old link to Subscriptions for staff).
 */
export function toSegment(value: unknown, visible: readonly CustomerSegment[] = CUSTOMER_SEGMENTS): CustomerSegment {
  const wanted = (CUSTOMER_SEGMENTS as readonly unknown[]).includes(value) ? (value as CustomerSegment) : null;
  if (wanted && visible.includes(wanted)) return wanted;
  return visible[0] ?? 'clients';
}

/** Route params of the Customers tab (`/customers?segment=clients&view=blocked`). */
export type CustomersParams = {
  segment?: string;
  /**
   * A segment's quick filter. Clients: Home's "Needs you" cards (blocked, review,
   * intake, behind). Leads: booked. Demos: open, ready, mine or all.
   */
  view?: string;
  /** One-shot action from a quick action ("log-call"). Cleared once handled. */
  action?: string;
};

/**
 * What the Customers shell hands every segment. Each segment renders its own
 * ScreenList (so it owns its rows, pull to refresh and states) with the shared
 * chrome:
 *
 *   <ScreenList {...chrome.screen} ListHeaderComponent={<View>{chrome.switcher}{yourHeader}</View>}
 *     ListFooterComponent={<View style={{ height: chrome.fabClearance }} />} ... />
 */
export type SegmentChrome = {
  /** Title "Customers" and the header actions (search, Inbox bell, the Checklist templates menu). */
  screen: { title: string; headerRight: ReactNode };
  /** The section tabs. Render it first in the list header, under the large title. */
  switcher: ReactNode;
  /** Space to leave under the last row so it can scroll clear of the gold + button. */
  fabClearance: number;
};

export type SegmentProps = {
  chrome: SegmentChrome;
  /** The tab's route params. Read only: change them with router.setParams. */
  params: CustomersParams;
};
