import { StyleSheet, View } from 'react-native';

import type { Author, BlogCategory, Post } from '@/api/schemas/blog';
import type { Meta } from '@/api/schemas/meta';
import { Button } from '@/components/Button';
import { PendingButton } from '@/components/PendingButton';
import { ScrollTabs, type ScrollTabItem } from '@/components/ScrollTabs';
import { Sheet } from '@/components/sheet/Sheet';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';

import { AnswersTab, BasicsTab, MediaTab, SearchTab, type SetField } from './DetailsTabs';
import type { DetailsTab, EditorForm, FormErrors } from './form';

const TABS: readonly ScrollTabItem<DetailsTab>[] = [
  { value: 'basics', label: 'Basics' },
  { value: 'search', label: 'Search' },
  { value: 'answers', label: 'Answer engine' },
  { value: 'media', label: 'Media' },
];

export type DetailsSheetProps = {
  visible: boolean;
  onClose: () => void;
  tab: DetailsTab;
  onTabChange: (tab: DetailsTab) => void;
  form: EditorForm;
  onChange: SetField;
  errors: FormErrors;
  /** The saved post (null while new). */
  saved: Post | null;
  meta: Meta | undefined;
  authors: Author[] | undefined;
  categories: BlogCategory[] | undefined;
  /** "Save changes" or "Create post". */
  saveLabel: string;
  savePendingLabel: string;
  canSave: boolean;
  onSave: () => Promise<unknown>;
  onSaveError: (error: unknown) => void;
};

/**
 * Details (brief 8.11): everything about the post except its title and body,
 * in four tabs. The fields edit the editor's form directly, so "Done" keeps
 * the changes for the next save and "Save changes" saves everything at once.
 * The sheet renders at the app root, so every value arrives as a prop.
 */
export function DetailsSheet({
  visible,
  onClose,
  tab,
  onTabChange,
  form,
  onChange,
  errors,
  saved,
  meta,
  authors,
  categories,
  saveLabel,
  savePendingLabel,
  canSave,
  onSave,
  onSaveError,
}: DetailsSheetProps) {
  const { colors } = useTheme();

  let panel;
  switch (tab) {
    case 'basics':
      panel = <BasicsTab form={form} onChange={onChange} errors={errors} saved={saved} meta={meta} authors={authors} categories={categories} />;
      break;
    case 'search':
      panel = <SearchTab form={form} onChange={onChange} errors={errors} savedSlug={saved?.slug ?? null} />;
      break;
    case 'answers':
      panel = <AnswersTab form={form} onChange={onChange} errors={errors} />;
      break;
    case 'media':
      panel = <MediaTab form={form} onChange={onChange} errors={errors} />;
      break;
  }

  const footer = (
    <View style={styles.footer}>
      <Button label="Done" variant="secondary" onPress={onClose} style={styles.flex} />
      <PendingButton
        label={saveLabel}
        pendingLabel={savePendingLabel}
        disabled={!canSave}
        onPress={onSave}
        onError={onSaveError}
        offlineHint={false}
        style={styles.flex}
      />
    </View>
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Details"
      subtitle={form.title.trim() || 'Untitled post'}
      scrollable
      snapPoints={[0.92]}
      footer={footer}
    >
      <ScrollTabs
        items={TABS}
        active={tab}
        onChange={onTabChange}
        inset={0}
        bleed={false}
        accessibilityLabel="Details sections"
        style={{ backgroundColor: colors.surface }}
      />
      <View style={styles.panel}>{panel}</View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: { flexDirection: 'row', gap: space[3] },
  panel: { paddingTop: space[5] },
});
