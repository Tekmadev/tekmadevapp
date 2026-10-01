import { CircleAlert, RotateCcw } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { errorMessage, MESSAGES } from '@/api/errors';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

import { Icon } from './Icon';
import { PillButton } from './parts/PillButton';
import { Text } from './Text';

export type ErrorStateProps = {
  /** What went wrong, ready to show. Wins over `error`. */
  message?: string | null;
  /** The failure itself: an ApiError's message is shown, anything else gets the default copy. */
  error?: unknown;
  /** Runs again. A returned promise keeps the button pending until it settles. */
  onRetry?: () => unknown;
  /** Pending from outside (e.g. the query is already refetching). */
  retrying?: boolean;
  /** Smaller, for a failed card or section inside an otherwise working screen. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A read failed: say so plainly and offer Retry. Never zeros or an empty list in
 * its place. Quiet on purpose (no error haptic): the screen did not fail the user.
 */
export function ErrorState({ message, error, onRetry, retrying = false, compact = false, style, testID }: ErrorStateProps) {
  const { tones } = useTheme();
  const [running, setRunning] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const text = message ?? (error !== undefined && error !== null ? errorMessage(error, MESSAGES.unavailable) : MESSAGES.unavailable);
  const pending = retrying || running;

  const retry = () => {
    if (!onRetry || pending) return;
    let result: unknown;
    try {
      result = onRetry();
    } catch {
      return;
    }
    if (result instanceof Promise) {
      setRunning(true);
      result
        .catch(() => undefined)
        .finally(() => {
          if (mounted.current) setRunning(false);
        });
    }
  };

  return (
    <View
      testID={testID}
      accessibilityLiveRegion="polite"
      style={[styles.wrap, compact ? styles.compact : styles.full, style]}
    >
      <View style={[styles.icon, compact ? styles.iconCompact : null, { backgroundColor: tones.signal.bg }]}>
        <Icon icon={CircleAlert} size={compact ? 18 : 22} tone="signal" />
      </View>
      <Text variant="body" color="ink2" align="center" style={styles.message}>
        {text}
      </Text>
      {onRetry ? (
        <PillButton
          label="Retry"
          pendingLabel="Retrying"
          icon={RotateCcw}
          pending={pending}
          onPress={retry}
          variant="secondary"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[8] },
  full: { paddingVertical: space[16] },
  compact: { paddingVertical: space[6] },
  icon: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  iconCompact: { width: 36, height: 36 },
  message: { marginTop: space[4], maxWidth: 320 },
  action: { alignSelf: 'center', marginTop: space[5] },
});
