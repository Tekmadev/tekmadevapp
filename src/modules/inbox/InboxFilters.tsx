import { FlaskConical } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import type { NotificationCategory, NotificationFilter } from '@/api/schemas/notifications';
import { Chip } from '@/components/Chip';
import { useTheme } from '@/design/theme';
import { layout, space } from '@/design/tokens';

import { InboxSegments } from './InboxSegments';
import { categoryChips, EVERYTHING, filterSegments, INBOX_COPY } from './logic';

export type InboxFiltersProps = {
  filter: NotificationFilter;
  onFilter: (filter: NotificationFilter) => void;
  /** The Needs action count for the segment, or null until it is known. */
  needsAction: number | null;
  category: NotificationCategory | null;
  onCategory: (category: NotificationCategory | null) => void;
  isOwner: boolean;
  includeTest: boolean;
  onIncludeTest: (on: boolean) => void;
};

/**
 * Under the large title: All / Unread / Needs action ({n}), then one scrolling
 * row of category chips (Audience and Team for owners only) with the owner's
 * "Include test" toggle at the end, set apart by a hairline.
 */
export function InboxFilters({ filter, onFilter, needsAction, category, onCategory, isOwner, includeTest, onIncludeTest }: InboxFiltersProps) {
  const { colors } = useTheme();
  const chips = categoryChips(isOwner);
  const selected = category ?? EVERYTHING;

  return (
    <View style={styles.wrap}>
      <InboxSegments
        items={filterSegments(needsAction)}
        value={filter}
        onChange={onFilter}
        accessibilityLabel="Show"
        style={styles.segments}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chips}
      >
        <View accessibilityRole="radiogroup" accessibilityLabel="Category" style={styles.group}>
          {chips.map((chip) => (
            <Chip
              key={chip.value}
              label={chip.label}
              role="radio"
              selected={selected === chip.value}
              onPress={() => {
                if (selected === chip.value) return;
                onCategory(chip.value === EVERYTHING ? null : chip.value);
              }}
            />
          ))}
        </View>
        {isOwner ? (
          <>
            <View style={[styles.rule, { backgroundColor: colors.lineStrong }]} />
            <Chip
              label={INBOX_COPY.includeTest}
              icon={FlaskConical}
              role="checkbox"
              selected={includeTest}
              onPress={() => onIncludeTest(!includeTest)}
            />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: space[2] },
  segments: { marginHorizontal: layout.gutter },
  // Vertical padding keeps the chips' 48dp touch slop inside the scroll view.
  chips: { alignItems: 'center', gap: space[2], paddingHorizontal: layout.gutter, paddingVertical: space[1] + 2, marginTop: space[3] },
  group: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  rule: { width: 1, height: 20, marginHorizontal: space[1] },
});
