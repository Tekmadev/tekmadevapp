import { ComingNextSegment } from './ComingNextSegment';
import type { SegmentProps } from './types';

/**
 * STUB (phase 3): the Subscriptions (brief 8.8) segment of the Customers tab.
 * Replace this file: render a ScreenList with `{...chrome.screen}`, put
 * `chrome.switcher` first in ListHeaderComponent, and leave
 * `chrome.fabClearance` under the last row (see ./types.ts).
 */
export function SubscriptionsSegment({ chrome }: SegmentProps) {
  return <ComingNextSegment chrome={chrome} />;
}
