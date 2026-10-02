import * as Clipboard from 'expo-clipboard';
import { Copy } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { Agreement } from '@/api/schemas/clients';
import type { Meta } from '@/api/schemas/meta';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';
import { toDate } from '@/lib/dates';
import { notice } from '@/lib/notice';

import { agreementLine, shortHash } from './files/agreementText';
import { RecordCard, RecordHead, RecordRow } from './files/records';
import { AGREEMENT_STATUSES, tonedFrom, useMeta } from './files/shared';
import type { SectionProps } from './types';

/** Newest activity first: accepted, else sent. */
function newestFirst(a: Agreement, b: Agreement) {
  const at = (x: Agreement) => toDate(x.acceptedAt ?? x.sentAt)?.getTime() ?? 0;
  return at(b) - at(a) || b.version - a.version;
}

async function copyHash(hash: string) {
  try {
    await Clipboard.setStringAsync(hash);
    notice.ok('Copied.');
  } catch {
    notice.err('Could not copy that.');
  }
}

/**
 * Agreements (brief 8.5, section 6), read only: each version the client was
 * sent, who accepted it and when, and the hash of the exact text they accepted.
 */
export function AgreementsSection({ bundle }: SectionProps) {
  const meta = useMeta();
  const agreements = [...bundle.agreements].sort(newestFirst);

  return (
    <Section title="Agreements">
      {agreements.length === 0 ? (
        <Card padded={false}>
          <EmptyState compact message="No agreements." />
        </Card>
      ) : (
        <RecordCard items={agreements} keyOf={(a) => a.id} render={(a) => <AgreementRow agreement={a} meta={meta} />} />
      )}
    </Section>
  );
}

function AgreementRow({ agreement: a, meta }: { agreement: Agreement; meta: Meta | undefined }) {
  const { colors } = useTheme();
  const status = tonedFrom(meta?.agreementStatuses, AGREEMENT_STATUSES, a.status);
  const line = agreementLine(a);
  const hash = shortHash(a.contentHash);

  return (
    <RecordRow>
      <View accessible accessibilityLabel={[a.title, `version ${a.version}`, status.label, line].filter(Boolean).join('. ')}>
        <RecordHead title={a.title} badge={status} />
        <Text variant="small" color="ink3" tabular style={styles.version}>{`v${a.version}`}</Text>
        {line ? (
          <Text variant="small" color="ink4" style={styles.line}>
            {line}
          </Text>
        ) : null}
      </View>
      {hash ? (
        <PressableScale
          onPress={() => void copyHash(a.contentHash)}
          accessibilityRole="button"
          accessibilityLabel={`Content hash ${hash.split('').join(' ')}`}
          accessibilityHint="Copies the full hash"
          hitSlop={{ top: 8, bottom: 8 }}
          style={[styles.hash, { backgroundColor: colors.bg3 }]}
        >
          <Text variant="mono" color="ink2" selectable={false}>
            {hash}
          </Text>
          <Icon icon={Copy} size={14} color="ink3" />
        </PressableScale>
      ) : null}
    </RecordRow>
  );
}

const styles = StyleSheet.create({
  version: { marginTop: 2 },
  line: { marginTop: 2 },
  hash: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[2],
    minHeight: layout.minTouch - 16,
    paddingHorizontal: space[3],
    marginTop: space[2],
    borderRadius: radius.pill,
  },
});
