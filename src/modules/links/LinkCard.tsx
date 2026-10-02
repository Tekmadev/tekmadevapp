import type { LucideIcon } from 'lucide-react-native';
import { Copy, CornerDownRight, EllipsisVertical, QrCode, Share2 } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { LinksMeta, ShortLink } from '@/api/schemas/links';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';
import { formatCount, plural } from '@/lib/format';

import { openQr } from './LinkActions';
import { linkSpoken, shareUrlOf, shortLinkText, statusBadge, utmChips, type UtmChip } from './logic';
import { copyLink, shareLink } from './share';

/** A UTM value as a small chip: "source instagram". */
export function UtmTag({ chip }: { chip: UtmChip }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: colors.bg3 }]}>
      <Text variant="caption" color="ink4">
        {chip.name}
      </Text>
      <Text variant="caption" color="ink2" numberOfLines={1} style={styles.tagValue}>
        {chip.value}
      </Text>
    </View>
  );
}

function CardAction({ icon, label, spoken, onPress }: { icon: LucideIcon; label: string; spoken: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={spoken} style={styles.action}>
      <Icon icon={icon} size={16} color="ink2" />
      <Text variant="label" color="ink2" numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

export type LinkCardProps = {
  link: ShortLink;
  meta: LinksMeta | undefined;
  onOpen: (link: ShortLink) => void;
  /** The actions menu (long press, or the overflow button). */
  onMenu: (link: ShortLink) => void;
  /** Position in the list: the first cards are pulled into place with a stagger. */
  index: number;
  /** No enter animation (reduced motion). */
  still: boolean;
};

/**
 * One short link (brief 8.11): tekmadev.com/<slug> large in mono, the
 * destination, the UTM source, medium and campaign as chips, the internal
 * label, the click count (counts up when it changes) and the status badge
 * (active gold, disabled muted). Tapping the card opens its click history;
 * Copy, Share and QR code sit under it, the rest in the overflow menu.
 */
export const LinkCard = memo(function LinkCard({ link, meta, onOpen, onMenu, index, still }: LinkCardProps) {
  const status = statusBadge(meta, link.active);
  const url = shareUrlOf(link);
  const short = shortLinkText(link.slug);
  const chips = utmChips(link);

  return (
    <Animated.View entering={still || index >= STAGGER_MAX ? undefined : enterPull(index)} style={styles.wrap}>
      <Card padded={false}>
        <PressableScale
          onPress={() => onOpen(link)}
          onLongPress={() => onMenu(link)}
          pressedScale={0.985}
          accessibilityRole="button"
          accessibilityLabel={linkSpoken(link, status.label)}
          accessibilityHint="Opens its click history. Long press for more actions."
          style={styles.body}
        >
          <View style={styles.top}>
            <Text variant="monoLarge" color={link.active ? 'ink' : 'ink3'} numberOfLines={2} style={styles.flex}>
              {short}
            </Text>
            <Badge label={status.label} tone={status.tone} dot />
          </View>
          <View style={styles.destination}>
            <Icon icon={CornerDownRight} size={14} color="ink4" />
            <Text variant="small" color="ink3" numberOfLines={1} style={styles.flex}>
              {link.destination}
            </Text>
          </View>
          {chips.length > 0 ? (
            <View style={styles.chips}>
              {chips.map((chip) => (
                <UtmTag key={chip.key} chip={chip} />
              ))}
            </View>
          ) : null}
          <View style={styles.bottom}>
            <Text variant="label" color="ink2" numberOfLines={2} style={styles.flex}>
              {link.label ?? ''}
            </Text>
            <View style={styles.clicks}>
              <AnimatedNumber value={link.clicks} format={formatCount} variant="headlineSmall" accessibilityLabel={formatCount(link.clicks)} />
              <Text variant="small" color="ink3">
                {plural(link.clicks, 'click', 'clicks')}
              </Text>
            </View>
          </View>
        </PressableScale>
        <Divider />
        <View style={styles.actions}>
          <CardAction icon={Copy} label="Copy" spoken={`Copy ${short}`} onPress={() => void copyLink(url)} />
          <CardAction icon={Share2} label="Share" spoken={`Share ${short}`} onPress={() => void shareLink(url)} />
          <CardAction icon={QrCode} label="QR code" spoken={`QR code for ${short}`} onPress={() => openQr(link)} />
          <IconButton icon={EllipsisVertical} size={20} accessibilityLabel={`More actions for ${short}`} onPress={() => onMenu(link)} />
        </View>
      </Card>
    </Animated.View>
  );
});

/** Space under each card. */
export const LINK_CARD_GAP = space[3];

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.gutter, paddingBottom: LINK_CARD_GAP },
  body: { padding: space[4], gap: space[2] },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  flex: { flex: 1 },
  destination: { flexDirection: 'row', alignItems: 'center', gap: space[1] + 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1] + 2, marginTop: space[1] },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    minHeight: 24,
    paddingVertical: 3,
    paddingHorizontal: space[2],
    borderRadius: radius.pill,
    maxWidth: '100%',
  },
  tagValue: { flexShrink: 1 },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', gap: space[3], marginTop: space[1] },
  clicks: { flexDirection: 'row', alignItems: 'baseline', gap: space[1] },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2] },
  action: {
    flex: 1,
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[1] + 2,
    paddingHorizontal: space[1],
  },
});
