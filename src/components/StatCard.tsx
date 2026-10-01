import type { LucideIcon } from 'lucide-react-native';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/design/theme';
import { radius, space, type Tone } from '@/design/tokens';
import type { TypeVariant } from '@/design/typography';
import { formatCount } from '@/lib/format';

import { AnimatedNumber } from './AnimatedNumber';
import { Badge } from './Badge';
import { Card } from './Card';
import { Icon } from './Icon';
import { Skeleton, SkeletonGroup } from './Skeleton';
import { Text } from './Text';

export type StatTrend = {
  direction: 'up' | 'down' | 'flat';
  /** Text, so the colour is never the only signal ("Up 12%", "Down $40"). */
  label: string;
  /** Default: up ok, down warn, flat muted. Pass it when down is good (refunds, churn). */
  tone?: Tone;
};

export type StatCardProps = {
  /** Mono eyebrow ("REVENUE THIS MONTH"). */
  label: string;
  /**
   * A number counts up from its previous value through `format`; a string shows
   * as is. Null, undefined or NaN means the figure is missing: "Not available",
   * never a zero.
   */
  value: number | string | null | undefined;
  /** Number to text, e.g. `(c) => formatCents(c)` for money in cents. Default "1,204". */
  format?: (value: number) => string;
  /** A line under the number ("12 paid invoices"). */
  sub?: ReactNode;
  icon?: LucideIcon;
  trend?: StatTrend | null;
  loading?: boolean;
  /** md: 28sp number (grids); lg: 40sp (default); xl: 56sp hero. */
  size?: 'md' | 'lg' | 'xl';
  /** Gold number, for the one figure that matters most on a screen. */
  emphasis?: boolean;
  countFromZero?: boolean;
  onPress?: () => void;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const NUMBER_VARIANT: Record<NonNullable<StatCardProps['size']>, TypeVariant> = { md: 'number', lg: 'kpi', xl: 'kpiLarge' };
const NUMBER_HEIGHT: Record<NonNullable<StatCardProps['size']>, number> = { md: 26, lg: 38, xl: 52 };
const TREND_ICON: Record<StatTrend['direction'], LucideIcon> = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus };
const TREND_TONE: Record<StatTrend['direction'], Tone> = { up: 'ok', down: 'warn', flat: 'muted' };

/** A KPI on a card: eyebrow, a big confident number, a sub line, an optional icon and trend chip. */
export function StatCard({
  label,
  value,
  format,
  sub,
  icon,
  trend,
  loading = false,
  size = 'lg',
  emphasis = false,
  countFromZero,
  onPress,
  accessibilityHint,
  style,
  testID,
}: StatCardProps) {
  const { tones } = useTheme();
  const variant = NUMBER_VARIANT[size];
  const missing = value == null || (typeof value === 'number' && !Number.isFinite(value)) || value === '';

  const numberNode = loading ? (
    // Holds the card's height before the skeleton appears (after showAfterMs), so nothing jumps.
    <View style={{ minHeight: NUMBER_HEIGHT[size] + 11 + space[3] + space[2] }}>
      <SkeletonGroup style={styles.loading}>
        <Skeleton width="55%" height={NUMBER_HEIGHT[size]} />
        <Skeleton width="40%" height={11} />
      </SkeletonGroup>
    </View>
  ) : missing ? (
    <Text variant="small" color="ink4" style={styles.missing}>
      Not available
    </Text>
  ) : typeof value === 'number' ? (
    <AnimatedNumber value={value} format={format} variant={variant} color={emphasis ? 'gold' : 'ink'} countFromZero={countFromZero} />
  ) : (
    <Text variant={variant} color={emphasis ? 'gold' : 'ink'} tabular numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
  );

  const shownValue = loading ? 'Loading' : missing ? 'Not available' : typeof value === 'number' ? (format ?? formatCount)(value) : value;
  const subText = typeof sub === 'string' ? sub : '';
  const a11y = [label, shownValue, trend?.label, subText].filter(Boolean).join(', ');

  return (
    <Card onPress={onPress} accessibilityLabel={a11y} accessibilityHint={accessibilityHint} style={style} testID={testID}>
      <View style={styles.top} importantForAccessibility="no-hide-descendants">
        <Text variant="eyebrow" numberOfLines={1} style={styles.label}>
          {label}
        </Text>
        {icon ? (
          <View style={[styles.iconCircle, { backgroundColor: tones.neutral.bg }]}>
            <Icon icon={icon} size={16} color="ink3" />
          </View>
        ) : null}
      </View>
      <View style={styles.number} importantForAccessibility="no-hide-descendants">
        {numberNode}
      </View>
      {!loading && (trend || sub) ? (
        <View style={styles.bottom} importantForAccessibility="no-hide-descendants">
          {trend ? (
            <Badge label={trend.label} tone={trend.tone ?? TREND_TONE[trend.direction]} icon={TREND_ICON[trend.direction]} />
          ) : null}
          {typeof sub === 'string' ? (
            <Text variant="small" color="ink3" numberOfLines={2} style={styles.sub}>
              {sub}
            </Text>
          ) : (
            sub
          )}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2], minHeight: 28 },
  label: { flex: 1 },
  iconCircle: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  number: { marginTop: space[2] },
  loading: { gap: space[3], paddingVertical: space[1] },
  missing: { paddingVertical: space[2] },
  bottom: { marginTop: space[3], flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  sub: { flexShrink: 1 },
});
