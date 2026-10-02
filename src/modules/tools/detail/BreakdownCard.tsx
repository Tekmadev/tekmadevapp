import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ToolResultLine } from '@/api/schemas/tools';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { layout, space } from '@/design/tokens';

import { isFigure } from '../logic';

const NO_RESULT = 'Nothing was worked out for this submission.';

function Line({ line }: { line: ToolResultLine }) {
  const { tones } = useTheme();
  const strong = Boolean(line.emphasis);
  const figure = isFigure(line.value);
  return (
    <View
      accessible
      accessibilityLabel={`${line.label}, ${line.value}`}
      style={[styles.line, figure ? styles.inline : styles.stacked, strong ? { backgroundColor: tones.gold.bg } : null]}
    >
      <Text variant={strong ? 'label' : 'small'} color={strong ? 'ink' : 'ink3'} style={figure ? styles.label : null}>
        {line.label}
      </Text>
      <Text
        variant={strong ? 'title' : 'body'}
        tone={strong ? 'gold' : undefined}
        weight={strong ? '700' : undefined}
        tabular={figure}
        align={figure ? 'right' : 'left'}
        style={figure ? styles.value : null}
      >
        {line.value}
      </Text>
    </View>
  );
}

/**
 * The computed result, line by line in the order the tool works it out (the
 * same lines the person was emailed). Values are the server's display text,
 * so the numbers match the email exactly. The headline lines (the monthly
 * leak, the better close rate) sit on a gold tint in bold gold. A sentence
 * ("Not worked out: ...") wraps under its label instead of squeezing right.
 */
export function BreakdownCard({ lines }: { lines: readonly ToolResultLine[] }) {
  if (lines.length === 0) {
    return (
      <Card>
        <EmptyState compact message={NO_RESULT} />
      </Card>
    );
  }
  return (
    <Card padded={false} style={styles.card}>
      {lines.map((line, i) => (
        <Fragment key={`${line.label}-${i}`}>
          {i > 0 && !line.emphasis && !lines[i - 1].emphasis ? <Divider inset insetEnd /> : null}
          <Line line={line} />
        </Fragment>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  line: { minHeight: layout.minTouch, paddingHorizontal: layout.gutter, paddingVertical: space[3] },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  stacked: { gap: space[1], justifyContent: 'center' },
  label: { flex: 1 },
  value: { flexShrink: 0, maxWidth: '55%' },
});
