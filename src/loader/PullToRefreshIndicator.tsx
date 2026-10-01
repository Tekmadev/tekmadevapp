import type { SharedValue } from 'react-native-reanimated';
import { View } from 'react-native';

export type PullToRefreshIndicatorProps = {
  /**
   * Pull progress driven by the Screen gesture on the UI thread: 0 = nothing,
   * 1 = the trigger point (logo locks together, light haptic tick), >1 = overpull.
   */
  pull: SharedValue<number>;
  /** True from release until the data lands (beat), then it shrinks away with a spring. */
  refreshing: boolean;
  size?: number;
};

/** STUB (replaced by the loader work): scattered pieces pulled together in proportion to the pull. */
export function PullToRefreshIndicator({ size = 36 }: PullToRefreshIndicatorProps) {
  return <View style={{ width: size, height: size }} />;
}
