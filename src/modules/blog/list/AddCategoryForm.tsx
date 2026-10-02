import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { newIdempotencyKey } from '@/api/client';
import { errorMessage, fieldErrors } from '@/api/errors';
import { CATEGORY_NAME_MAX, type BlogCategory } from '@/api/schemas/blog';
import { TextField } from '@/components/form/TextField';
import { PendingButton } from '@/components/PendingButton';
import { SubmitGroup } from '@/components/SubmitGroup';
import { space } from '@/design/tokens';
import { notice } from '@/lib/notice';

import { BLOG_COPY, categoryNameError, normalizeName } from './logic';

export type AddCategoryFormProps = {
  /** Every category, for the duplicate name check. */
  categories: readonly BlogCategory[];
  /** POST /blog/categories. Resolves once the cache holds the new category. */
  onAdd: (name: string, idempotencyKey: string) => Promise<unknown>;
};

/**
 * "New category" (name up to 60 characters) with an Add button. One
 * Idempotency-Key per name: a retry of the same name reuses it, a new name
 * gets a new one.
 */
export function AddCategoryForm({ categories, onAdd }: AddCategoryFormProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<{ name: string; key: string } | null>(null);

  const add = async () => {
    const clean = normalizeName(name);
    const problem = categoryNameError(clean, categories);
    if (problem) {
      setError(problem);
      return;
    }
    const key = intent?.name === clean ? intent.key : newIdempotencyKey();
    setIntent({ name: clean, key });
    await onAdd(clean, key);
    setName('');
    setIntent(null);
    notice.ok(BLOG_COPY.categoryAdded);
  };

  const onError = (e: unknown) => setError(fieldErrors(e).name ?? errorMessage(e));

  return (
    <SubmitGroup>
      <View style={styles.form}>
        <TextField
          label="New category"
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (error) setError(null);
          }}
          maxLength={CATEGORY_NAME_MAX}
          error={error}
          autoCapitalize="words"
          returnKeyType="done"
        />
        <PendingButton label="Add category" pendingLabel="Adding" icon={Plus} variant="secondary" onPress={add} onError={onError} style={styles.button} />
      </View>
    </SubmitGroup>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[3] },
  button: { alignSelf: 'flex-start' },
});
