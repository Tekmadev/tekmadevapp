import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { space } from '@/design/tokens';

/** An eyebrow over a block of a detail sheet ("CUSTOMER", "CANCELLATION"). */
export function DetailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text variant="eyebrow" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[1] },
});
