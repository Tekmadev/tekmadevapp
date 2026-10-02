import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { ToolSubmission } from '@/api/schemas/tools';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { relativeTime } from '@/lib/dates';

import {
  businessLine,
  closeRateCell,
  deliveredBadges,
  displayName,
  emailLine,
  leakCell,
  newsletterBadge,
  replySpeedCell,
  rowSpokenLabel,
  type Cell as CellValue,
} from '../logic';

export type SubmissionRowCardProps = {
  row: ToolSubmission;
  onPress: (row: ToolSubmission) => void;
  /** Position in the list: the first rows are pulled into place with a stagger. */
  index: number;
  /** No enter animation (reduced motion, or rows that arrive with a later page). */
  still: boolean;
};

function Cell({ label, value, strong = false, children }: { label: string; value?: CellValue; strong?: boolean; children?: ReactNode }) {
  return (
    <View style={styles.cell}>
      <Text variant="eyebrow" numberOfLines={2}>
        {label}
      </Text>
      <View style={styles.cellValue}>
        {value ? (
          <Text
            variant="small"
            color={value.faint ? 'ink4' : strong ? 'ink' : 'ink2'}
            weight={strong && !value.faint ? '600' : undefined}
            tabular
            numberOfLines={2}
            style={styles.cellText}
          >
            {value.text}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  );
}

/**
 * One free tool submission (brief 8.7): the tool, who asked (name, business,
 * email), then the leak per month, the close rate "20% → 35%", the reply
 * speed, the newsletter answer and what was delivered (Email, CRM). The whole
 * card is one button with one spoken summary; it opens the submission.
 */
export const SubmissionRowCard = memo(function SubmissionRowCard({ row, onPress, index, still }: SubmissionRowCardProps) {
  const business = businessLine(row);
  const email = emailLine(row);
  const newsletter = newsletterBadge(row.newsletter);
  const [mail, crm] = deliveredBadges(row.delivered);

  return (
    <Animated.View entering={still || index >= STAGGER_MAX ? undefined : enterPull(index)} style={styles.wrap}>
      <Card onPress={() => onPress(row)} accessibilityLabel={rowSpokenLabel(row)} accessibilityHint="Opens the submission">
        <View importantForAccessibility="no-hide-descendants">
          <View style={styles.top}>
            <Text variant="eyebrow" numberOfLines={2} style={styles.tool}>
              {row.toolName}
            </Text>
            <Text variant="small" color="ink4" numberOfLines={1} style={styles.time}>
              {relativeTime(row.createdAt)}
            </Text>
          </View>
          <Text variant="title" numberOfLines={2} style={styles.name}>
            {displayName(row)}
          </Text>
          {business ? (
            <Text variant="small" color="ink2" numberOfLines={1} style={styles.line}>
              {business}
            </Text>
          ) : null}
          {email ? (
            <Text variant="small" color="ink3" numberOfLines={1} style={styles.line}>
              {email}
            </Text>
          ) : null}

          <View style={styles.grid}>
            <Cell label="Leak per month" value={leakCell(row)} strong />
            <Cell label="Close rate" value={closeRateCell(row)} />
            <Cell label="Reply speed" value={replySpeedCell(row)} />
            <Cell label="Newsletter">
              <Badge label={newsletter.label} tone={newsletter.tone} />
            </Cell>
          </View>

          <View style={styles.delivered}>
            <Text variant="eyebrow" style={styles.deliveredLabel}>
              Delivered
            </Text>
            <Badge label={mail.label} tone={mail.tone} />
            <Badge label={crm.label} tone={crm.tone} />
          </View>
        </View>
      </Card>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.gutter },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  tool: { flex: 1 },
  time: { flexShrink: 0 },
  name: { marginTop: space[2] },
  line: { marginTop: space[1] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space[3], columnGap: space[3], marginTop: space[4] },
  // Two per row; a long value wraps under its label rather than clipping.
  cell: { flexBasis: '46%', flexGrow: 1, gap: space[1] },
  cellValue: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2], minHeight: 22 },
  cellText: { flexShrink: 1 },
  delivered: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2], marginTop: space[4] },
  deliveredLabel: { marginRight: space[1] },
});
