import * as Haptics from 'expo-haptics';

import { caretColors } from '../caret';
import { hapticCall, haptics, type HapticKind } from '../haptics';

describe('hapticCall', () => {
  it('keeps the Android view haptics', () => {
    expect(hapticCall('selection', 'android')).toEqual({ api: 'android', type: Haptics.AndroidHaptics.Clock_Tick });
    expect(hapticCall('tick', 'android')).toEqual({ api: 'android', type: Haptics.AndroidHaptics.Segment_Frequent_Tick });
    expect(hapticCall('light', 'android')).toEqual({ api: 'android', type: Haptics.AndroidHaptics.Virtual_Key });
    expect(hapticCall('medium', 'android')).toEqual({ api: 'impact', style: Haptics.ImpactFeedbackStyle.Medium });
    expect(hapticCall('success', 'android')).toEqual({ api: 'android', type: Haptics.AndroidHaptics.Confirm });
    expect(hapticCall('warning', 'android')).toEqual({ api: 'notification', type: Haptics.NotificationFeedbackType.Warning });
    expect(hapticCall('error', 'android')).toEqual({ api: 'android', type: Haptics.AndroidHaptics.Reject });
  });

  it('plays the brief map with the iOS feedback generators', () => {
    expect(hapticCall('selection', 'ios')).toEqual({ api: 'selection' });
    expect(hapticCall('tick', 'ios')).toEqual({ api: 'selection' });
    expect(hapticCall('light', 'ios')).toEqual({ api: 'impact', style: Haptics.ImpactFeedbackStyle.Light });
    expect(hapticCall('medium', 'ios')).toEqual({ api: 'impact', style: Haptics.ImpactFeedbackStyle.Medium });
    expect(hapticCall('success', 'ios')).toEqual({ api: 'notification', type: Haptics.NotificationFeedbackType.Success });
    expect(hapticCall('warning', 'ios')).toEqual({ api: 'notification', type: Haptics.NotificationFeedbackType.Warning });
    expect(hapticCall('error', 'ios')).toEqual({ api: 'notification', type: Haptics.NotificationFeedbackType.Error });
  });

  it('never uses an Android-only call on iOS (it does nothing there)', () => {
    const kinds: HapticKind[] = ['selection', 'tick', 'light', 'medium', 'success', 'warning', 'error'];
    for (const kind of kinds) expect(hapticCall(kind, 'ios').api).not.toBe('android');
  });
});

describe('haptics', () => {
  it('never throws, even when the native call fails', () => {
    const spy = jest.spyOn(Haptics, 'notificationAsync').mockRejectedValue(new Error('no engine'));
    expect(() => haptics.error()).not.toThrow();
    spy.mockRestore();
  });
});

describe('caretColors', () => {
  it('keeps the Android caret, handles and 30% highlight', () => {
    expect(caretColors('#c89c65', 'android')).toEqual({
      cursorColor: '#c89c65',
      selectionHandleColor: '#c89c65',
      selectionColor: 'rgba(200,156,101,0.3)',
    });
  });

  it('gives iOS one solid tint (the caret takes the selection colour there)', () => {
    expect(caretColors('#c89c65', 'ios')).toEqual({ selectionColor: '#c89c65' });
  });
});
