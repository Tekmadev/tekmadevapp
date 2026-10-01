import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { layout, space } from '@/design/tokens';

import { Chip } from './Chip';
import { useGutter } from './parts/gutter';

export type FilterChipItem<V extends string> = {
  value: V;
  label: string;
  count?: number | null;
  icon?: LucideIcon;
  disabled?: boolean;
};

type SingleSelect<V extends string> = {
  multiple?: false;
  /** The selected chip, or null for none. */
  value: V | null;
  onChange: (value: V | null) => void;
  /** Tapping the selected chip clears it (default false: one is always on, like a tab). */
  allowDeselect?: boolean;
};

type MultiSelect<V extends string> = {
  multiple: true;
  value: readonly V[];
  onChange: (value: V[]) => void;
};

export type FilterChipsProps<V extends string> = (SingleSelect<V> | MultiSelect<V>) & {
  items: readonly FilterChipItem<V>[];
  /** Side padding inside the scroll row, so chips line up with the screen gutter (default 16). */
  inset?: number;
  /** Run edge to edge by cancelling the enclosing Screen's gutter (default true). */
  bleed?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A horizontally scrolling row of filter chips, single or multi select. It runs
 * edge to edge inside a padded Screen while the first chip lines up with the gutter.
 */
export function FilterChips<V extends string>(props: FilterChipsProps<V>) {
  const { items, inset = layout.gutter, bleed = true, accessibilityLabel, style, testID } = props;
  const gutter = useGutter();

  const isSelected = (v: V) => (props.multiple ? props.value.includes(v) : props.value === v);

  const toggle = (v: V) => {
    if (props.multiple) {
      const next = props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v];
      props.onChange(next);
      return;
    }
    if (props.value === v) {
      if (props.allowDeselect) props.onChange(null);
      return;
    }
    props.onChange(v);
  };

  return (
    <View
      testID={testID}
      style={[bleed ? { marginHorizontal: -gutter } : null, style]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={props.multiple ? undefined : 'radiogroup'}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.row, { paddingHorizontal: inset }]}
      >
        {items.map((item) => (
          <Chip
            key={item.value}
            label={item.label}
            count={item.count}
            icon={item.icon}
            disabled={item.disabled}
            selected={isSelected(item.value)}
            role={props.multiple ? 'checkbox' : 'radio'}
            onPress={() => toggle(item.value)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Vertical padding keeps the chips' 48dp touch slop inside the scroll view.
  row: { gap: space[2], paddingVertical: space[1] + 2, alignItems: 'center' },
});
