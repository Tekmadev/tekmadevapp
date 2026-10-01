import { CircleAlert } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';

import { countState } from './count';
import { INPUT_PAD_H } from './InputChrome';

export type FieldCount = {
  length: number;
  limit: number;
  /** What is being counted, for TalkBack ("42 of 60 characters"). Default "characters". */
  noun?: string;
};

export type FieldProps = {
  /** A label above the control, for controls without a floating label (Slider, a group of checkboxes). */
  label?: string;
  /** Shown at the right of the label row (e.g. a slider's live value). */
  labelAccessory?: ReactNode;
  help?: string | null;
  /** Replaces the help text while present. */
  error?: string | null;
  /** "42/60": warn near the limit, signal over it. */
  count?: FieldCount;
  disabled?: boolean;
  /** The control already speaks the label (Slider, ChipsInput): hide the visible one from TalkBack so it is not read twice. */
  visualLabel?: boolean;
  /** Indent the help line to line up with text inside a boxed field (default) or not at all. */
  inset?: 'input' | 'none';
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/** Wraps a control with its label, help or error line, and character count. */
export function Field({
  label,
  labelAccessory,
  help,
  error,
  count,
  disabled,
  visualLabel = false,
  inset = 'input',
  style,
  children,
}: FieldProps) {
  return (
    <View style={[styles.field, disabled ? styles.disabled : null, style]}>
      {label || labelAccessory ? (
        <View
          style={styles.labelRow}
          importantForAccessibility={visualLabel ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={visualLabel}
        >
          {label ? (
            <Text variant="label" color="ink2" style={styles.labelText}>
              {label}
            </Text>
          ) : (
            <View style={styles.labelText} />
          )}
          {labelAccessory}
        </View>
      ) : null}
      {children}
      <FieldMessage help={help} error={error} count={count} inset={inset} />
    </View>
  );
}

type FieldMessageProps = {
  help?: string | null;
  error?: string | null;
  count?: FieldCount;
  inset?: 'input' | 'none';
};

/** The line under a control: error (with an icon) or help on the left, the count on the right. */
export function FieldMessage({ help, error, count, inset = 'input' }: FieldMessageProps) {
  if (!help && !error && !count) return null;
  return (
    <View style={[styles.message, inset === 'input' ? styles.inset : null]}>
      <View style={styles.messageText}>
        {error ? (
          <View style={styles.error} accessibilityLiveRegion="polite">
            <View style={styles.errorIcon}>
              <Icon icon={CircleAlert} size={14} color="signal" strokeWidth={2} />
            </View>
            <Text variant="small" color="signal" style={styles.flex}>
              {error}
            </Text>
          </View>
        ) : help ? (
          <Text variant="small" color="ink3">
            {help}
          </Text>
        ) : null}
      </View>
      {count ? <CharacterCount length={count.length} limit={count.limit} noun={count.noun} /> : null}
    </View>
  );
}

/** "42/60" in tabular figures: ink4, warn in the last 10% of the limit, signal over it. */
export function CharacterCount({ length, limit, noun = 'characters' }: FieldCount) {
  const state = countState(length, limit);
  return (
    <Text
      variant="small"
      tabular
      color={state === 'over' ? 'signal' : 'ink4'}
      tone={state === 'near' ? 'warn' : undefined}
      accessibilityLabel={`${length} of ${limit} ${noun}`}
    >
      {`${length}/${limit}`}
    </Text>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: space[2] - 2,
  },
  disabled: {
    opacity: 0.5,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  labelText: {
    flex: 1,
  },
  message: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  inset: {
    paddingHorizontal: INPUT_PAD_H,
  },
  messageText: {
    flex: 1,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  errorIcon: {
    paddingTop: 2,
  },
  flex: {
    flex: 1,
  },
});
