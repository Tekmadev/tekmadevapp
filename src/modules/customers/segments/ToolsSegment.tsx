import { ComingNextSegment } from './ComingNextSegment';
import type { SegmentProps } from './types';

/**
 * STUB (phase 3): the Free tools (brief 8.7) segment of the Customers tab.
 * Replace this file: render a ScreenList with `{...chrome.screen}`, put
 * `chrome.switcher` first in ListHeaderComponent, and leave
 * `chrome.fabClearance` under the last row (see ./types.ts).
 */
export function ToolsSegment({ chrome }: SegmentProps) {
  return <ComingNextSegment chrome={chrome} />;
}
