import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { badgeCountLabel, tabAccessibilityLabel } from '@/components/parts/logic';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';

import { inboxSummaryQuery } from './queries';

/**
 * The bell in the top right of every tab header (owner decision: the Inbox is
 * not a tab). The unread count shows as a gold pill, red when a critical item
 * is unread, "99+" above 99. The summary query polls every 45s in the foreground.
 */
export function InboxBellButton() {
  const { colors } = useTheme();
  const summary = useQuery(inboxSummaryQuery());
  const unread = summary.data?.unread ?? 0;
  const critical = (summary.data?.criticalUnread ?? 0) > 0;
  const label = badgeCountLabel(unread);

  return (
    <PressableScale
      accessibilityLabel={tabAccessibilityLabel('Inbox', unread)}
      accessibilityHint="Opens your notifications"
      onPress={() => router.push('/inbox')}
      hitSlop={4}
      style={styles.target}
    >
      <Icon icon={Bell} size={22} color="ink2" />
      {label ? (
        <View
          pointerEvents="none"
          style={[styles.badge, { backgroundColor: critical ? colors.signal : colors.gold, borderColor: colors.bg }]}
        >
          <Text variant="caption" color="onInk" weight="700" tabular style={styles.badgeText}>
            {label}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  target: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 4,
    left: 25,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, lineHeight: 12 },
});
