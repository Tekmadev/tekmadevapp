import { CircleCheck, RotateCcw, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { CrmAttentionItem, CrmMeta } from '@/api/schemas/crm';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { CheckboxBox } from '@/components/form/Checkbox';
import { Icon } from '@/components/Icon';
import { PendingButton } from '@/components/PendingButton';
import { PressableScale } from '@/components/PressableScale';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';
import { formatCount } from '@/lib/format';

import { useAttentionActions } from '../hooks';
import { directionLabel, discardQuestion, NOTHING_STUCK, stuckCount, triesLabel, whenText } from '../logic';

type AttentionHeaderProps = {
  items: readonly CrmAttentionItem[];
  selected: readonly CrmAttentionItem[];
  onSelectAll: () => void;
  onClear: () => void;
  /** `crm.write`: selecting, Retry and Discard. Without it only the title and count show. */
  canWrite: boolean;
};

/**
 * "Needs attention": the title with the count, Select all / Clear, and for a
 * selection: Retry (signed items only: an unsigned message cannot be trusted)
 * and Discard (HoldToConfirm; discarded items stay on record).
 */
export function AttentionHeader({ items, selected, onSelectAll, onClear, canWrite }: AttentionHeaderProps) {
  const { retry, discard } = useAttentionActions();
  // The count when the sheet opened, so its wording holds while it closes after the selection clears.
  const [discardCount, setDiscardCount] = useState<number | null>(null);
  const signed = selected.filter((i) => i.signed).length;
  const allSelected = items.length > 0 && selected.length === items.length;

  const right =
    items.length > 0 ? (
      <Text variant="small" color="ink4" tabular>
        {stuckCount(items.length)}
      </Text>
    ) : undefined;

  return (
    <Section title="Needs attention" right={right} spacing={space[3]}>
      {items.length > 0 && canWrite ? (
        <View style={styles.toolbar}>
          <View style={styles.toolbarTop}>
            <Text variant="label" color={selected.length > 0 ? 'ink' : 'ink3'} style={styles.flex} accessibilityLiveRegion="polite">
              {selected.length > 0 ? `${formatCount(selected.length)} selected` : 'Tap items to select them'}
            </Text>
            <Button
              label={allSelected ? 'Clear' : 'Select all'}
              variant="ghost"
              size="sm"
              onPress={allSelected ? onClear : onSelectAll}
            />
          </View>
          {selected.length > 0 ? (
            <View style={styles.actions}>
              <PendingButton
                label={signed > 0 && signed < selected.length ? `Retry ${formatCount(signed)}` : 'Retry'}
                pendingLabel="Retrying"
                icon={RotateCcw}
                variant="secondary"
                size="sm"
                disabled={signed === 0}
                offlineHint={false}
                onPress={async () => {
                  await retry(selected);
                  onClear();
                }}
                accessibilityHint={signed === 0 ? 'Only signed items can be retried.' : 'Queues the signed items to try again'}
              />
              <PendingButton
                label="Discard"
                icon={Trash2}
                variant="destructive"
                size="sm"
                onPress={() => setDiscardCount(selected.length)}
                accessibilityHint="Stops trying for good. They stay on record."
              />
            </View>
          ) : null}
          {selected.length > 0 && signed < selected.length ? (
            <Text variant="small" color="ink4">
              Only signed items can be retried. Unsigned ones can only be discarded.
            </Text>
          ) : null}
        </View>
      ) : null}

      <ConfirmSheet
        visible={discardCount !== null}
        onClose={() => setDiscardCount(null)}
        title={(discardCount ?? 0) > 1 ? `Discard ${formatCount(discardCount ?? 0)} items?` : 'Discard this item?'}
        message={discardQuestion(discardCount ?? 1)}
        confirmLabel="Hold to discard"
        pendingLabel="Discarding"
        onConfirm={async () => {
          await discard(selected);
          onClear();
        }}
      />
    </Section>
  );
}

type AttentionRowProps = {
  item: CrmAttentionItem;
  meta: Partial<CrmMeta> | undefined;
  now: Date;
  selected: boolean;
  /** Null when this person cannot act on items (`crm.write`): no checkbox, the card only reads. */
  onToggle: ((item: CrmAttentionItem) => void) | null;
};

/** A stuck item: what, who, direction and tries, why it stopped, when. The whole card toggles its checkbox. */
export function AttentionRow({ item, meta, now, selected, onToggle }: AttentionRowProps) {
  const direction = directionLabel(meta, item.direction);
  const when = whenText(item.at, now);
  const facts = [direction, triesLabel(item.tries), item.signed ? null : 'Unsigned'].filter(Boolean).join(' · ');
  const spoken = [item.what, item.who, facts, item.why, when].filter(Boolean).join('. ');

  const texts = (
    <View style={styles.body} importantForAccessibility="no-hide-descendants">
      <View style={styles.top}>
        <Text variant="bodyStrong" style={styles.flex}>
          {item.what}
        </Text>
        <Text variant="small" color="ink4" tabular>
          {when}
        </Text>
      </View>
      <Text variant="small" color="ink2" numberOfLines={2}>
        {item.who}
      </Text>
      <Text variant="small" color="ink4">
        {facts}
      </Text>
      <Text variant="small" tone="warn">
        {item.why}
      </Text>
    </View>
  );

  if (!onToggle) {
    return (
      <Card padded={false}>
        <View style={styles.row} accessible accessibilityLabel={spoken}>
          {texts}
        </View>
      </Card>
    );
  }

  return (
    <Card padded={false}>
      <PressableScale
        pressedScale={0.99}
        haptic={false}
        onPress={() => onToggle(item)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={spoken}
        style={styles.row}
      >
        <View importantForAccessibility="no-hide-descendants">
          <CheckboxBox checked={selected} />
        </View>
        {texts}
      </PressableScale>
    </Card>
  );
}

/** Empty "Needs attention": a calm check. */
export function NothingStuck() {
  return (
    <Card style={styles.calm} accessibilityLabel={NOTHING_STUCK}>
      <Icon icon={CircleCheck} size={20} tone="ok" />
      <Text variant="body" color="ink2">
        {NOTHING_STUCK}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { gap: space[2] },
  toolbarTop: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 48 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], padding: space[4] },
  body: { flex: 1, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  calm: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
