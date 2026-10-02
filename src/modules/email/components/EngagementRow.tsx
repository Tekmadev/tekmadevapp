import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { EmailMeta, EngagementEvent } from '@/api/schemas/email';
import { Badge } from '@/components/Badge';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { formatDateTime, relativeTime } from '@/lib/dates';

import { displayLink, engagementBadge, eventWhere } from '../logic';

/** The badge column is as wide as the wider badge ("Click"), so titles line up. */
const BADGE_COLUMN = 56;

export type EngagementRowProps = {
  event: EngagementEvent;
  /** The campaign's name, or its key when the campaign was deleted. */
  campaign: string;
  meta: EmailMeta | undefined;
  /** The current minute, so "5 min ago" stays true while the list sits open. */
  now: Date;
  index: number;
  still: boolean;
};

/**
 * One open or click (brief 8.11, Recent engagement): the type badge (open
 * muted, click gold), the campaign, the clicked link, device and country, and
 * when. Read only; TalkBack reads it as one line.
 */
export const EngagementRow = memo(function EngagementRow({ event, campaign, meta, now, index, still }: EngagementRowProps) {
  const badge = engagementBadge(meta, event.type);
  const link = event.link ? displayLink(event.link) : null;
  const where = eventWhere(event);
  const when = relativeTime(event.at, now);
  const spoken = [badge.label, campaign, link, where, formatDateTime(event.at, now)].filter(Boolean).join(', ');

  return (
    <Animated.View entering={still || index >= STAGGER_MAX ? undefined : enterPull(index)}>
      <View style={styles.row} accessible accessibilityLabel={spoken}>
        <View style={styles.badge}>
          <Badge label={badge.label} tone={badge.tone} />
        </View>
        <View style={styles.texts}>
          <View style={styles.titleLine}>
            <Text variant="body" numberOfLines={1} style={styles.title}>
              {campaign}
            </Text>
            <Text variant="small" color="ink4" tabular numberOfLines={1}>
              {when}
            </Text>
          </View>
          {link ? (
            <Text variant="small" color="ink2" numberOfLines={1}>
              {link}
            </Text>
          ) : null}
          {where ? (
            <Text variant="caption" color="ink4" numberOfLines={1}>
              {where}
            </Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingHorizontal: layout.gutter, paddingVertical: space[3] },
  badge: { width: BADGE_COLUMN, paddingTop: 2 },
  texts: { flex: 1, gap: 2 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: space[3] },
  title: { flex: 1 },
});
