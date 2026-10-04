import { Pencil } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useCan } from '@/auth/permissions';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { KeyValue } from '@/components/KeyValue';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { space, type Tone } from '@/design/tokens';
import { formatCalendarDate } from '@/lib/dates';
import { formatPhone, plural } from '@/lib/format';

import { AccountEditSheet } from './account/AccountEditSheet';
import { labelOf, toneOf } from './labels';
import { useClientLabels } from './sectionData';
import type { SectionProps } from './types';

/**
 * Account (brief 8.5, section 10): the account fields and guarantee terms,
 * read only, with "Edit" opening the edit sheet for people with `clients.edit`.
 */
export function AccountSection({ clientId, bundle }: SectionProps) {
  const labels = useClientLabels();
  const canEdit = useCan('clients.edit');
  const { client } = bundle;
  const [editing, setEditing] = useState(false);

  const planName = client.planName ?? (client.planId ? labelOf(labels.planOptions.map((p) => ({ value: p.id, label: p.name })), client.planId) : null);
  const statusLabel = labelOf(labels.clientStatuses, client.status);
  const guaranteeLabel = labelOf(labels.guaranteeStatuses, client.guaranteeStatus);

  return (
    <Section
      title="Account"
      right={
        canEdit ? <Button label="Edit" icon={Pencil} size="sm" variant="secondary" onPress={() => setEditing(true)} accessibilityLabel="Edit account" /> : undefined
      }
    >
      <View style={styles.stack}>
        <Card padded={false}>
          <KeyValue
            items={[
              { label: 'Business name', value: client.businessName },
              { label: 'Contact name', value: client.contactName },
              { label: 'Legal name', value: client.legalName },
              { label: 'Website', value: client.website, copyable: true },
              { label: 'Primary email', value: client.primaryEmail, link: 'email' },
              { label: 'Phone', value: client.phone ? formatPhone(client.phone) : null, link: 'phone' },
              { label: 'Industry', value: client.industry },
              {
                label: 'Status',
                value: statusLabel,
                render: <BadgeValue label={statusLabel} tone={toneOf(labels.clientStatuses, client.status)} />,
              },
              { label: 'Plan', value: planName ?? 'No plan yet' },
              { label: 'Time zone', value: client.timezone, mono: true },
              { label: 'Strategist', value: client.assignedStrategist, link: 'email' },
              { label: 'Live date', value: client.liveDate ? formatCalendarDate(client.liveDate, new Date(), true) : null },
              { label: 'Service area', value: client.serviceArea },
            ]}
          />
        </Card>

        <Card padded={false}>
          <Text variant="eyebrow" style={styles.eyebrow}>
            Guarantee
          </Text>
          <KeyValue
            items={[
              { label: 'Eligible', value: client.guaranteeEligible ? 'Yes' : 'No' },
              { label: 'Target', value: `${client.guaranteeTarget} ${plural(client.guaranteeTarget, 'call', 'calls')}` },
              { label: 'Window', value: `${client.guaranteeWindowDays} ${plural(client.guaranteeWindowDays, 'day', 'days')}` },
              { label: 'Count rule', value: labelOf(labels.guaranteeCountRules, client.guaranteeCountRule) },
              {
                label: 'Status',
                value: guaranteeLabel,
                render: <BadgeValue label={guaranteeLabel} tone={toneOf(labels.guaranteeStatuses, client.guaranteeStatus)} />,
              },
              {
                label: 'Clock started',
                value: client.guaranteeClockStartedOn ? formatCalendarDate(client.guaranteeClockStartedOn, new Date(), true) : null,
              },
            ]}
          />
        </Card>

        <Card style={styles.notes}>
          <Text variant="eyebrow">Internal notes</Text>
          <Text variant="body" color={client.internalNotes ? 'ink' : 'ink4'}>
            {client.internalNotes?.trim() || 'Not set'}
          </Text>
          <Text variant="small" color="ink3">
            Never shown to the client.
          </Text>
        </Card>
      </View>

      {editing && canEdit ? <AccountEditSheet clientId={clientId} client={client} labels={labels} onClose={() => setEditing(false)} /> : null}
    </Section>
  );
}

/** A badge in a KeyValue row, on the value side. */
function BadgeValue({ label, tone }: { label: string; tone: Tone }) {
  return (
    <View style={styles.badgeValue}>
      <Badge label={label} tone={tone} />
    </View>
  );
}

const styles = StyleSheet.create({
  badgeValue: { flex: 1, alignItems: 'flex-end' },
  stack: { gap: space[3] },
  eyebrow: { paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[1] },
  notes: { gap: space[2] },
});
