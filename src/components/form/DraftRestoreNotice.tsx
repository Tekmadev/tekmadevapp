import { History } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { relativeTime } from '@/lib/dates';

import { ActionButton } from './ActionButton';
import type { StoredDraft } from './autosave';

export type DraftRestoreNoticeProps = {
  /** From useDraftRestore(); nothing renders while it is null. */
  draft: StoredDraft<unknown> | null;
  /** Put the draft back in the form (call restore() and set the fields). */
  onRestore: () => void;
  /** Keep the server copy (call discard()). */
  onDiscard: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * The offer to bring back text typed before a crash or a kill (brief section 8.11):
 * "Restore your unsaved changes?" with Restore and Discard.
 *
 *   const offer = useDraftRestore(`blog.${id}`, post?.body, post?.updatedAt);
 *   <DraftRestoreNotice draft={offer.draft} onRestore={() => setBody(offer.restore() ?? body)} onDiscard={offer.discard} />
 */
export function DraftRestoreNotice({ draft, onRestore, onDiscard, style }: DraftRestoreNoticeProps) {
  const { colors } = useTheme();
  if (!draft) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(180)}
      style={[styles.card, { backgroundColor: colors.goldTint, borderColor: colors.gold }, style]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.head}>
        <Icon icon={History} size={18} tone="gold" />
        <View style={styles.text}>
          <Text variant="bodyStrong">Restore your unsaved changes?</Text>
          <Text variant="small" color="ink3">{`Saved on this phone ${savedWhen(draft.savedAt)}.`}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <ActionButton label="Discard" variant="secondary" onPress={onDiscard} />
        <ActionButton label="Restore" onPress={onRestore} />
      </View>
    </Animated.View>
  );
}

/** "just now", "5 min ago", "yesterday", "on Sep 28": reads after "Saved on this phone". */
function savedWhen(savedAt: number): string {
  const when = relativeTime(new Date(savedAt));
  if (when === 'Yesterday') return 'yesterday';
  return /^[A-Z][a-z]{2} \d/.test(when) ? `on ${when}` : when;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.input,
    padding: space[4],
    gap: space[3],
  },
  head: {
    flexDirection: 'row',
    gap: space[3],
  },
  text: {
    flex: 1,
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: space[3],
  },
});
