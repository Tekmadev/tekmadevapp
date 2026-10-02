import { memo } from 'react';
import Animated from 'react-native-reanimated';

import type { Lead, LeadsMeta } from '@/api/schemas/leads';
import { ListRow } from '@/components/ListRow';
import { enterPull, STAGGER_MAX } from '@/design/motion';

import { leadTitle, rowMeta, rowSubtitle, statusBadge } from './logic';

export type LeadRowProps = {
  lead: Lead;
  meta: LeadsMeta | undefined;
  /** The current minute, so "5 min ago" stays true while the list sits open. */
  now: Date;
  onPress: (lead: Lead) => void;
  /** Position in the list: the first rows are pulled into place with a stagger. */
  index: number;
  /** No enter animation (reduced motion, rows of a later page, the Lead forms card). */
  still: boolean;
  /** "surface" inside a Card; the list rows sit on the screen background. */
  background?: 'surface' | 'none';
};

/**
 * One lead (brief 8.6): the name, the business, the status badge (new gold,
 * booked ok, the rest muted), then the source and how long ago. The whole row
 * opens the lead and TalkBack reads it as one line.
 */
export const LeadRow = memo(function LeadRow({ lead, meta, now, onPress, index, still, background = 'none' }: LeadRowProps) {
  const title = leadTitle(lead);
  const status = statusBadge(meta, lead.status);
  return (
    <Animated.View entering={still || index >= STAGGER_MAX ? undefined : enterPull(index)}>
      <ListRow
        title={title}
        subtitle={rowSubtitle(lead)}
        meta={rowMeta(lead, meta, now)}
        avatar={{ name: title }}
        badge={{ label: status.label, tone: status.tone }}
        background={background}
        onPress={() => onPress(lead)}
        accessibilityHint="Opens the lead"
      />
    </Animated.View>
  );
});
