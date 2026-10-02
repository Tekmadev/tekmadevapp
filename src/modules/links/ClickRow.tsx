import { Globe, Monitor, Smartphone, Tablet, type LucideIcon } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated from 'react-native-reanimated';

import type { LinkClick } from '@/api/schemas/links';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { ListRow } from '@/components/ListRow';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { enterPull, STAGGER_MAX } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { formatDateTime, relativeTime } from '@/lib/dates';

import { clickWhere, countryLabel, deviceLabel, referrerLabel, shortLinkText } from './logic';

function deviceIcon(device: string | null): LucideIcon {
  switch (device?.toLowerCase()) {
    case 'mobile':
      return Smartphone;
    case 'desktop':
      return Monitor;
    case 'tablet':
      return Tablet;
    default:
      return Globe;
  }
}

export type ClickRowProps = {
  click: LinkClick;
  /** The current minute, so "5 min ago" stays true while the list sits open. */
  now: Date;
  /**
   * Recent clicks (every link): the link is the title and the row opens it
   * while it still exists. One link's history: the time is the title.
   */
  showLink: boolean;
  onOpenLink?: (linkId: string) => void;
  index: number;
  still: boolean;
};

/**
 * One visit (brief 8.11): when, which link, the device, the country and the
 * referring site ("Direct or QR scan" when there is none).
 */
export const ClickRow = memo(function ClickRow({ click, now, showLink, onOpenLink, index, still }: ClickRowProps) {
  const when = formatDateTime(click.at, now);
  const spoken = [
    showLink ? shortLinkText(click.slug) : null,
    when,
    deviceLabel(click.device),
    countryLabel(click.country),
    `from ${referrerLabel(click.referrer)}`,
  ]
    .filter(Boolean)
    .join(', ');
  const onPress = onOpenLink ? () => onOpenLink(click.linkId) : undefined;

  return (
    <Animated.View entering={still || index >= STAGGER_MAX ? undefined : enterPull(index)}>
      <ListRow
        title={showLink ? shortLinkText(click.slug) : when}
        subtitle={clickWhere(click)}
        meta={referrerLabel(click.referrer)}
        icon={deviceIcon(click.device)}
        iconTone="neutral"
        value={showLink ? relativeTime(click.at, now) : undefined}
        onPress={onPress}
        chevron={false}
        accessibilityLabel={spoken}
        accessibilityHint={onPress ? 'Opens this link' : undefined}
      />
    </Animated.View>
  );
});

/** Lines up with the row text after the 40dp icon circle. */
export const CLICK_DIVIDER_INSET = layout.gutter + 40 + space[1] + space[3];

const LINE_WIDTHS: DimensionValue[] = ['48%', '40%', '54%', '44%', '50%'];

/** Click rows while the first page loads, shaped like ClickRow so nothing moves. */
export function ClickListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <SkeletonGroup>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i}>
          <View style={styles.row}>
            <Skeleton shape="circle" size={40} />
            <View style={styles.lines}>
              <Skeleton width={LINE_WIDTHS[i % LINE_WIDTHS.length]} height={14} />
              <Skeleton width="34%" height={12} />
              <Skeleton width="26%" height={10} />
            </View>
            <Skeleton width={52} height={12} />
          </View>
          {i < rows - 1 ? <Divider inset={CLICK_DIVIDER_INSET} /> : null}
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** Link cards while GET /links loads, the same size as LinkCard. */
export function LinkCardSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <SkeletonGroup>
      {Array.from({ length: cards }, (_, i) => (
        <View key={i} style={styles.cardWrap}>
          <Card padded={false}>
            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <Skeleton width={LINE_WIDTHS[i % LINE_WIDTHS.length]} height={18} />
                <Skeleton width={64} height={22} />
              </View>
              <Skeleton width="38%" height={12} />
              <View style={styles.cardChips}>
                <Skeleton width={92} height={24} />
                <Skeleton width={72} height={24} />
                <Skeleton width={84} height={24} />
              </View>
              <View style={styles.cardTop}>
                <Skeleton width="34%" height={12} />
                <Skeleton width={72} height={22} />
              </View>
            </View>
            <Divider />
            <View style={styles.cardActions} />
          </Card>
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: layout.gutter,
    paddingVertical: space[3],
    minHeight: 72,
  },
  lines: { flex: 1, gap: space[2] },
  cardWrap: { paddingHorizontal: layout.gutter, paddingBottom: space[3] },
  cardBody: { padding: space[4], gap: space[3] },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  cardChips: { flexDirection: 'row', gap: space[1] + 2 },
  cardActions: { height: layout.minTouch },
});
