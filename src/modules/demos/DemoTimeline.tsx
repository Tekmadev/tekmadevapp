import { CircleArrowRight, CirclePlus, Link2, PenLine, UserRound, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { DemoEvent, DemoEventType } from '@/api/schemas/demos';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

import { demoEventByline, demoEventText, demoStatusBadge } from './labels';

const ICONS: Record<DemoEventType, LucideIcon> = {
  created: CirclePlus,
  edited: PenLine,
  status: CircleArrowRight,
  builder: UserRound,
  link: Link2,
};

const DOT = 32;

export type DemoTimelineProps = {
  /** Oldest first, as the server sends them. Shown newest first. */
  events: readonly DemoEvent[];
  now: Date;
  /** A builder email as a name. */
  nameFor: (email: string) => string;
};

/**
 * A request's history, newest first: what happened (status changes tinted by
 * the new status), who did it and when (Toronto time), on a rail like the
 * outreach timeline on a lead.
 */
export function DemoTimeline({ events, now, nameFor }: DemoTimelineProps) {
  const { colors, tones } = useTheme();
  const rows = [...events].reverse();
  return (
    <View accessibilityRole="list">
      {rows.map((e, i) => {
        const last = i === rows.length - 1;
        const tone = e.type === 'status' && e.to ? demoStatusBadge(e.to).tone : 'neutral';
        const text = demoEventText(e, nameFor);
        const byline = demoEventByline(e, now);
        return (
          <View key={`${e.at}-${e.type}-${i}`} style={styles.item} accessible accessibilityLabel={`${text}, by ${byline}`}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: tones[tone].bg }]}>
                <Icon icon={ICONS[e.type] ?? CircleArrowRight} size={16} tone={tone === 'neutral' ? undefined : tone} color="ink2" />
              </View>
              {last ? null : <View style={[styles.line, { backgroundColor: colors.line }]} />}
            </View>
            <View style={[styles.texts, last ? null : styles.gap]}>
              <Text variant="bodyStrong">{text}</Text>
              <Text variant="caption" color="ink4" tabular>
                {byline}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: space[3] },
  rail: { width: DOT, alignItems: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 1, marginVertical: space[1] },
  texts: { flex: 1, gap: 2, paddingTop: space[1] + 2 },
  gap: { paddingBottom: space[4] },
});
