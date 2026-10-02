import { StyleSheet, View } from 'react-native';

import type { ConsentEvent, EmailMeta } from '@/api/schemas/email';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { formatDateTime } from '@/lib/dates';

import { consentEventDetail, consentEventLabel, reasonLabel } from '../logic';

export type ConsentTimelineProps = {
  /** Newest first, as the server sends it. */
  events: readonly ConsentEvent[];
  meta: EmailMeta | undefined;
  now: Date;
};

/** Gold for joining, quiet for everything else. */
const joins = (event: ConsentEvent) => event.event === 'subscribed' || event.event === 'resubscribed';

/**
 * The consent history (brief 8.11): subscribed, resubscribed, unsubscribed,
 * bounced, "Marked as spam" and "Said why they left", each with the reason
 * when they gave one, when it happened (Toronto time), where it came from and
 * the privacy policy version in force.
 */
export function ConsentTimeline({ events, meta, now }: ConsentTimelineProps) {
  const { colors } = useTheme();
  return (
    <View>
      {events.map((event, i) => {
        const label = consentEventLabel(meta, event.event);
        const reason = event.reason ? reasonLabel(meta, event.reason) : null;
        const when = formatDateTime(event.at, now);
        const detail = consentEventDetail(meta, event);
        const last = i === events.length - 1;
        return (
          <View key={`${event.at}:${event.event}:${i}`} style={styles.entry}>
            <View style={styles.rail} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <View style={[styles.dot, { backgroundColor: joins(event) ? colors.gold : colors.ink5 }]} />
              {!last ? <View style={[styles.line, { backgroundColor: colors.line }]} /> : null}
            </View>
            <View style={styles.content} accessible accessibilityLabel={[label, reason, when, detail].filter(Boolean).join('. ')}>
              <Text variant="bodyStrong">{label}</Text>
              {reason ? (
                <Text variant="body" color="ink2">
                  {reason}
                </Text>
              ) : null}
              <Text variant="small" color="ink3" tabular>
                {when}
              </Text>
              {detail ? (
                <Text variant="caption" color="ink4">
                  {detail}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const DOT = 10;

const styles = StyleSheet.create({
  entry: { flexDirection: 'row', gap: space[3] },
  rail: { width: DOT, alignItems: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, marginTop: 6 },
  line: { width: 1, flex: 1, marginTop: space[1] },
  content: { flex: 1, paddingBottom: space[5], gap: 2 },
});
