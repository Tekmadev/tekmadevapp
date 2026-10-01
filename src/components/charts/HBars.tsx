import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { springs, staggerDelay, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space, withAlpha } from '@/design/tokens';

import { formatCount } from './scale';

export type HBarDatum = {
  label: string;
  value: number;
  /** Optional leading emoji or flag ("🇨🇦"). */
  leading?: string;
  /** Stable key when labels can repeat. Defaults to the label. */
  key?: string;
};

export type HBarsProps = {
  /** Rows in the order the API ranked them (not re-sorted here). */
  data: readonly HBarDatum[];
  /** Rows shown (default 10). */
  limit?: number;
  formatValue?: (value: number) => string;
  /** Makes each row a button (e.g. open the page's own stats). */
  onPressRow?: (row: HBarDatum, index: number) => void;
  /** Where a long label is cut: 'middle' keeps the end of a path or URL readable. Default 'tail'. */
  ellipsize?: 'tail' | 'middle';
  testID?: string;
};

const ROW_HEIGHT = 40;
/** Rows with a value but a tiny share still show a sliver, so "small" never reads as "zero". */
const MIN_SHARE = 0.015;

/**
 * Top lists (pages, countries, referrers, links): a soft gold bar behind each
 * row, sized against the largest value shown, growing in from zero on a soft
 * spring with the list stagger. The label stays on one line and the value is
 * right-aligned in tabular figures so columns of numbers line up.
 * Empty data renders nothing (the caller shows "No data yet.").
 */
export function HBars({ data, limit = 10, formatValue = formatCount, onPressRow, ellipsize = 'tail', testID }: HBarsProps) {
  const rows = data.slice(0, limit);
  if (rows.length === 0) return null;
  const max = rows.reduce((m, r) => (r.value > m ? r.value : m), 0);
  return (
    <View testID={testID} style={styles.list}>
      {rows.map((row, i) => {
        const share = max > 0 && row.value > 0 ? Math.max(row.value / max, MIN_SHARE) : 0;
        return (
          <BarRow key={row.key ?? row.label} index={i} share={share} onPress={onPressRow ? () => onPressRow(row, i) : undefined} label={`${row.label}, ${formatValue(row.value)}`}>
            {row.leading ? (
              <Text variant="body" style={styles.leading} accessible={false}>
                {row.leading}
              </Text>
            ) : null}
            <Text variant="small" numberOfLines={1} ellipsizeMode={ellipsize} style={styles.label}>
              {row.label}
            </Text>
            <Text variant="label" tabular style={styles.value}>
              {formatValue(row.value)}
            </Text>
          </BarRow>
        );
      })}
    </View>
  );
}

type BarRowProps = {
  index: number;
  share: number;
  label: string;
  onPress?: () => void;
  children: ReactNode;
};

function BarRow({ index, share, label, onPress, children }: BarRowProps) {
  const { colors, isDark } = useTheme();
  const reduceMotion = useReduceMotion();
  const width = useSharedValue(reduceMotion ? share : 0);

  // Grows from zero on mount; later changes (a new range) move from the current width.
  useEffect(() => {
    if (reduceMotion) {
      width.set(share);
      return;
    }
    width.set(withDelay(staggerDelay(index), withSpring(share, springs.soft)));
  }, [share, index, reduceMotion, width]);

  const barStyle = useAnimatedStyle(() => ({ width: `${Math.min(Math.max(width.get(), 0), 1) * 100}%` as const }));

  const content = (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.bar, { backgroundColor: withAlpha(colors.gold, isDark ? 0.2 : 0.16) }, barStyle]}
      />
      <View style={styles.content}>{children}</View>
    </>
  );

  if (onPress) {
    return (
      <PressableScale onPress={onPress} accessibilityLabel={label} hitSlop={4} style={styles.row}>
        {content}
      </PressableScale>
    );
  }
  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[1] },
  row: { minHeight: ROW_HEIGHT, justifyContent: 'center' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.sm },
  content: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], paddingVertical: space[2] },
  leading: { width: 22, textAlign: 'center' },
  label: { flex: 1 },
  value: { marginLeft: space[2] },
});
