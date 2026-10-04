import { StyleSheet, View } from 'react-native';

import type { ClientBundle } from '@/api/schemas/clients';
import type { Meta } from '@/api/schemas/meta';
import { useCan } from '@/auth/permissions';
import { StatCard } from '@/components/StatCard';
import { space } from '@/design/tokens';
import type { ClientSection } from '@/lib/deeplinks';

import { billingStat, callsStat, checklistStat, stageStat, type StatLabels, type StatModel } from './logic';

export type ClientStatCardsProps = {
  bundle: ClientBundle;
  meta: Meta | undefined;
  /** Tapping Stage or Checklist opens Onboarding; Booked calls opens Calls. */
  onOpenSection: (section: ClientSection) => void;
};

function Stat({ model, section, onOpenSection }: { model: StatModel; section?: ClientSection; onOpenSection: ClientStatCardsProps['onOpenSection'] }) {
  return (
    <StatCard
      label={model.label}
      value={model.value}
      sub={model.sub}
      size="md"
      onPress={section ? () => onOpenSection(section) : undefined}
      accessibilityHint={section ? `Shows the ${section === 'calls' ? 'Calls' : 'Onboarding'} section` : undefined}
      style={styles.card}
    />
  );
}

/**
 * Stage, Checklist, Booked calls and Billing in a 2 by 2 grid. Billing (money)
 * needs `clients.billing`: without it (staff) the card is left out and Booked
 * calls spans the second row. The skeleton draws the same grid, so nothing
 * moves when the bundle lands.
 */
export function ClientStatCards({ bundle, meta, onOpenSection }: ClientStatCardsProps) {
  const seesBilling = useCan('clients.billing');
  const labels: StatLabels = {
    stages: meta?.onboardingStages,
    subscriptionStatuses: meta?.billingSubscriptionStatuses,
    orderStatuses: meta?.billingOrderStatuses,
  };
  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <Stat model={stageStat(bundle, labels)} section="onboarding" onOpenSection={onOpenSection} />
        <Stat model={checklistStat(bundle)} section={bundle.onboarding ? 'onboarding' : undefined} onOpenSection={onOpenSection} />
      </View>
      <View style={styles.row}>
        <Stat model={callsStat(bundle.guarantee)} section="calls" onOpenSection={onOpenSection} />
        {seesBilling ? <Stat model={billingStat(bundle.billing, labels)} onOpenSection={onOpenSection} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: space[3], marginBottom: space[6] },
  // Cards in a row stretch to the taller one, so the grid stays even.
  row: { flexDirection: 'row', gap: space[3] },
  card: { flex: 1 },
});
