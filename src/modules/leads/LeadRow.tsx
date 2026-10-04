import { CalendarClock } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { Lead, LeadsMeta } from '@/api/schemas/leads';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX } from '@/design/motion';
import { space } from '@/design/tokens';

import { leadTitle, rowMeta, rowSubtitle, statusBadge } from './logic';
import { FOLLOW_UP_TONES, followUpShort, followUpSpoken, followUpState } from './outreach';

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
 * booked ok, the rest muted), then the source and how long ago. A lead with a
 * follow-up shows it small above the badge ("2d overdue" in signal, "Today" in
 * gold, then "Tomorrow" or the date). The whole row opens the lead and
 * TalkBack reads it as one line.
 */
export const LeadRow = memo(function LeadRow({ lead, meta, now, onPress, index, still, background = 'none' }: LeadRowProps) {
  const title = leadTitle(lead);
  const subtitle = rowSubtitle(lead);
  const metaLine = rowMeta(lead, meta, now);
  const status = statusBadge(meta, lead.status);
  const followUp = lead.followUpAt ?? null;
  const state = followUpState(followUp, now);

  const trailing = state ? (
    <View style={styles.trailing}>
      <View style={styles.followUp}>
        <Icon icon={CalendarClock} size={13} tone={FOLLOW_UP_TONES[state]} />
        <Text variant="caption" tone={FOLLOW_UP_TONES[state]} weight={state === 'upcoming' ? undefined : '600'} tabular numberOfLines={1}>
          {followUpShort(followUp, now)}
        </Text>
      </View>
      <Badge label={status.label} tone={status.tone} />
    </View>
  ) : undefined;

  return (
    <Animated.View entering={still || index >= STAGGER_MAX ? undefined : enterPull(index)}>
      <ListRow
        title={title}
        subtitle={subtitle}
        meta={metaLine}
        avatar={{ name: title }}
        badge={{ label: status.label, tone: status.tone }}
        trailing={trailing}
        background={background}
        onPress={() => onPress(lead)}
        accessibilityLabel={
          state ? [title, subtitle, metaLine, followUpSpoken(followUp, now), status.label].filter(Boolean).join(', ') : undefined
        }
        accessibilityHint="Opens the lead"
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  trailing: { alignItems: 'flex-end', gap: space[1], maxWidth: '45%' },
  followUp: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
