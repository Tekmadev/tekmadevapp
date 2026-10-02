import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { ClientRow, ClientsMeta } from '@/api/schemas/clients';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX } from '@/design/motion';
import { layout, space } from '@/design/tokens';

import { STATUS_TONES, statusLabel } from './labels';
import { attentionBadges, goLiveCell, guaranteeCell, rowSpokenLabel, stageCell, tasksCell, type CellText } from './rowFormat';

export type ClientRowCardProps = {
  row: ClientRow;
  meta: ClientsMeta | undefined;
  onPress: (row: ClientRow) => void;
  /** Position in the list: the first rows are pulled into place with a stagger. */
  index: number;
  /** No enter animation (reduced motion, or rows that arrive with a later page). */
  still: boolean;
};

function Cell({ label, value, children }: { label: string; value: CellText; children?: ReactNode }) {
  return (
    <View style={styles.cell}>
      <Text variant="eyebrow" numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.cellValue}>
        <Text
          variant="small"
          color={value.tone === 'faint' ? 'ink4' : value.tone === 'signal' ? 'signal' : 'ink2'}
          weight={value.tone === 'signal' ? '600' : undefined}
          tabular
          numberOfLines={1}
          style={styles.cellText}
        >
          {value.text}
        </Text>
        {children}
      </View>
    </View>
  );
}

/**
 * One client on the Clients list (brief 8.5): name and "Test", plan and
 * strategist, status, then stage (+ Blocked), open tasks, go-live and the
 * guarantee. The whole card is one button with one spoken summary.
 */
export const ClientRowCard = memo(function ClientRowCard({ row, meta, onPress, index, still }: ClientRowCardProps) {
  const stage = stageCell(meta, row);
  const tasks = tasksCell(row);
  const goLive = goLiveCell(row.goLive);
  const guarantee = guaranteeCell(row.guarantee);
  const attention = attentionBadges(row);
  const planLine = [row.planName ?? 'No plan yet', row.strategist].filter(Boolean).join(' · ');

  return (
    <Animated.View entering={still || index >= STAGGER_MAX ? undefined : enterPull(index)} style={styles.wrap}>
      <Card
        onPress={() => onPress(row)}
        accessibilityLabel={rowSpokenLabel(meta, row)}
        accessibilityHint="Opens the client"
      >
        <View style={styles.top} importantForAccessibility="no-hide-descendants">
          <View style={styles.name}>
            <Text variant="title" numberOfLines={2} style={styles.nameText}>
              {row.businessName}
            </Text>
            {row.isTest ? <Badge label="Test" tone="neutral" /> : null}
          </View>
          <Badge label={statusLabel(meta, row.status)} tone={STATUS_TONES[row.status]} dot />
        </View>
        <Text variant="small" color="ink3" numberOfLines={1} style={styles.plan} importantForAccessibility="no-hide-descendants">
          {planLine}
        </Text>

        <View style={styles.grid} importantForAccessibility="no-hide-descendants">
          <Cell label="Stage" value={stage}>
            {row.blocked ? <Badge label="Blocked" tone="signal" /> : null}
          </Cell>
          <Cell label="Open tasks" value={tasks} />
          <Cell label="Go-live" value={goLive} />
          <Cell label="Guarantee" value={guarantee}>
            {guarantee.badge ? <Badge label={guarantee.badge.label} tone={guarantee.badge.tone} /> : null}
          </Cell>
        </View>

        {attention.length > 0 ? (
          <View style={styles.attention} importantForAccessibility="no-hide-descendants">
            {attention.map((label) => (
              <Badge key={label} label={label} tone="gold" />
            ))}
          </View>
        ) : null}
      </Card>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.gutter },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  name: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  nameText: { flexShrink: 1 },
  plan: { marginTop: space[1] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space[3], columnGap: space[3], marginTop: space[4] },
  // Two per row; a long value wraps its badge under it rather than clipping.
  cell: { flexBasis: '46%', flexGrow: 1, gap: space[1] },
  cellValue: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2], minHeight: 22 },
  cellText: { flexShrink: 1 },
  attention: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[3] },
});
