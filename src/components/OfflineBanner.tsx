import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';

import { Icon } from './Icon';
import { Text } from './Text';
import { offlineCopy } from './parts/logic';

export type OfflineBannerProps = {
  /** When the data on screen was last fetched (ms, ISO or Date). Wins over `queryKey`. */
  updatedAt?: number | string | Date | null;
  /** Read the time from this query's cache entry instead. */
  queryKey?: QueryKey;
  style?: StyleProp<ViewStyle>;
};

/**
 * "Offline · showing what was loaded at 2:41 PM". Quiet (ink2 on bg3), and
 * renders nothing while online. Without a time or key it uses the most recent
 * successful fetch in the cache, which is what the screen is showing.
 */
export function OfflineBanner({ updatedAt, queryKey, style }: OfflineBannerProps) {
  const online = useIsOnline();
  const client = useQueryClient();
  const { colors } = useTheme();
  if (online) return null;

  let time: number | string | Date | null = updatedAt ?? null;
  if (time == null && queryKey) time = client.getQueryState(queryKey)?.dataUpdatedAt ?? null;
  if (time == null) {
    const latest = client
      .getQueryCache()
      .getAll()
      .reduce((max, q) => Math.max(max, q.state.dataUpdatedAt), 0);
    time = latest > 0 ? latest : null;
  }
  const copy = offlineCopy(time);

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(180)}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={copy}
      style={[styles.banner, { backgroundColor: colors.bg3, borderColor: colors.line }, style]}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.row}>
        <Icon icon={WifiOff} size={14} color="ink3" />
        <Text variant="small" color="ink2" style={styles.text}>
          {copy}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  text: { flex: 1 },
});
