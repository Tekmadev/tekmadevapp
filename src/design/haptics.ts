import * as Haptics from 'expo-haptics';

/**
 * The haptics map from the brief. Android view haptics (performHapticFeedback)
 * feel native and follow the system "Touch feedback" setting, so they are preferred
 * over raw vibration wherever a matching constant exists.
 *
 * Every call is fire-and-forget: a device without a vibrator must never surface an error.
 */

const play = (fn: () => Promise<void>) => {
  fn().catch(() => undefined);
};

export const haptics = {
  /** Tab change, chip toggle, segmented control. */
  selection: () => play(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick)),
  /** Slider step, scrub across a chart point, hold-to-confirm progress ticks. */
  tick: () => play(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Frequent_Tick)),
  /** Button press. */
  light: () => play(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key)),
  /** Hold to confirm starts; pull to refresh locks together. */
  medium: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Saved. */
  success: () => play(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)),
  /** Destructive action confirmed. */
  warning: () => play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Failed. */
  error: () => play(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject)),
} as const;

export type HapticKind = keyof typeof haptics;
