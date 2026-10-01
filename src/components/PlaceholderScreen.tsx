import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';

import { IconButton } from './IconButton';
import { Text } from './Text';

/** Temporary screen body for routes whose module is not built yet. */
export function PlaceholderScreen({ title, headerRight, back }: { title: string; headerRight?: ReactNode; back?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 4, paddingHorizontal: 16 }}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {back ? <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} /> : <View />}
        {headerRight}
      </View>
      <Text variant="eyebrow">Coming in a later phase</Text>
      <Text variant="largeTitle" style={{ marginTop: 8 }}>
        {title}
      </Text>
    </View>
  );
}
