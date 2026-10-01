import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Text } from '@/components/Text';
import { durations } from '@/design/motion';
import { space } from '@/design/tokens';
import { toDate } from '@/lib/dates';
import { formatElapsed } from '@/lib/format';
import { BlackHole } from '@/loader/BlackHole';

import { ActionButton } from './ActionButton';

/** The runner that drives this UI lives next to it; re-exported so one import covers both. */
export { useJobRunner } from './useJobRunner';

export type JobProgressProps = {
  /** Shown while true. Turning it off fades the block out. */
  active: boolean;
  /** What is happening, as the brief words it ("Pulling from Meta…"). */
  title: string;
  /** Step labels ("Asking Meta", "Saving rows"). Optional: without them only the title shows. */
  steps?: readonly string[];
  /**
   * The current step when the server reports it. Without it the steps advance
   * on elapsed time (`stepEveryMs`) and hold on the last one: they describe
   * the wait, they never claim the job is done.
   */
  step?: number;
  /** Time per step when `step` is not given (default 8s). */
  stepEveryMs?: number;
  /**
   * When the job started (epoch ms or an ISO instant from a run log). Defaults
   * to the moment `active` turned on, so a job the server already runs keeps its real age.
   */
  startedAt?: number | string | Date | null;
  /** Shows a Cancel button. Cancelling stops waiting; it cannot undo work the server already did. */
  onCancel?: () => void;
  cancelLabel?: string;
  /** One quiet line under the step ("Up to 2 minutes."). */
  note?: string;
  /** 'block' (default) is centred with a large loader; 'inline' is one row for a card. */
  variant?: 'block' | 'inline';
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const DEFAULT_STEP_MS = 8000;

/**
 * Re-renders once a second, aligned to whole seconds since `start`. Mounted only
 * while the job runs, so the clock starts fresh at `initialNow`.
 */
function useSecondTicker(start: number, initialNow: number): number {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      // Wake just after the next whole second of the job, so "0:14" turns over on time.
      const offset = (current - start) % 1000;
      timer = setTimeout(tick, 1000 - offset + 5);
    };
    // Read the clock at once (a new start may have just arrived), then once a second.
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [start]);
  return now;
}

/**
 * Long-job UI (brief section 12): the black hole, the job title, the current
 * step, the elapsed time ticking every second ("0:14") and an optional Cancel.
 * Used for Refresh from Meta, Verify connection, Sync now and the test catalog.
 *
 * TalkBack hears the title once (the loader is a progress bar) and each new
 * step (a polite live region); the ticking clock is not announced.
 */
export function JobProgress({ active, ...rest }: JobProgressProps) {
  // Turning `active` off unmounts the running job, which fades it out.
  return active ? <RunningJob {...rest} /> : null;
}

function RunningJob({
  title,
  steps,
  step,
  stepEveryMs = DEFAULT_STEP_MS,
  startedAt,
  onCancel,
  cancelLabel = 'Cancel',
  note,
  variant = 'block',
  style,
  testID,
}: Omit<JobProgressProps, 'active'>) {
  // When the caller gives no start, the job's age starts when it becomes active (this mounts).
  const [activatedAt] = useState(() => Date.now());

  const given = startedAt == null ? null : (toDate(startedAt)?.getTime() ?? null);
  const start = given ?? activatedAt;
  const now = useSecondTicker(start, activatedAt);

  // A start a moment in the future (clock skew with the server) reads as 0:00, never negative.
  const elapsed = Math.max(0, now - start);
  const stepIndex =
    steps && steps.length > 0
      ? Math.min(Math.max(step ?? Math.floor(elapsed / Math.max(stepEveryMs, 1000)), 0), steps.length - 1)
      : -1;
  const stepLabel = stepIndex >= 0 && steps ? steps[stepIndex] : null;

  const clock = (
    <Text variant="mono" color="ink4" tabular accessibilityLabel={`Running for ${formatElapsed(elapsed)}`}>
      {formatElapsed(elapsed)}
    </Text>
  );
  const stepText = stepLabel ? (
    <Animated.View key={stepLabel} entering={FadeIn.duration(durations.base)}>
      <Text
        variant={variant === 'block' ? 'body' : 'small'}
        color="ink3"
        align={variant === 'block' ? 'center' : undefined}
        numberOfLines={2}
        accessibilityLiveRegion="polite"
      >
        {stepLabel}
      </Text>
    </Animated.View>
  ) : null;
  const cancel = onCancel ? (
    <ActionButton label={cancelLabel} variant="ghost" onPress={onCancel} accessibilityLabel={`${cancelLabel}: ${title}`} />
  ) : null;

  if (variant === 'inline') {
    return (
      <Animated.View
        entering={FadeIn.duration(durations.base)}
        exiting={FadeOut.duration(durations.fast)}
        style={[styles.inline, style]}
        testID={testID}
      >
        <BlackHole size={28} accessibilityLabel={title} />
        <View style={styles.inlineText}>
          <Text variant="label" numberOfLines={1}>
            {title}
          </Text>
          {stepText}
          {note ? (
            <Text variant="small" color="ink4" numberOfLines={2}>
              {note}
            </Text>
          ) : null}
        </View>
        {clock}
        {cancel}
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeIn.duration(durations.base)}
      exiting={FadeOut.duration(durations.fast)}
      style={[styles.block, style]}
      testID={testID}
    >
      <BlackHole size={64} accessibilityLabel={title} />
      <View style={styles.blockText}>
        <Text variant="title" align="center" numberOfLines={2}>
          {title}
        </Text>
        {stepText}
        {clock}
        {note ? (
          <Text variant="small" color="ink4" align="center">
            {note}
          </Text>
        ) : null}
      </View>
      {cancel}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: 'center', gap: space[4], paddingVertical: space[6], paddingHorizontal: space[4] },
  blockText: { alignItems: 'center', gap: space[1] },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56 },
  inlineText: { flex: 1, gap: 2 },
});
