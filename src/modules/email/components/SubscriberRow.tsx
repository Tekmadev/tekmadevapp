import { ChevronRight } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { EmailMeta, Subscriber } from '@/api/schemas/email';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { formatShortDate } from '@/lib/dates';

import { crmBadge, leftLine, signupSourceLabel, subscriberStatusBadge } from '../logic';

export type SubscriberRowProps = {
  subscriber: Subscriber;
  meta: EmailMeta | undefined;
  now: Date;
  onPress: (subscriber: Subscriber) => void;
  index: number;
  still: boolean;
};

/**
 * One subscriber (brief 8.11): the email, the status badge (active gold; the
 * rest muted), the CRM / No CRM badge, where they signed up, country and the
 * signup date, and for unsubscribes how and why they left ("Unsubscribed via
 * the unsubscribe page · Too many emails"). The row opens the subscriber.
 */
export const SubscriberRow = memo(function SubscriberRow({ subscriber, meta, now, onPress, index, still }: SubscriberRowProps) {
  const status = subscriberStatusBadge(meta, subscriber.status);
  const crm = crmBadge(subscriber.inCrm);
  const facts = [signupSourceLabel(meta, subscriber.source), subscriber.country, `Signed up ${formatShortDate(subscriber.signedUpAt, now)}`]
    .filter(Boolean)
    .join(' · ');
  const left = leftLine(meta, subscriber);
  const spoken = [subscriber.email, status.label, crm.label, facts, left].filter(Boolean).join(', ');

  return (
    <Animated.View entering={still || index >= STAGGER_MAX ? undefined : enterPull(index)}>
      <PressableScale
        onPress={() => onPress(subscriber)}
        pressedScale={0.985}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint="Opens the subscriber"
      >
        <View style={styles.row} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <View style={styles.texts}>
            <Text variant="body" numberOfLines={1} ellipsizeMode="middle">
              {subscriber.email}
            </Text>
            <View style={styles.badges}>
              <Badge label={status.label} tone={status.tone} />
              <Badge label={crm.label} tone={crm.tone} />
            </View>
            <Text variant="small" color="ink3" numberOfLines={2}>
              {facts}
            </Text>
            {left ? (
              <Text variant="small" color="ink2" numberOfLines={2}>
                {left}
              </Text>
            ) : null}
          </View>
          <Icon icon={ChevronRight} size={18} color="ink4" />
        </View>
      </PressableScale>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: layout.gutter, paddingVertical: space[3], minHeight: 72 },
  texts: { flex: 1, gap: space[1] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginVertical: 2 },
});
