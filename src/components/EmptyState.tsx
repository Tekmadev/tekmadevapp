import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { space } from '@/design/tokens';
import { LogoMark } from '@/loader/LogoMark';

import { PillButton } from './parts/PillButton';
import { Text } from './Text';

export type EmptyStateProps = {
  /** One line, from the brief where it gives one ("No leads yet."). */
  message: string;
  action?: { label: string; onPress: () => void; icon?: LucideIcon };
  /** Smaller, for an empty card or section rather than a whole screen. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Nothing here yet, said calmly: the logo as a faint watermark, one line of
 * copy and an optional action. Empty is not failed; failures use ErrorState.
 */
export function EmptyState({ message, action, compact = false, style, testID }: EmptyStateProps) {
  return (
    <View testID={testID} style={[styles.wrap, compact ? styles.compact : styles.full, style]}>
      <LogoMark size={compact ? 40 : 72} opacity={0.14} />
      <Text variant="body" color="ink3" align="center" style={styles.message} accessibilityRole="text">
        {message}
      </Text>
      {action ? (
        <PillButton label={action.label} icon={action.icon} onPress={action.onPress} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[8] },
  full: { paddingVertical: space[16] },
  compact: { paddingVertical: space[6] },
  message: { marginTop: space[4], maxWidth: 320 },
  action: { alignSelf: 'center', marginTop: space[5] },
});
