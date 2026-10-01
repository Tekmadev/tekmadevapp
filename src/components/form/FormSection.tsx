import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/Text';
import { space } from '@/design/tokens';

export type FormSectionProps = {
  /** Eyebrow above the fields ("SEARCH", "GUARANTEE"); written in sentence case, shown uppercase. */
  title?: string;
  /** One line under the title (what this group is for). */
  description?: string;
  /** Right side of the title row (a small link or switch). */
  action?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Groups related fields under an eyebrow title with the form rhythm: 16dp
 * between fields. Stack sections with the screen's section gap (24 to 32dp).
 */
export function FormSection({ title, description, action, children, style, testID }: FormSectionProps) {
  const hasHead = !!title || !!description || action != null;
  return (
    <View style={[styles.section, style]} testID={testID}>
      {hasHead ? (
        <View style={styles.head}>
          {title || action != null ? (
            <View style={styles.titleRow}>
              {title ? (
                <Text variant="eyebrow" accessibilityRole="header" style={styles.title}>
                  {title}
                </Text>
              ) : (
                <View style={styles.title} />
              )}
              {action}
            </View>
          ) : null}
          {description ? (
            <Text variant="small" color="ink3">
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.fields}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space[3],
  },
  head: {
    gap: space[1],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 20,
  },
  title: {
    flex: 1,
  },
  fields: {
    gap: space[4],
  },
});
