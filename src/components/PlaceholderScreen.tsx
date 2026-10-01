import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';

import { Text } from './Text';

/** Temporary screen body for routes whose module is not built yet. */
export function PlaceholderScreen({ title }: { title: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 24, paddingHorizontal: 16 }}>
      <Text variant="eyebrow">Coming in a later phase</Text>
      <Text variant="largeTitle" style={{ marginTop: 8 }}>
        {title}
      </Text>
    </View>
  );
}
