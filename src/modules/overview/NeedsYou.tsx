import { router } from 'expo-router';
import { Ban, Bell, ChevronRight, CircleCheck, ClipboardCheck, PhoneCall, TrendingDown, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import type { OverviewAttention } from '@/api/schemas/overview';
import { useCapabilities } from '@/auth/permissions';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { useGutter } from '@/components/parts/gutter';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { layout, radius, space, withAlpha } from '@/design/tokens';
import { formatCount } from '@/lib/format';

import { attentionCards, attentionCardSize, type AttentionCard, type AttentionKey } from './logic';

/** Card size at the current font scale, shared with the skeleton so nothing moves when the counts arrive. */
export function useAttentionCardSize() {
  const { fontScale } = useWindowDimensions();
  return attentionCardSize(fontScale);
}

const ICONS: Record<AttentionKey, LucideIcon> = {
  needsAction: Bell,
  blockedOnboardings: Ban,
  callsToReview: PhoneCall,
  intakesToReview: ClipboardCheck,
  behindPace: TrendingDown,
};

/**
 * "Needs you" (brief 8.3 item 2): one card per thing waiting on someone, zero
 * counts hidden, and only work this person can act on (staff never see the CRM
 * review or intake review cards). Each opens the list behind its count. When
 * nothing is waiting, a calm line with a soft gold check takes the row's place.
 */
export function NeedsYou({ attention, countFromZero }: { attention: OverviewAttention; countFromZero: boolean }) {
  const gutter = useGutter();
  const size = useAttentionCardSize();
  const caps = useCapabilities();
  const cards = attentionCards(attention, (cap) => caps.includes(cap));

  return (
    <Section title="Needs you">
      {cards.length === 0 ? (
        <AllClear minHeight={size.minHeight} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // Edge to edge, with the first card on the gutter line.
          style={{ marginHorizontal: -gutter }}
          contentContainerStyle={[styles.row, { paddingHorizontal: gutter || layout.gutter }]}
        >
          {cards.map((card) => (
            <AttentionCardView key={card.key} card={card} size={size} countFromZero={countFromZero} />
          ))}
        </ScrollView>
      )}
    </Section>
  );
}

type CardSize = ReturnType<typeof attentionCardSize>;

function AttentionCardView({ card, size, countFromZero }: { card: AttentionCard; size: CardSize; countFromZero: boolean }) {
  const { colors } = useTheme();
  return (
    <Card
      onPress={() => router.push(card.href)}
      accessibilityLabel={`${formatCount(card.count)} ${card.label}`}
      accessibilityHint={card.hint}
      // Gold accent: every card shown has something waiting.
      style={[size, { borderColor: withAlpha(colors.gold, 0.4) }]}
    >
      <View importantForAccessibility="no-hide-descendants">
        <View style={styles.cardTop}>
          <View style={[styles.iconCircle, { backgroundColor: colors.goldTint }]}>
            <Icon icon={ICONS[card.key]} size={16} color="gold" />
          </View>
          <Icon icon={ChevronRight} size={18} color="ink4" />
        </View>
        <AnimatedNumber value={card.count} variant="number" color="gold" countFromZero={countFromZero} style={styles.count} />
        {/* The card is sized for two lines; it grows rather than cut a label off. */}
        <Text variant="label" color="ink2">
          {card.label}
        </Text>
      </View>
    </Card>
  );
}

/** Nothing waiting: said calmly, with a soft gold check. Same height as the cards. */
function AllClear({ minHeight }: { minHeight: number }) {
  const { colors } = useTheme();
  return (
    <Card style={[styles.clear, { minHeight }]} accessibilityLabel="Nothing is waiting on you.">
      <View style={styles.clearInner} importantForAccessibility="no-hide-descendants">
        <View style={[styles.checkCircle, { backgroundColor: colors.goldTint }]}>
          <Icon icon={CircleCheck} size={24} color="goldMid" strokeWidth={1.75} />
        </View>
        <Text variant="body" color="ink2" style={styles.clearText}>
          Nothing is waiting on you.
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { gap: space[3] },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconCircle: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  count: { marginTop: space[3], marginBottom: space[1] },
  clear: { justifyContent: 'center' },
  clearInner: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  checkCircle: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  clearText: { flex: 1 },
});
