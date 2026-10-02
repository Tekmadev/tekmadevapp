import type { ReactNode } from 'react';

/** The four sections of the Marketing tab, in order (route param `segment`). */
export const MARKETING_SEGMENTS = ['blog', 'email', 'links', 'crm'] as const;
export type MarketingSegment = (typeof MARKETING_SEGMENTS)[number];

export const MARKETING_SEGMENT_LABELS: Record<MarketingSegment, string> = {
  blog: 'Blog',
  email: 'Email',
  links: 'Links',
  crm: 'CRM',
};

/** Unknown or missing values open Blog. */
export function toMarketingSegment(value: unknown): MarketingSegment {
  return (MARKETING_SEGMENTS as readonly unknown[]).includes(value) ? (value as MarketingSegment) : 'blog';
}

/** Route params of the Marketing tab (`/marketing?segment=links&action=new`). */
export type MarketingParams = {
  segment?: string;
  /** One-shot action from a quick action ("new" on Links). Clear it with router.setParams once handled. */
  action?: string;
};

/**
 * What the Marketing shell hands every segment (same contract as the Customers
 * tab, see src/modules/customers/segments/types.ts). Each segment renders its
 * own ScreenList (it owns its rows, pull to refresh and states):
 *
 *   <ScreenList {...chrome.screen} ListHeaderComponent={<View>{chrome.switcher}{yourHeader}</View>}
 *     ListFooterComponent={<View style={{ height: chrome.fabClearance }} />} ... />
 */
export type MarketingSegmentChrome = {
  /** Title "Marketing" and the header actions (search, Inbox bell, the segment's menu). */
  screen: { title: string; headerRight: ReactNode };
  /** The section tabs. Render it first in the list header, under the large title. */
  switcher: ReactNode;
  /** Space to leave under the last row (room for a floating button if the segment has one). */
  fabClearance: number;
};

export type MarketingSegmentProps = {
  chrome: MarketingSegmentChrome;
  /** The tab's route params. Read only: change them with router.setParams. */
  params: MarketingParams;
};
