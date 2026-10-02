import {
  Bold,
  ChevronLeft,
  Heading2,
  Heading3,
  ImagePlus,
  Info,
  Italic,
  KeyboardOff,
  Lightbulb,
  Link2,
  List,
  ListOrdered,
  MessageCircleQuestion,
  MessageSquareWarning,
  MousePointerClick,
  SeparatorHorizontal,
  Table,
  TextQuote,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { Fragment, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { CalloutVariant } from '@/api/schemas/blog';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { layout, radius, space, type Tone } from '@/design/tokens';

export type ToolbarAction =
  | 'h2'
  | 'h3'
  | 'bold'
  | 'italic'
  | 'link'
  | 'bullet'
  | 'numbered'
  | 'quote'
  | 'answer'
  | 'table'
  | 'cta'
  | 'divider'
  | 'image';

type Tool = { action: ToolbarAction | 'callout'; icon: LucideIcon; label: string };

/** In toolbar order, grouped: text styles, lists and quotes, blocks, media. */
const GROUPS: Tool[][] = [
  [
    { action: 'h2', icon: Heading2, label: 'Heading 2' },
    { action: 'h3', icon: Heading3, label: 'Heading 3' },
    { action: 'bold', icon: Bold, label: 'Bold' },
    { action: 'italic', icon: Italic, label: 'Italic' },
    { action: 'link', icon: Link2, label: 'Link' },
  ],
  [
    { action: 'bullet', icon: List, label: 'Bulleted list' },
    { action: 'numbered', icon: ListOrdered, label: 'Numbered list' },
    { action: 'quote', icon: TextQuote, label: 'Quote' },
  ],
  [
    { action: 'callout', icon: MessageSquareWarning, label: 'Callout' },
    { action: 'answer', icon: MessageCircleQuestion, label: 'Short answer (Q&A)' },
    { action: 'table', icon: Table, label: 'Table' },
    { action: 'cta', icon: MousePointerClick, label: 'Call to action' },
    { action: 'divider', icon: SeparatorHorizontal, label: 'Divider' },
  ],
  [{ action: 'image', icon: ImagePlus, label: 'Image' }],
];

const CALLOUTS: { variant: CalloutVariant; icon: LucideIcon; label: string; tone: Tone }[] = [
  { variant: 'tip', icon: Lightbulb, label: 'Tip', tone: 'ok' },
  { variant: 'info', icon: Info, label: 'Info', tone: 'gold' },
  { variant: 'warning', icon: TriangleAlert, label: 'Warning', tone: 'warn' },
];

export const TOOLBAR_HEIGHT = 52;
/** The 36dp variant pills reach the 48dp touch target. */
const CHOICE_SLOP = { top: 6, bottom: 6 };

export type FormatToolbarProps = {
  onAction: (action: ToolbarAction) => void;
  onCallout: (variant: CalloutVariant) => void;
  onHideKeyboard: () => void;
};

/**
 * The formatting bar pinned above the keyboard while the body is being
 * written. One row that scrolls sideways; "Callout" opens its three variants
 * in place, so the keyboard never closes. Taps never take focus from the body.
 */
export function FormatToolbar({ onAction, onCallout, onHideKeyboard }: FormatToolbarProps) {
  const { colors } = useTheme();
  const [callouts, setCallouts] = useState(false);

  return (
    <View style={[styles.bar, { backgroundColor: colors.bg2, borderTopColor: colors.line }]} accessibilityRole="toolbar">
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        style={styles.flex}
      >
        {callouts ? (
          <>
            <ToolButton icon={ChevronLeft} label="Back to formatting" onPress={() => setCallouts(false)} />
            {CALLOUTS.map((c) => (
              <PressableScale
                key={c.variant}
                onPress={() => {
                  setCallouts(false);
                  onCallout(c.variant);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${c.label} callout`}
                hitSlop={CHOICE_SLOP}
                style={[styles.choice, { borderColor: colors.lineStrong }]}
              >
                <Icon icon={c.icon} size={16} tone={c.tone} strokeWidth={2} />
                <Text variant="label" color="ink">
                  {c.label}
                </Text>
              </PressableScale>
            ))}
          </>
        ) : (
          GROUPS.map((group, g) => (
            <Fragment key={g}>
              {g > 0 ? <View style={[styles.separator, { backgroundColor: colors.line }]} /> : null}
              {group.map((tool) => (
                <ToolButton
                  key={tool.action}
                  icon={tool.icon}
                  label={tool.label}
                  onPress={() => (tool.action === 'callout' ? setCallouts(true) : onAction(tool.action))}
                />
              ))}
            </Fragment>
          ))
        )}
      </ScrollView>
      <View style={[styles.separator, { backgroundColor: colors.line }]} />
      <ToolButton icon={KeyboardOff} label="Hide keyboard" onPress={onHideKeyboard} />
    </View>
  );
}

function ToolButton({ icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.tool}>
      <Icon icon={icon} size={20} color="ink2" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: {
    height: TOOLBAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
  },
  row: { alignItems: 'center', paddingHorizontal: space[1] },
  tool: {
    width: 44,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: { width: 1, height: 24, marginHorizontal: space[1] },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    height: 36,
    paddingHorizontal: space[3],
    marginHorizontal: space[1],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
