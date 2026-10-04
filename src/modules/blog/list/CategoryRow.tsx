import { Pencil, Trash2 } from 'lucide-react-native';
import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { errorMessage, fieldErrors } from '@/api/errors';
import { CATEGORY_NAME_MAX, type BlogCategory } from '@/api/schemas/blog';
import { Button } from '@/components/Button';
import { TextField } from '@/components/form/TextField';
import { IconButton } from '@/components/IconButton';
import { PendingButton } from '@/components/PendingButton';
import { PressableScale } from '@/components/PressableScale';
import { SubmitGroup } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { BLOG_COPY, categoryNameError, normalizeName, postCountText } from './logic';

export type CategoryRowProps = {
  category: BlogCategory;
  /** Every category, for the duplicate name check. */
  categories: readonly BlogCategory[];
  editing: boolean;
  /** No rename or delete (`blog.write` missing): the row only reads. */
  readOnly?: boolean;
  index: number;
  still: boolean;
  onEdit: (category: BlogCategory, index: number) => void;
  onCancel: () => void;
  /** PATCH /blog/categories/:id. Resolves once the cache holds the server's answer. */
  onRename: (category: BlogCategory, name: string) => Promise<unknown>;
  onDelete: (category: BlogCategory) => void;
  /** The rename field got focus: bring the row above the keyboard. */
  onFieldFocus: (index: number) => void;
};

/**
 * One blog category: name, post count and its slug (which never changes).
 * Tap or the pencil renames it in place; the bin asks to delete it. Read only,
 * it is the same row without the buttons (same height, so nothing jumps).
 */
export const CategoryRow = memo(function CategoryRow({
  category,
  categories,
  editing,
  readOnly = false,
  index,
  still,
  onEdit,
  onCancel,
  onRename,
  onDelete,
  onFieldFocus,
}: CategoryRowProps) {
  const { colors } = useTheme();
  const count = postCountText(category.postCount);

  return (
    <Animated.View entering={still || index >= STAGGER_MAX ? undefined : enterPull(index)} style={{ backgroundColor: colors.bg }}>
      {editing ? (
        // Keyed by id: a recycled cell never shows another category's draft.
        <RenameForm
          key={category.id}
          category={category}
          categories={categories}
          onCancel={onCancel}
          onRename={onRename}
          onFocus={() => onFieldFocus(index)}
        />
      ) : readOnly ? (
        <View style={styles.row}>
          <View accessible accessibilityLabel={`${category.name}, ${count}, slug ${category.slug}`} style={styles.texts}>
            <CategoryTexts category={category} count={count} />
          </View>
        </View>
      ) : (
        <View style={styles.row}>
          <PressableScale
            onPress={() => onEdit(category, index)}
            pressedScale={0.985}
            accessibilityLabel={`${category.name}, ${count}, slug ${category.slug}`}
            accessibilityHint="Renames the category"
            style={styles.texts}
          >
            <CategoryTexts category={category} count={count} />
          </PressableScale>
          <IconButton icon={Pencil} size={20} accessibilityLabel={`Rename ${category.name}`} onPress={() => onEdit(category, index)} />
          <IconButton icon={Trash2} size={20} accessibilityLabel={`Delete ${category.name}`} onPress={() => onDelete(category)} />
        </View>
      )}
    </Animated.View>
  );
});

/** Name, then the post count and the slug. */
function CategoryTexts({ category, count }: { category: BlogCategory; count: string }) {
  return (
    <>
      <Text variant="bodyStrong" numberOfLines={2}>
        {category.name}
      </Text>
      <View style={styles.metaLine}>
        <Text variant="small" color="ink3" tabular>
          {count}
        </Text>
        <Text variant="mono" color="ink4" numberOfLines={1} style={styles.slug}>
          {category.slug}
        </Text>
      </View>
    </>
  );
}

function RenameForm({
  category,
  categories,
  onCancel,
  onRename,
  onFocus,
}: {
  category: BlogCategory;
  categories: readonly BlogCategory[];
  onCancel: () => void;
  onRename: (category: BlogCategory, name: string) => Promise<unknown>;
  onFocus: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const clean = normalizeName(name);
    // Nothing changed: just close.
    if (clean === category.name) {
      onCancel();
      return;
    }
    const problem = categoryNameError(clean, categories, category.id);
    if (problem) {
      setError(problem);
      return;
    }
    await onRename(category, clean);
    notice.ok(BLOG_COPY.categoryRenamed);
    onCancel();
  };

  const onError = (e: unknown) => setError(fieldErrors(e).name ?? errorMessage(e));

  return (
    <SubmitGroup>
      <View style={styles.form}>
        <TextField
          label="Category name"
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (error) setError(null);
          }}
          maxLength={CATEGORY_NAME_MAX}
          error={error}
          help={`The slug stays ${category.slug}.`}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onFocus={onFocus}
        />
        <View style={styles.buttons}>
          <Button label="Cancel" variant="ghost" size="sm" onPress={onCancel} />
          <PendingButton label="Save" pendingLabel="Saving" size="sm" onPress={save} onError={onError} />
        </View>
      </View>
    </SubmitGroup>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: layout.gutter,
    paddingRight: space[1],
  },
  texts: { flex: 1, gap: 2, paddingVertical: space[3], paddingRight: space[2] },
  metaLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space[3], rowGap: 2 },
  slug: { flexShrink: 1 },
  form: { paddingHorizontal: layout.gutter, paddingVertical: space[3], gap: space[3] },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-start', gap: space[2] },
});
