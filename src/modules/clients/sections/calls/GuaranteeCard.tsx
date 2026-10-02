import { CalendarClock } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { Guarantee } from '@/api/schemas/clients';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { ProgressBar } from '@/components/ProgressBar';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

import type { ClientLabels } from '../labels';
import { guaranteeProgressLine, guaranteeSpoken, guaranteeTermsLine, paceBadge, reviewBannerText } from './callText';

/**
 * The guarantee at a glance: "counted / target" in display type, the pace
 * badge, where the clock is, and a progress bar. Only for eligible clients.
 * Every number comes from the server (brief 12.6): the app never counts.
 */
export function GuaranteeCard({ guarantee, labels }: { guarantee: Guarantee; labels: ClientLabels }) {
  const pace = paceBadge(guarantee, labels);
  const fraction = guarantee.target > 0 ? Math.min(guarantee.counted / guarantee.target, 1) : 0;
  const progress = guaranteeProgressLine(guarantee);

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <Text variant="eyebrow">Guarantee</Text>
        {pace ? <Badge label={pace.label} tone={pace.tone} dot /> : null}
      </View>
      <Text variant="kpi" tabular accessibilityLabel={guaranteeSpoken(guarantee)} style={styles.number}>
        {String(guarantee.counted)}
        <Text variant="kpi" color="ink4" tabular>{` / ${guarantee.target}`}</Text>
      </Text>
      <Text variant="body" color="ink2">
        {progress}
      </Text>
      <ProgressBar
        value={fraction}
        tone={guarantee.status === 'met' ? 'ok' : 'gold'}
        style={styles.bar}
        testID="guarantee-progress"
      />
      <Text variant="small" color="ink3">
        {guaranteeTermsLine(guarantee)}
      </Text>
    </Card>
  );
}

/** "N appointments from the CRM waiting for your review. ..." */
export function ReviewBanner({ count }: { count: number }) {
  const { tones } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: tones.gold.bg }]}
    >
      <Icon icon={CalendarClock} size={20} tone="gold" />
      <Text variant="small" color="ink2" style={styles.bannerText}>
        {reviewBannerText(count)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[2] },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], minHeight: 28 },
  number: { marginTop: space[1] },
  bar: { marginVertical: space[2] },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    padding: space[4],
    borderRadius: radius.card,
  },
  bannerText: { flex: 1 },
});
