import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/design/theme';
import { layout } from '@/design/tokens';

export type DividerProps = {
  /**
   * Left inset: `true` for the 16dp gutter, a number to line up with text after a
   * leading icon (ListRow uses 72), nothing for full width.
   */
  inset?: boolean | number;
  /** Inset on the right too (dividers inside cards). */
  insetEnd?: boolean | number;
  /** lineStrong instead of line, for separating groups rather than rows. */
  strong?: boolean;
  style?: StyleProp<ViewStyle>;
};

const toInset = (v: boolean | number | undefined) => (v === true ? layout.gutter : typeof v === 'number' ? v : 0);

/** A hairline in the line colour. Decorative: TalkBack skips it. */
export function Divider({ inset, insetEnd, strong = false, style }: DividerProps) {
  const { colors } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={[
        styles.line,
        { backgroundColor: strong ? colors.lineStrong : colors.line, marginLeft: toInset(inset), marginRight: toInset(insetEnd) },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  // 1dp like card borders: a single physical pixel of an 8% line all but disappears on dense screens.
  line: { height: 1 },
});
