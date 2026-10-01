import { View } from 'react-native';

/** STUB (replaced by the loader work): 14 to 16dp row-level loading. */
export function InlineLoader({ size = 16 }: { size?: number; color?: string }) {
  return <View style={{ width: size, height: size }} />;
}
