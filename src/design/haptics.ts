import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * The haptics map from the brief: selection (tab change, chip toggle, slider
 * step), light impact (button press), medium impact (hold to confirm starts),
 * success (saved), warning (destructive confirmed), error (failed).
 *
 * - Android: view haptics (performHapticFeedback) wherever a matching constant
 *   exists. They feel native and follow the system "Touch feedback" setting.
 * - iOS: the system feedback generators the brief names (performAndroidHapticsAsync
 *   does nothing there): selection for selections and ticks, impact for presses,
 *   notification for success, warning and error.
 *
 * Every call is fire-and-forget: a device without a haptic engine must never surface an error.
 */

export type HapticKind = 'selection' | 'tick' | 'light' | 'medium' | 'success' | 'warning' | 'error';

/** One platform call. */
export type HapticCall =
  | { api: 'android'; type: Haptics.AndroidHaptics }
  | { api: 'impact'; style: Haptics.ImpactFeedbackStyle }
  | { api: 'notification'; type: Haptics.NotificationFeedbackType }
  | { api: 'selection' };

const ANDROID: Record<HapticKind, HapticCall> = {
  selection: { api: 'android', type: Haptics.AndroidHaptics.Clock_Tick },
  tick: { api: 'android', type: Haptics.AndroidHaptics.Segment_Frequent_Tick },
  light: { api: 'android', type: Haptics.AndroidHaptics.Virtual_Key },
  medium: { api: 'impact', style: Haptics.ImpactFeedbackStyle.Medium },
  success: { api: 'android', type: Haptics.AndroidHaptics.Confirm },
  warning: { api: 'notification', type: Haptics.NotificationFeedbackType.Warning },
  error: { api: 'android', type: Haptics.AndroidHaptics.Reject },
};

const IOS: Record<HapticKind, HapticCall> = {
  selection: { api: 'selection' },
  tick: { api: 'selection' },
  light: { api: 'impact', style: Haptics.ImpactFeedbackStyle.Light },
  medium: { api: 'impact', style: Haptics.ImpactFeedbackStyle.Medium },
  success: { api: 'notification', type: Haptics.NotificationFeedbackType.Success },
  warning: { api: 'notification', type: Haptics.NotificationFeedbackType.Warning },
  error: { api: 'notification', type: Haptics.NotificationFeedbackType.Error },
};

/** What each kind plays on a platform (pure, for the tests). */
export function hapticCall(kind: HapticKind, os: typeof Platform.OS = Platform.OS): HapticCall {
  return (os === 'ios' ? IOS : ANDROID)[kind];
}

function run(call: HapticCall): Promise<void> {
  switch (call.api) {
    case 'android':
      return Haptics.performAndroidHapticsAsync(call.type);
    case 'impact':
      return Haptics.impactAsync(call.style);
    case 'notification':
      return Haptics.notificationAsync(call.type);
    case 'selection':
      return Haptics.selectionAsync();
  }
}

const play = (kind: HapticKind) => {
  try {
    run(hapticCall(kind)).catch(() => undefined);
  } catch {
    // A missing native module throws synchronously; haptics are never worth an error.
  }
};

export const haptics = {
  /** Tab change, chip toggle, segmented control. */
  selection: () => play('selection'),
  /** Slider step, scrub across a chart point, hold-to-confirm progress ticks. */
  tick: () => play('tick'),
  /** Button press. */
  light: () => play('light'),
  /** Hold to confirm starts; pull to refresh locks together. */
  medium: () => play('medium'),
  /** Saved. */
  success: () => play('success'),
  /** Destructive action confirmed. */
  warning: () => play('warning'),
  /** Failed. */
  error: () => play('error'),
} as const satisfies Record<HapticKind, () => void>;
