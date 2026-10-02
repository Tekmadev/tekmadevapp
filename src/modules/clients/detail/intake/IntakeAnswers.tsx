import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { Text } from '@/components/Text';
import { layout, space } from '@/design/tokens';

import type { IntakeAnswerGroup } from './logic';

const NOT_ANSWERED = 'Not answered';

/**
 * The intake's answers, one card per schema section ("Your business",
 * "Services"...), each field as its label over the answer. Long text keeps
 * its line breaks and can be selected to copy. Unanswered fields say so in
 * a muted colour, never an invented value.
 */
export function IntakeAnswers({ groups }: { groups: readonly IntakeAnswerGroup[] }) {
  return (
    <View style={styles.groups}>
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <View style={styles.groupHead}>
            <Text variant="eyebrow" accessibilityRole="header" style={styles.groupTitle}>
              {group.title}
            </Text>
            <Text
              variant="caption"
              color="ink4"
              tabular
              accessibilityLabel={`${group.answered} of ${group.rows.length} answered`}
            >{`${group.answered}/${group.rows.length}`}</Text>
          </View>
          <Card padded={false}>
            {group.rows.map((row, i) => (
              <Fragment key={row.key}>
                {i > 0 ? <Divider inset insetEnd /> : null}
                <View style={styles.row} accessible accessibilityLabel={`${row.label}, ${row.value ?? NOT_ANSWERED}`}>
                  <Text variant="small" color="ink3">
                    {row.label}
                  </Text>
                  <Text variant="body" color={row.value === null ? 'ink4' : 'ink'} selectable={row.value !== null}>
                    {row.value ?? NOT_ANSWERED}
                  </Text>
                </View>
              </Fragment>
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  groups: { gap: space[5] },
  group: { gap: space[2] },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  groupTitle: { flexShrink: 1 },
  row: { minHeight: layout.minTouch, gap: space[1], paddingVertical: space[3], paddingHorizontal: layout.gutter },
});
