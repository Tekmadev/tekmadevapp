import type { ReactNode } from 'react';

/** The four sections of the Customers tab, in order (route param `segment`). */
export const CUSTOMER_SEGMENTS = ['clients', 'leads', 'tools', 'subscriptions'] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];

export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  clients: 'Clients',
  leads: 'Leads',
  tools: 'Free tools',
  subscriptions: 'Subscriptions',
};

/** Unknown or missing values open Clients. */
export function toSegment(value: unknown): CustomerSegment {
  return (CUSTOMER_SEGMENTS as readonly unknown[]).includes(value) ? (value as CustomerSegment) : 'clients';
}

/** Route params of the Customers tab (`/customers?segment=clients&view=blocked`). */
export type CustomersParams = {
  segment?: string;
  /** Clients: a quick filter from Home's "Needs you" cards (blocked, review, intake, behind). */
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
  /** Title "Customers" and the header actions (search, Inbox bell, owner menu). */
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
