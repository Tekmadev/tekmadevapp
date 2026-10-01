import { ChevronRight } from 'lucide-react-native';
import { Fragment } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { layout, space, type Tone } from '@/design/tokens';

import { Divider } from './Divider';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type MetricColumn = {
  /** Short header ("Visits", "Leads", "Paid"). */
  label: string;
  /** Column width in dp (default 76). */
  width?: number;
};

export type MetricRow = {
  id: string;
  title: string;
  subtitle?: string;
  /** One formatted value per column ("$1,204", "12"). Missing shows a muted "n/a", never 0. */
  values: readonly (string | null | undefined)[];
  /** Optional tone per value (a negative change, an overdue count). */
  tones?: readonly (Tone | undefined)[];
  onPress?: () => void;
};

export type MetricRowsProps = {
  columns: readonly MetricColumn[];
  rows: readonly MetricRow[];
  /** Header over the first column ("Page", "Source"). */
  titleLabel?: string;
  /** The eyebrow header row (default true). */
  header?: boolean;
  /** Side padding (default 16; 0 inside a padded Card). */
  inset?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const COLUMN = 76;
const MISSING = 'n/a';

/**
 * The phone version of a data table: a name on the left and two or three key
 * numbers right aligned in tabular figures. Everything else lives behind a tap.
 */
export function MetricRows({ columns, rows, titleLabel, header = true, inset = layout.gutter, style, testID }: MetricRowsProps) {
  const tappable = rows.some((r) => r.onPress);
  return (
    <View testID={testID} style={style}>
      {header ? (
        <View style={[styles.row, styles.headerRow, { paddingHorizontal: inset }]} importantForAccessibility="no-hide-descendants">
          <Text variant="eyebrow" numberOfLines={1} style={styles.title}>
            {titleLabel ?? ''}
          </Text>
          {columns.map((c) => (
            <Text key={c.label} variant="eyebrow" align="right" numberOfLines={1} style={{ width: c.width ?? COLUMN }}>
              {c.label}
            </Text>
          ))}
          {tappable ? <View style={styles.chevronSpace} /> : null}
        </View>
      ) : null}
      {rows.map((row, i) => (
        <Fragment key={row.id}>
          {header || i > 0 ? <Divider inset={inset} insetEnd={inset} /> : null}
          <MetricRowView row={row} columns={columns} inset={inset} tappable={tappable} />
        </Fragment>
      ))}
    </View>
  );
}

function MetricRowView({ row, columns, inset, tappable }: { row: MetricRow; columns: readonly MetricColumn[]; inset: number; tappable: boolean }) {
  const label = [
    row.title,
    row.subtitle,
    ...columns.map((c, i) => `${c.label} ${row.values[i] ?? 'not available'}`),
  ]
    .filter(Boolean)
    .join(', ');

  const body = (
    <View style={[styles.row, styles.dataRow, { paddingHorizontal: inset }]}>
      <View style={styles.title}>
        <Text variant="body" numberOfLines={1}>
          {row.title}
        </Text>
        {row.subtitle ? (
          <Text variant="small" color="ink3" numberOfLines={1}>
            {row.subtitle}
          </Text>
        ) : null}
      </View>
      {columns.map((c, i) => {
        const v = row.values[i];
        const missing = v == null || v === '';
        return (
          <Text
            key={c.label}
            variant="bodyStrong"
            tabular
            align="right"
            numberOfLines={1}
            color={missing ? 'ink4' : undefined}
            tone={missing ? undefined : row.tones?.[i]}
            style={{ width: c.width ?? COLUMN }}
          >
            {missing ? MISSING : v}
          </Text>
        );
      })}
      {tappable ? (
        <View style={styles.chevronSpace}>{row.onPress ? <Icon icon={ChevronRight} size={16} color="ink4" /> : null}</View>
      ) : null}
    </View>
  );

  if (row.onPress) {
    return (
      <PressableScale onPress={row.onPress} pressedScale={0.985} accessibilityLabel={label} accessibilityHint="Opens the details">
        {body}
      </PressableScale>
    );
  }
  return (
    <View accessible accessibilityLabel={label}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  headerRow: { paddingBottom: space[2] },
  dataRow: { minHeight: 56, paddingVertical: space[2] },
  title: { flex: 1, minWidth: 0 },
  chevronSpace: { width: 16, alignItems: 'flex-end' },
});
