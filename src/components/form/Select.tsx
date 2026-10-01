import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Sheet } from '@/components/sheet/Sheet';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

import { ActionButton } from './ActionButton';
import { CheckboxBox } from './Checkbox';
import { FieldTrigger } from './FieldTrigger';
import type { FieldFill } from './InputChrome';
import { filterOptions, SEARCH_THRESHOLD, selectedOptions, toggleValue, type OptionValue, type SelectOption } from './options';
import { SearchField } from './SearchField';

export type { OptionValue, SelectOption } from './options';

type SingleChoice<V extends OptionValue> = {
  multiple?: false;
  value: V | null;
  onChange: (value: V) => void;
};

type MultiChoice<V extends OptionValue> = {
  multiple: true;
  value: readonly V[];
  onChange: (value: V[]) => void;
};

/* ---------- OptionList ---------- */

export type OptionListProps<V extends OptionValue> = (SingleChoice<V> | MultiChoice<V>) & {
  options: readonly SelectOption<V>[];
  /** Shown when there are no options (e.g. a search found nothing). */
  emptyText?: string;
  /** Names the group for TalkBack. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The list of choices, for embedding in a screen or a sheet. Single choice
 * shows a gold check on the chosen row; multiple choice shows checkboxes.
 */
export function OptionList<V extends OptionValue>(props: OptionListProps<V>) {
  const { colors } = useTheme();
  const { options, emptyText = 'No matches.', accessibilityLabel, style } = props;
  const multiple = props.multiple === true;

  const isSelected = (v: V) => (props.multiple ? props.value.includes(v) : props.value === v);
  const choose = (v: V) => {
    haptics.selection();
    if (props.multiple) props.onChange(toggleValue(props.value, v));
    else props.onChange(v);
  };

  if (options.length === 0) {
    return (
      <View style={[styles.empty, style]}>
        <Text variant="body" color="ink3" align="center">
          {emptyText}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.list, style]}
      accessibilityRole={multiple ? 'list' : 'radiogroup'}
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((o) => {
        const selected = isSelected(o.value);
        const disabled = !!o.disabled;
        return (
          <PressableScale
            key={String(o.value)}
            haptic={false}
            pressedScale={0.98}
            disabled={disabled}
            onPress={() => choose(o.value)}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityLabel={o.label}
            accessibilityHint={o.hint}
            accessibilityState={{ checked: selected, disabled }}
            style={[
              styles.row,
              selected ? { backgroundColor: colors.goldTint } : null,
              disabled ? styles.disabled : null,
            ]}
          >
            {multiple ? <CheckboxBox checked={selected} /> : null}
            <View style={styles.rowText}>
              <Text variant={selected ? 'bodyStrong' : 'body'}>{o.label}</Text>
              {o.hint ? (
                <Text variant="small" color="ink3" tone={o.hintTone}>
                  {o.hint}
                </Text>
              ) : null}
            </View>
            {!multiple && selected ? <Icon icon={Check} size={20} color="gold" strokeWidth={2.25} /> : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

/* ---------- Select ---------- */

export type SelectProps<V extends OptionValue> = (SingleChoice<V> | MultiChoice<V>) & {
  label: string;
  options: readonly SelectOption<V>[];
  /** Shown when nothing is chosen ("No plan yet", "All plans"). */
  placeholder?: string;
  help?: string | null;
  error?: string | null;
  disabled?: boolean;
  /** Sheet title (defaults to the label). */
  sheetTitle?: string;
  sheetSubtitle?: string;
  /** Search box in the sheet; on by default above 8 options. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Single choice: adds "Clear" to the sheet while a value is chosen. */
  onClear?: () => void;
  fill?: FieldFill;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/** How many chips the field shows before "+N". */
const MAX_FIELD_CHIPS = 6;

/**
 * A field that opens a sheet of options. Single choice closes the sheet on
 * tap; multiple choice shows the chosen labels as chips and closes with "Done".
 *
 *   <Select label="Plan" options={plans} value={plan} onChange={setPlan} placeholder="No plan yet" />
 *   <Select multiple label="Plans" options={plans} value={plans} onChange={setPlans} placeholder="All plans" />
 */
export function Select<V extends OptionValue>(props: SelectProps<V>) {
  const { colors } = useTheme();
  const {
    label,
    options,
    placeholder,
    help,
    error,
    disabled,
    sheetTitle,
    sheetSubtitle,
    searchPlaceholder,
    onClear,
    fill,
    containerStyle,
    testID,
  } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const searchable = props.searchable ?? options.length > SEARCH_THRESHOLD;
  const shown = searchable && query ? filterOptions(options, query) : options;
  const chosen = props.multiple
    ? selectedOptions(options, props.value)
    : selectedOptions(options, props.value == null ? [] : [props.value]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const extra = chosen.length - MAX_FIELD_CHIPS;
  const chips =
    props.multiple && chosen.length > 0 ? (
      <View style={styles.chips}>
        {chosen.slice(0, MAX_FIELD_CHIPS).map((o) => (
          <View key={String(o.value)} style={[styles.chip, { backgroundColor: colors.bg3 }]}>
            <Text variant="label" color="ink2" numberOfLines={1}>
              {o.label}
            </Text>
          </View>
        ))}
        {extra > 0 ? (
          <View style={[styles.chip, { backgroundColor: colors.bg3 }]}>
            <Text variant="label" color="ink3">{`+${extra}`}</Text>
          </View>
        ) : null}
      </View>
    ) : null;

  const canClear = !props.multiple && onClear != null && props.value != null;
  const footer = props.multiple ? (
    <View style={styles.footer}>
      {props.value.length > 0 ? (
        <ActionButton label="Clear" variant="secondary" onPress={() => props.onChange([])} style={styles.footerSide} />
      ) : null}
      <ActionButton label="Done" onPress={close} />
    </View>
  ) : canClear ? (
    <View style={styles.footer}>
      <ActionButton
        label="Clear"
        variant="secondary"
        onPress={() => {
          onClear?.();
          close();
        }}
      />
    </View>
  ) : undefined;

  return (
    <>
      <FieldTrigger
        label={label}
        valueText={chosen.map((o) => o.label).join(', ')}
        hasValue={chosen.length > 0}
        placeholder={placeholder}
        icon={ChevronDown}
        open={open}
        onPress={() => setOpen(true)}
        help={help}
        error={error}
        disabled={disabled}
        fill={fill}
        accessibilityRole="combobox"
        accessibilityHint={props.multiple ? 'Opens a list. You can choose more than one.' : 'Opens a list'}
        containerStyle={containerStyle}
        testID={testID}
      >
        {chips}
      </FieldTrigger>
      <Sheet
        visible={open}
        onClose={close}
        title={sheetTitle ?? label}
        subtitle={sheetSubtitle}
        snapPoints={searchable ? [0.85] : 'content'}
        scrollable
        footer={footer}
      >
        <View style={styles.sheetBody}>
          {searchable ? (
            <SearchField value={query} onChangeText={setQuery} placeholder={searchPlaceholder ?? 'Search'} fill="bg2" />
          ) : null}
          {props.multiple ? (
            <OptionList<V> multiple options={shown} value={props.value} onChange={props.onChange} accessibilityLabel={label} />
          ) : (
            <OptionList<V>
              options={shown}
              value={props.value}
              onChange={(v) => {
                props.onChange(v);
                close();
              }}
              accessibilityLabel={label}
            />
          )}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 52,
    paddingVertical: space[2] + 2,
    paddingHorizontal: space[3],
    borderRadius: radius.input,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  disabled: {
    opacity: 0.4,
  },
  empty: {
    paddingVertical: space[8],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  footer: {
    flexDirection: 'row',
    gap: space[3],
  },
  footerSide: {
    flexGrow: 0,
  },
  sheetBody: {
    gap: space[3],
    paddingTop: space[2],
  },
});
