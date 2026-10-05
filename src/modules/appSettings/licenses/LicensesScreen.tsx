import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Divider } from '@/components/Divider';
import { ListRow } from '@/components/ListRow';
import { ScreenList } from '@/components/ScreenList';
import { Text } from '@/components/Text';
import { layout, space } from '@/design/tokens';

import { entryA11yLabel, entrySubtitle, LICENSES_COPY, licenseRows, type LicenseEntry, type LicenseRow } from './data';
import { LicenseSheet } from './LicenseSheet';

/** Built once: the list never changes while the app runs. */
const ROWS = licenseRows();

const rowKey = (row: LicenseRow) => row.key;
const rowType = (row: LicenseRow) => row.type;

/** A hairline between two packages, none next to a section heading. */
function Separator({ leadingItem, trailingItem }: { leadingItem?: LicenseRow; trailingItem?: LicenseRow }) {
  if (leadingItem?.type !== 'item' || trailingItem?.type !== 'item') return null;
  return <Divider inset />;
}

/**
 * More > Legal > Open-source licenses (store requirement): every open-source
 * project inside the app, native libraries and fonts first, then the npm
 * packages, each with its version and license. Tapping one opens its full
 * license text in a sheet. The data is generated (scripts/gen-licenses.mjs) and
 * bundled, so this works offline and never fails to load.
 */
export function LicensesScreen() {
  const [selected, setSelected] = useState<LicenseEntry | null>(null);
  const [open, setOpen] = useState(false);

  const show = (entry: LicenseEntry) => {
    setSelected(entry);
    setOpen(true);
  };

  const renderItem = ({ item }: ListRenderItemInfo<LicenseRow>) =>
    item.type === 'header' ? (
      <SectionHeader title={item.title} count={item.count} />
    ) : (
      <ListRow
        itemKey={item.key}
        title={item.entry.name}
        subtitle={entrySubtitle(item.entry)}
        onPress={() => show(item.entry)}
        accessibilityLabel={entryA11yLabel(item.entry)}
        accessibilityHint="Shows the license"
      />
    );

  return (
    <>
      <ScreenList<LicenseRow>
        title={LICENSES_COPY.title}
        back
        data={ROWS}
        renderItem={renderItem}
        keyExtractor={rowKey}
        getItemType={rowType}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <Text variant="body" color="ink2" style={styles.intro}>
            {LICENSES_COPY.intro}
          </Text>
        }
        ListFooterComponent={<View style={styles.footer} />}
        offlineBanner={false}
        testID="licenses-screen"
      />
      {selected ? <LicenseSheet entry={selected} visible={open} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.section} accessible accessibilityRole="header" accessibilityLabel={`${title}, ${count}`}>
      <Text variant="eyebrow" style={styles.sectionTitle}>
        {title}
      </Text>
      <Text variant="caption" color="ink4" tabular>
        {count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: layout.gutter, paddingBottom: space[2] },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: layout.gutter,
    paddingTop: space[6],
    paddingBottom: space[2],
  },
  sectionTitle: { flex: 1 },
  footer: { height: space[6] },
});
