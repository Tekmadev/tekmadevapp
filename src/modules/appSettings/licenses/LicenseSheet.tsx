import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { Sheet } from '@/components/sheet';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';

import { entryTexts, platformLabel, type LicenseEntry } from './data';

type LicenseSheetProps = {
  entry: LicenseEntry;
  visible: boolean;
  onClose: () => void;
};

/**
 * One package's license: who makes it, its copyright lines, then the full text
 * in mono. Long texts (Apache 2.0 runs to 200 lines) scroll inside the sheet;
 * each paragraph is its own Text so a long license lays out quickly.
 */
export function LicenseSheet({ entry, visible, onClose }: LicenseSheetProps) {
  const subtitle = [entry.version, entry.license].filter(Boolean).join(' · ');
  return (
    <Sheet visible={visible} onClose={onClose} title={entry.name} subtitle={subtitle} scrollable testID="license-sheet">
      <LicenseBody entry={entry} />
    </Sheet>
  );
}

function LicenseBody({ entry }: { entry: LicenseEntry }) {
  const { colors } = useTheme();
  const about = [entry.by ? `By ${entry.by}` : null, entry.kind === 'font' ? 'Font' : platformLabel(entry.platforms)]
    .filter(Boolean)
    .join(' · ');
  const texts = entryTexts(entry);

  return (
    <View style={styles.body}>
      {about ? (
        <Text variant="small" color="ink3">
          {about}
        </Text>
      ) : null}
      {entry.notice ? (
        <Text variant="small" color="ink2" selectable>
          {entry.notice}
        </Text>
      ) : null}
      {texts.map((text, t) => (
        <View key={`text-${t}`} style={[styles.panel, { backgroundColor: colors.bg2, borderColor: colors.lineSoft }]}>
          {paragraphs(text).map((paragraph, p) => (
            <Text key={`p-${p}`} variant="mono" color="ink2" selectable>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function paragraphs(text: string): string[] {
  return text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
}

const styles = StyleSheet.create({
  body: { gap: space[3], paddingBottom: space[4] },
  panel: {
    gap: space[3],
    padding: space[4],
    borderRadius: radius.input,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
