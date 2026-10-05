import { CalendarClock, MonitorSmartphone } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { DemoRequest } from '@/api/schemas/demos';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX } from '@/design/motion';
import { space } from '@/design/tokens';

import { demoRowMeta, demoRowSubtitle, demoStatusBadge, neededByBadge } from './labels';

export type DemoRowProps = {
  demo: DemoRequest;
  /** The current minute, so "5 min ago" and "Needed today" stay true while the list sits open. */
  now: Date;
  onPress: (demo: DemoRequest) => void;
  /** Position in the list: the first rows are pulled into place with a stagger. */
  index: number;
  /** No enter animation (reduced motion, rows of a later page, rows inside a card). */
  still: boolean;
  /** "surface" inside a Card; list rows sit on the screen background. */
  background?: 'surface' | 'none';
};

/**
 * One demo request: the business, its kind and area, who it is for and who
 * asked (with how long ago), the status badge, and when it is needed (late in
 * signal, today in warn) above the badge. The whole row opens the request and
 * TalkBack reads it as one line.
 */
export const DemoRow = memo(function DemoRow({ demo, now, onPress, index, still, background = 'none' }: DemoRowProps) {
  const status = demoStatusBadge(demo.status);
  const needed = neededByBadge(demo.neededBy, demo.status, now);
  const subtitle = demoRowSubtitle(demo);
  const meta = demoRowMeta(demo, now);

  const trailing = needed ? (
    <View style={styles.trailing}>
      <View style={styles.needed}>
        <Icon icon={CalendarClock} size={13} tone={needed.tone} />
        <Text variant="caption" tone={needed.tone} numberOfLines={1}>
          {needed.label}
        </Text>
      </View>
      <Badge label={status.label} tone={status.tone} />
    </View>
  ) : undefined;

  return (
    <Animated.View entering={still || index >= STAGGER_MAX ? undefined : enterPull(index)}>
      <ListRow
        title={demo.business.name}
        subtitle={subtitle}
        meta={meta}
        icon={MonitorSmartphone}
        iconTone={status.tone}
        badge={{ label: status.label, tone: status.tone }}
        trailing={trailing}
        background={background}
        onPress={() => onPress(demo)}
        accessibilityLabel={[demo.business.name, subtitle, meta, needed?.label, status.label].filter(Boolean).join(', ')}
        accessibilityHint="Opens the demo request"
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  trailing: { alignItems: 'flex-end', gap: space[1], maxWidth: '45%' },
  needed: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
