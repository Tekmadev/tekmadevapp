import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { layout, space } from '@/design/tokens';

import { PillButton } from './parts/PillButton';
import { Text } from './Text';

export type SectionAction = {
  /** Default "View all". */
  label?: string;
  onPress: () => void;
  accessibilityHint?: string;
};

export type SectionProps = {
  /** Mono eyebrow above the title. */
  eyebrow?: string;
  title?: string;
  /** A gold text link on the right of the title ("View all"). */
  action?: SectionAction;
  /** Anything else for the right side (a count, a small control). Wins over `action`. */
  right?: ReactNode;
  children?: ReactNode;
  /** Space below the section, before the next one (default 28dp). */
  spacing?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A titled block of a screen: eyebrow, 22sp headline, optional "View all", then the content. */
export function Section({ eyebrow, title, action, right, children, spacing = layout.sectionGap, style, testID }: SectionProps) {
  const hasHeader = Boolean(eyebrow || title || action || right);
  return (
    <View testID={testID} style={[{ marginBottom: spacing }, style]}>
      {hasHeader ? (
        <View style={styles.header}>
          <View style={styles.titles}>
            {eyebrow ? <Text variant="eyebrow">{eyebrow}</Text> : null}
            {title ? (
              <Text variant="headlineSmall" accessibilityRole="header" style={eyebrow ? styles.titleAfterEyebrow : null}>
                {title}
              </Text>
            ) : null}
          </View>
          {right ??
            (action ? (
              <PillButton
                variant="link"
                label={action.label ?? 'View all'}
                onPress={action.onPress}
                accessibilityHint={action.accessibilityHint}
                style={styles.action}
              />
            ) : null)}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space[3],
    marginBottom: space[3],
  },
  titles: { flex: 1 },
  titleAfterEyebrow: { marginTop: space[1] },
  action: { marginBottom: 2 },
});
