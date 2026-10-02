import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { ToolSubmissionDetail } from '@/api/schemas/tools';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { KeyValue } from '@/components/KeyValue';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';

import { deliveredBadges, newsletterBadge } from '../logic';

/**
 * The rest of the row: which tool, the newsletter answer, what was delivered
 * (the breakdown email, the CRM contact), and the lead this submission
 * created (opens the lead). The reply speed is one of the answers above.
 */
export function DetailsCard({ detail }: { detail: ToolSubmissionDetail }) {
  const newsletter = newsletterBadge(detail.newsletter);
  const [mail, crm] = deliveredBadges(detail.delivered);
  const leadId = detail.leadId;

  return (
    <Card padded={false}>
      <KeyValue
        items={[
          { label: 'Tool', value: detail.toolName },
          { label: 'Newsletter', value: newsletter.label, render: <Badge label={newsletter.label} tone={newsletter.tone} style={styles.end} /> },
          {
            label: 'Delivered',
            value: `${mail.label}, ${crm.label}`,
            render: (
              <View style={styles.badges}>
                <Badge label={mail.label} tone={mail.tone} />
                <Badge label={crm.label} tone={crm.tone} />
              </View>
            ),
          },
          leadId
            ? {
                label: 'Lead',
                value: 'Open the lead',
                onPress: () => router.push({ pathname: '/leads/[id]', params: { id: leadId } }),
                render: (
                  <View style={styles.link}>
                    <Text variant="body" tone="gold" weight="600">
                      Open the lead
                    </Text>
                    <Icon icon={ChevronRight} size={18} tone="gold" />
                  </View>
                ),
              }
            : null,
        ]}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  end: { alignSelf: 'center', marginLeft: 'auto' },
  badges: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: space[2] },
  link: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space[1] },
});
