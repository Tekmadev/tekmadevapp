import { Info, ShieldOff } from 'lucide-react-native';
import { Fragment } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { CrmInspect } from '@/api/schemas/crm';
import type { ConsentEvent, EmailMeta } from '@/api/schemas/email';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';
import { formatDateTime } from '@/lib/dates';

import { compareRows, consentLine, type CompareRow } from '../logic';

/**
 * "This site" vs "CRM" for one address: can be emailed (with a "disagree"
 * badge when the sides differ), status, consented, tags, last synced and the
 * contact id. Each row puts its label on top and the two values side by side,
 * so long tags and ids wrap inside their own column at every font scale.
 */
export function Comparison({ result, now }: { result: CrmInspect; now: Date }) {
  const rows = compareRows(result.site, result.crm, now);
  return (
    <Card padded={false}>
      <View style={styles.headRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text variant="eyebrow" style={styles.col}>
          This site
        </Text>
        <Text variant="eyebrow" style={styles.col}>
          CRM
        </Text>
      </View>
      <Divider />
      {rows.map((row, i) => (
        <Fragment key={row.key}>
          {i > 0 ? <Divider inset insetEnd /> : null}
          <CompareLine row={row} />
        </Fragment>
      ))}
    </Card>
  );
}

function CompareLine({ row }: { row: CompareRow }) {
  const crmText = row.crm ?? 'Not found';
  const spoken = `${row.label}. This site: ${row.site}. CRM: ${crmText}.${row.disagree ? ' They disagree.' : ''}`;
  return (
    <View style={styles.line} accessible accessibilityLabel={spoken}>
      <View style={styles.labelRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text variant="small" color="ink3">
          {row.label}
        </Text>
        {row.disagree ? <Badge label="disagree" tone="warn" /> : null}
      </View>
      <View style={styles.values} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text variant={row.mono ? 'mono' : 'body'} style={styles.col} selectable>
          {row.site}
        </Text>
        <Text variant={row.mono ? 'mono' : 'body'} color={row.crm === null ? 'ink4' : undefined} style={styles.col} selectable>
          {crmText}
        </Text>
      </View>
    </View>
  );
}

/** A quiet note card: the not-found reason, or the erased note. */
export function InspectNote({ text, kind, style }: { text: string; kind: 'info' | 'erased'; style?: StyleProp<ViewStyle> }) {
  return (
    <Card style={[styles.note, style]} accessibilityLabel={text}>
      <Icon icon={kind === 'erased' ? ShieldOff : Info} size={18} color="ink3" />
      <Text variant="body" color="ink2" style={styles.noteText}>
        {text}
      </Text>
    </Card>
  );
}

type EmailMetaLike = Partial<Pick<EmailMeta, 'consentEvents' | 'unsubscribeSources' | 'subscriberSources' | 'unsubscribeReasons'>> | undefined;

/** The consent history, newest first: what happened, where it came from, the policy version, when. */
export function ConsentHistory({ events, meta, now }: { events: readonly ConsentEvent[]; meta: EmailMetaLike; now: Date }) {
  if (events.length === 0) {
    return (
      <Card>
        <Text variant="body" color="ink3">
          No consent history for this address.
        </Text>
      </Card>
    );
  }
  return (
    <Card padded={false}>
      {events.map((event, i) => {
        const line = consentLine(meta, event);
        const when = formatDateTime(event.at, now);
        return (
          <Fragment key={`${event.at}-${event.event}-${i}`}>
            {i > 0 ? <Divider inset insetEnd /> : null}
            <View style={styles.event} accessible accessibilityLabel={[line.title, line.detail, when].filter(Boolean).join('. ')}>
              <View style={styles.eventTop} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <Text variant="bodyStrong" style={styles.flex}>
                  {line.title}
                </Text>
                <Text variant="small" color="ink4" tabular>
                  {when}
                </Text>
              </View>
              {line.detail ? (
                <Text variant="small" color="ink3" importantForAccessibility="no">
                  {line.detail}
                </Text>
              ) : null}
            </View>
          </Fragment>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] },
  col: { flex: 1 },
  line: { paddingHorizontal: space[4], paddingVertical: space[3], gap: space[1] },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 20 },
  values: { flexDirection: 'row', gap: space[3] },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  noteText: { flex: 1 },
  event: { paddingHorizontal: space[4], paddingVertical: space[3], gap: 2 },
  eventTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  flex: { flex: 1 },
});
