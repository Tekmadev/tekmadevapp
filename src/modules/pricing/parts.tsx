import { CircleAlert } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

/**
 * The API's own words after a partial Stripe failure ("Stripe did not accept
 * the new monthly fee, so it was not saved: ... Saved: ..."), kept on the card
 * above Save until the next edit or save. Announced to TalkBack as it appears.
 */
export function SaveErrorNote({ message }: { message: string }) {
  const { tones } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
      style={[styles.note, { backgroundColor: tones.signal.bg }]}
    >
      <View style={styles.icon}>
        <Icon icon={CircleAlert} size={18} tone="signal" strokeWidth={2} />
      </View>
      <Text variant="small" tone="signal" style={styles.text}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
    borderRadius: radius.sm,
    paddingHorizontal: space[3],
    paddingVertical: space[2] + 2,
  },
  icon: { marginTop: 1 },
  text: { flex: 1 },
});
