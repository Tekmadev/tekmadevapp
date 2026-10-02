import { Copy, Trash2 } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { Campaign, EmailMeta } from '@/api/schemas/email';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { SwitchRow } from '@/components/form/Switch';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { formatCount } from '@/lib/format';

import { copyExact } from '../copy';
import { campaignStatusBadge, EMAIL_COPY } from '../logic';

export type CampaignCardProps = {
  campaign: Campaign;
  meta: EmailMeta | undefined;
  /** The Pause / Resume call is running for this campaign. */
  toggling: boolean;
  online: boolean;
  onToggle: (campaign: Campaign, active: boolean) => void;
  onDelete: (campaign: Campaign) => void;
  /** Position in the list: the first cards are pulled into place with a stagger. */
  index: number;
  still: boolean;
};

function Count({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.count}>
      <Text variant="eyebrow">{label}</Text>
      <Text variant="headlineSmall" tabular numberOfLines={1}>
        {formatCount(value)}
      </Text>
    </View>
  );
}

/**
 * One campaign (brief 8.11): a tracking registration for an email the CRM
 * sends (this app never sends email). Name, status badge (active gold, paused
 * muted), the key in mono (tap to copy), subject, note, opens and clicks, the
 * Pause / Resume switch with its note, and Delete (HoldToConfirm upstream).
 */
export const CampaignCard = memo(function CampaignCard({ campaign, meta, toggling, online, onToggle, onDelete, index, still }: CampaignCardProps) {
  const badge = campaignStatusBadge(meta, campaign.active);
  // While the call runs the switch already shows where it is going, with the loader on the thumb.
  const shown = toggling ? !campaign.active : campaign.active;

  return (
    <Animated.View entering={still || index >= STAGGER_MAX ? undefined : enterPull(index)} style={styles.wrap}>
      <Card>
        <View style={styles.top}>
          <Text variant="title" numberOfLines={2} style={styles.name}>
            {campaign.name}
          </Text>
          <Badge label={badge.label} tone={badge.tone} dot />
        </View>

        <PressableScale
          onPress={() => void copyExact(campaign.key)}
          style={styles.key}
          accessibilityRole="button"
          accessibilityLabel={`Key ${campaign.key}`}
          accessibilityHint="Copies the key"
        >
          <Text variant="mono" color="ink2" numberOfLines={1} style={styles.keyText}>
            {campaign.key}
          </Text>
          <Icon icon={Copy} size={16} color="ink3" />
        </PressableScale>

        {campaign.subject ? (
          <Text variant="small" color="ink2" numberOfLines={2}>
            {campaign.subject}
          </Text>
        ) : null}
        {campaign.description ? (
          <Text variant="small" color="ink3" numberOfLines={3} style={styles.note}>
            {campaign.description}
          </Text>
        ) : null}

        <View style={styles.counts} accessible accessibilityLabel={`${formatCount(campaign.opens)} opens, ${formatCount(campaign.clicks)} clicks`}>
          <Count label="Opens" value={campaign.opens} />
          <Count label="Clicks" value={campaign.clicks} />
        </View>

        <Divider style={styles.divider} />
        <SwitchRow
          label="Active"
          description={EMAIL_COPY.pauseNote}
          value={shown}
          pending={toggling}
          disabled={!online}
          onValueChange={(next) => onToggle(campaign, next)}
        />
        <View style={styles.actions}>
          <Button
            label="Delete"
            icon={Trash2}
            variant="ghost"
            size="sm"
            disabled={!online || toggling}
            accessibilityLabel={`Delete ${campaign.name}`}
            accessibilityHint={online ? 'Asks you to hold to confirm' : 'You are offline'}
            onPress={() => onDelete(campaign)}
          />
        </View>
      </Card>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.gutter, paddingBottom: space[3] },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  name: { flex: 1 },
  key: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: layout.minTouch, alignSelf: 'flex-start' },
  keyText: { flexShrink: 1 },
  note: { marginTop: space[1] },
  counts: { flexDirection: 'row', gap: space[6], marginTop: space[4] },
  count: { gap: space[1] },
  divider: { marginTop: space[4], marginBottom: space[2] },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: space[1] },
});
