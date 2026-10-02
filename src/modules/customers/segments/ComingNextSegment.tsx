import { View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ScreenList } from '@/components/ScreenList';

import type { SegmentChrome } from './types';

const NO_ROWS: readonly never[] = [];
const renderNothing = () => null;

/**
 * A calm placeholder for a Customers segment that ships in the next phase.
 * It keeps the shared chrome (title, section tabs, header actions) so switching
 * segments never moves the header.
 */
export function ComingNextSegment({ chrome }: { chrome: SegmentChrome }) {
  return (
    <ScreenList<never>
      {...chrome.screen}
      data={NO_ROWS}
      renderItem={renderNothing}
      ListHeaderComponent={<View>{chrome.switcher}</View>}
      ListEmptyComponent={<EmptyState message="Coming in the next phase." />}
    />
  );
}
