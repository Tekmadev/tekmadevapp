import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Sparkles, TriangleAlert, X } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { newIdempotencyKey } from '@/api/client';
import { blogKeys, createCategory } from '@/api/endpoints/blog';
import { fieldErrors } from '@/api/errors';
import { CATEGORY_NAME_MAX, type Author, type BlogCategory, type Post, type PostStatus } from '@/api/schemas/blog';
import type { Meta } from '@/api/schemas/meta';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipsInput } from '@/components/form/ChipsInput';
import { FieldMessage } from '@/components/form/Field';
import { FormSection } from '@/components/form/FormSection';
import { Select, type SelectOption } from '@/components/form/Select';
import { SwitchRow } from '@/components/form/Switch';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import { Icon } from '@/components/Icon';
import { KeyValue } from '@/components/KeyValue';
import { Menu } from '@/components/Menu';
import { PendingButton } from '@/components/PendingButton';
import { reportSubmitError } from '@/components/SubmitGroup';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { countLabel } from '@/lib/format';
import { notice } from '@/lib/notice';
import { finalizeSlug, slugifyLive } from '@/lib/text';

import {
  META_DESCRIPTION_TARGET,
  META_TITLE_TARGET,
  moveRow,
  newRowKey,
  provenanceLabel,
  searchSnippet,
  type EditorForm,
  type FormErrors,
} from './form';
import { ImageUploadField } from '../media/ImageUploadField';
import type { ImageUpload } from '../media/useImageUpload';
import { statusOptions } from './labels';

/** Sets one form field (the editor owns the form; the sheet edits it in place). */
export type SetField = <K extends keyof EditorForm>(key: K, value: EditorForm[K]) => void;

type TabProps = {
  form: EditorForm;
  onChange: SetField;
  errors: FormErrors;
};

/* ------------------------------------------------------------------ */
/* Basics                                                               */
/* ------------------------------------------------------------------ */

export type BasicsTabProps = TabProps & {
  /** The saved post (null while new). */
  saved: Post | null;
  meta: Meta | undefined;
  authors: Author[] | undefined;
  categories: BlogCategory[] | undefined;
};

const byName = (a: BlogCategory, b: BlogCategory) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

/**
 * Slug (hint, published-link warning), status (never "Scheduled"), author,
 * category with "+ New category" inline, excerpt, featured, and where an AI
 * draft came from.
 */
export function BasicsTab({ form, onChange, errors, saved, meta, authors, categories }: BasicsTabProps) {
  const { tones } = useTheme();
  const slugMoves = saved?.status === 'published' && finalizeSlug(form.slug) !== saved.slug;

  const authorOptions: SelectOption<string>[] = (authors ?? (saved ? [saved.author] : [])).map((a) => ({
    value: a.id,
    label: a.name,
    hint: a.role ?? undefined,
  }));
  const authorValue = form.authorId ?? saved?.author.id ?? authors?.[0]?.id ?? null;

  const categoryOptions: SelectOption<string>[] = (
    categories ?? (saved?.category ? [{ ...saved.category, slug: '', postCount: 0 }] : [])
  ).map((c) => ({ value: c.id, label: c.name, hint: categories ? countLabel(c.postCount, 'post', 'posts') : undefined }));

  return (
    <View style={styles.tab}>
      <View>
        <TextField
          label="Slug"
          prefix="/blog/"
          value={form.slug}
          onChangeText={(v) => onChange('slug', slugifyLive(v))}
          error={errors.slug}
          help="Leave blank to auto-generate."
          monospace
          autoCapitalize="none"
          autoCorrect={false}
        />
        {slugMoves ? (
          <View style={[styles.warn, { backgroundColor: tones.warn.bg }]} accessibilityLiveRegion="polite">
            <Icon icon={TriangleAlert} size={16} tone="warn" strokeWidth={2} />
            <Text variant="small" tone="warn" style={styles.flex}>
              The old link will stop working.
            </Text>
          </View>
        ) : null}
      </View>

      <Select<PostStatus>
        label="Status"
        options={statusOptions(meta)}
        value={form.status}
        onChange={(v) => onChange('status', v)}
        error={errors.status}
        help={form.status === 'published' && saved?.status !== 'published' ? 'Saving asks you to confirm publishing.' : null}
      />

      <Select<string>
        label="Author"
        options={authorOptions}
        value={authorValue}
        onChange={(v) => onChange('authorId', v)}
        error={errors.authorId ?? errors.author}
        placeholder={authors ? 'Pick an author' : 'Loading authors'}
        disabled={authorOptions.length === 0}
      />

      <View style={styles.category}>
        <Select<string>
          label="Category"
          options={categoryOptions}
          value={form.categoryId}
          onChange={(v) => onChange('categoryId', v)}
          onClear={() => onChange('categoryId', null)}
          error={errors.categoryId ?? errors.category}
          placeholder="No category"
        />
        <NewCategory onCreated={(c) => onChange('categoryId', c.id)} />
      </View>

      <TextArea
        label="Excerpt"
        value={form.excerpt}
        onChangeText={(v) => onChange('excerpt', v)}
        error={errors.excerpt}
        help="A sentence or two under the title. Lists and search use it too."
        minLines={2}
        maxLines={6}
      />

      <SwitchRow label="Featured" value={form.featured} onValueChange={(v) => onChange('featured', v)} />

      {saved?.provenance ? (
        <FormSection title="Provenance" description="This post was drafted by AI. Check the facts before publishing.">
          <Card padded={false}>
            <View style={styles.provenanceHead}>
              <Badge label="AI draft" tone="gold" icon={Sparkles} />
            </View>
            <KeyValue
              items={[
                { label: 'Source', value: provenanceLabel(saved.provenance.source) },
                saved.provenance.sourceTitle ? { label: 'From', value: saved.provenance.sourceTitle } : null,
                { label: 'Model', value: saved.provenance.model, mono: true },
              ]}
            />
          </Card>
        </FormSection>
      ) : null}
    </View>
  );
}

/** "+ New category": a name field that opens in place, so the category list never loses the post's place. */
function NewCategory({ onCreated }: { onCreated: (category: BlogCategory) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<{ name: string; key: string } | null>(null);

  if (!open) {
    return <Button label="New category" icon={Plus} variant="ghost" size="sm" onPress={() => setOpen(true)} style={styles.newCategory} />;
  }

  const add = async () => {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) {
      setError('Enter a category name.');
      haptics.error();
      return;
    }
    // Same name as the last try: the same intent, so the same key.
    const key = intent?.name === clean ? intent.key : newIdempotencyKey();
    if (key !== intent?.key) setIntent({ name: clean, key });
    const created = await createCategory(clean, key);
    queryClient.setQueryData<BlogCategory[]>(blogKeys.categories(), (old) =>
      [...(old ?? []).filter((c) => c.id !== created.id), created].sort(byName),
    );
    void queryClient.invalidateQueries({ queryKey: blogKeys.categories() });
    onCreated(created);
    haptics.success();
    notice.ok('Category added.');
    setOpen(false);
    setName('');
    setIntent(null);
  };

  return (
    <View style={styles.newCategoryForm}>
      <TextField
        label="New category"
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (error) setError(null);
        }}
        error={error}
        maxLength={CATEGORY_NAME_MAX}
        autoCapitalize="words"
        autoFocus
        returnKeyType="done"
      />
      <View style={styles.row}>
        <Button
          label="Cancel"
          variant="ghost"
          size="sm"
          onPress={() => {
            setOpen(false);
            setName('');
            setError(null);
          }}
        />
        <PendingButton
          label="Add category"
          pendingLabel="Adding"
          size="sm"
          onPress={add}
          onError={(e) => {
            const fields = fieldErrors(e);
            if (fields.name) {
              setError(fields.name);
              haptics.error();
            } else reportSubmitError(e);
          }}
        />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Search                                                               */
/* ------------------------------------------------------------------ */

export type SearchTabProps = TabProps & { savedSlug: string | null };

/**
 * Target query, meta title and description with live counts (aim for 60 and
 * 155), keywords and tags as chips, canonical URL, noindex, and a live
 * Google-style result.
 */
export function SearchTab({ form, onChange, errors, savedSlug }: SearchTabProps) {
  return (
    <View style={styles.tab}>
      <TextField
        label="Target query"
        value={form.targetQuery}
        onChangeText={(v) => onChange('targetQuery', v)}
        error={errors.targetQuery}
        help="The search this post should rank for."
        autoCapitalize="none"
      />
      <TextField
        label="Meta title"
        value={form.metaTitle}
        onChangeText={(v) => onChange('metaTitle', v)}
        error={errors.metaTitle}
        softLimit={META_TITLE_TARGET}
        help={`Aim for ${META_TITLE_TARGET} characters or fewer. Blank uses the title.`}
      />
      <TextArea
        label="Meta description"
        value={form.metaDescription}
        onChangeText={(v) => onChange('metaDescription', v)}
        error={errors.metaDescription}
        softLimit={META_DESCRIPTION_TARGET}
        help={`Aim for ${META_DESCRIPTION_TARGET} characters or fewer.`}
        minLines={3}
        maxLines={6}
      />

      <SearchResultPreview form={form} savedSlug={savedSlug} />

      <ChipsInput label="Keywords" value={form.keywords} onChange={(v) => onChange('keywords', v)} noun="keyword" error={errors.keywords} />
      <ChipsInput
        label="Tags"
        value={form.tags}
        onChange={(v) => onChange('tags', v)}
        noun="tag"
        normalize={(raw) => raw.trim().toLowerCase()}
        error={errors.tags}
      />
      <TextField
        label="Canonical URL"
        value={form.canonicalUrl}
        onChangeText={(v) => onChange('canonicalUrl', v)}
        error={errors.canonicalUrl}
        help="Only when this post first appeared on another site."
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <SwitchRow
        label="Hide from search engines (noindex)"
        description="Search engines are asked not to list this post."
        value={form.noindex}
        onValueChange={(v) => onChange('noindex', v)}
      />
    </View>
  );
}

/** How the post could look on a Google results page, from the fields above as they are typed. */
function SearchResultPreview({ form, savedSlug }: { form: EditorForm; savedSlug: string | null }) {
  const { colors } = useTheme();
  const snippet = searchSnippet(form, savedSlug);
  return (
    <View
      style={[styles.serp, { backgroundColor: colors.bg2, borderColor: colors.line }]}
      accessible
      accessibilityLabel={`Search result preview. ${snippet.title || 'No title yet'}. ${snippet.description || 'No description yet'}`}
    >
      <Text variant="eyebrow">Search result preview</Text>
      <View style={styles.serpSite}>
        <Avatar name="Tekmadev" size={28} />
        <View style={styles.flex}>
          <Text variant="label" color="ink2" numberOfLines={1}>
            Tekmadev
          </Text>
          <Text variant="caption" color="ink3" numberOfLines={1}>
            {snippet.breadcrumb}
          </Text>
        </View>
      </View>
      <Text variant="title" tone="gold" numberOfLines={2}>
        {snippet.title || 'Your title appears here'}
      </Text>
      <Text variant="small" color={snippet.description ? 'ink2' : 'ink4'} numberOfLines={3}>
        {snippet.description || 'Add a meta description or an excerpt. Without one, Google picks text from the page.'}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Answer engine                                                        */
/* ------------------------------------------------------------------ */

/** Move up, move down, remove: one 48dp menu per row instead of three cramped buttons. */
function RowMenu({ index, count, noun, onMove, onRemove }: { index: number; count: number; noun: string; onMove: (dir: -1 | 1) => void; onRemove: () => void }) {
  return (
    <Menu
      accessibilityLabel={`${noun} ${index + 1} options`}
      title={`${noun} ${index + 1}`}
      items={[
        { label: 'Move up', icon: ArrowUp, disabled: index === 0, onPress: () => onMove(-1) },
        { label: 'Move down', icon: ArrowDown, disabled: index === count - 1, onPress: () => onMove(1) },
        { label: 'Remove', icon: X, destructive: true, onPress: onRemove },
      ]}
    />
  );
}

/** Key takeaways (one per row) and FAQs (question and answer pairs), both reorderable. */
export function AnswersTab({ form, onChange, errors }: TabProps) {
  const { colors } = useTheme();
  // The row just added takes the focus.
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const takeaways = form.keyTakeaways;
  const faqs = form.faqs;

  return (
    <View style={styles.tab}>
      <FormSection title="Key takeaways" description="One per row. They show in a box at the top of the post.">
        {takeaways.map((row, i) => (
          <View key={row.key} style={styles.rowLine}>
            <TextArea
              label={`Takeaway ${i + 1}`}
              value={row.text}
              onChangeText={(text) => onChange('keyTakeaways', takeaways.map((r) => (r.key === row.key ? { ...r, text } : r)))}
              minLines={1}
              maxLines={4}
              autoFocus={row.key === focusKey}
              containerStyle={styles.flex}
            />
            <RowMenu
              index={i}
              count={takeaways.length}
              noun="Takeaway"
              onMove={(dir) => onChange('keyTakeaways', moveRow(takeaways, i, dir))}
              onRemove={() => onChange('keyTakeaways', takeaways.filter((r) => r.key !== row.key))}
            />
          </View>
        ))}
        {errors.keyTakeaways ? <FieldMessage error={errors.keyTakeaways} inset="none" /> : null}
        <Button
          label="Add takeaway"
          icon={Plus}
          variant="secondary"
          size="sm"
          onPress={() => {
            const key = newRowKey();
            setFocusKey(key);
            onChange('keyTakeaways', [...takeaways, { key, text: '' }]);
          }}
          style={styles.add}
        />
      </FormSection>

      <FormSection title="FAQs" description="Questions and answers shown at the end of the post.">
        {faqs.map((row, i) => (
          <View key={row.key} style={[styles.faq, { borderColor: colors.line }]}>
            <View style={styles.faqHead}>
              <Text variant="label" color="ink3" style={styles.flex}>{`Question ${i + 1}`}</Text>
              <RowMenu
                index={i}
                count={faqs.length}
                noun="Question"
                onMove={(dir) => onChange('faqs', moveRow(faqs, i, dir))}
                onRemove={() => onChange('faqs', faqs.filter((r) => r.key !== row.key))}
              />
            </View>
            <TextField
              label="Question"
              value={row.question}
              onChangeText={(question) => onChange('faqs', faqs.map((r) => (r.key === row.key ? { ...r, question } : r)))}
              autoFocus={row.key === focusKey}
            />
            <TextArea
              label="Answer"
              value={row.answer}
              onChangeText={(answer) => onChange('faqs', faqs.map((r) => (r.key === row.key ? { ...r, answer } : r)))}
              minLines={2}
              maxLines={8}
            />
          </View>
        ))}
        {errors.faqs ? <FieldMessage error={errors.faqs} inset="none" /> : null}
        <Button
          label="Add question"
          icon={Plus}
          variant="secondary"
          size="sm"
          onPress={() => {
            const key = newRowKey();
            setFocusKey(key);
            onChange('faqs', [...faqs, { key, question: '', answer: '' }]);
          }}
          style={styles.add}
        />
      </FormSection>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Media                                                                */
/* ------------------------------------------------------------------ */

/** The editor's upload slots for the Media tab (they live in the editor, so an upload survives closing the sheet). */
export type MediaUploads = { cover: ImageUpload; social: ImageUpload };

export type MediaTabProps = TabProps & { uploads: MediaUploads };

export const COVER_HINT = '1200 x 630 works everywhere: the post, the blog list and social shares.';

/**
 * Cover image (upload or link, live preview with remove, the size hint) and
 * its alt text, required whenever there is a cover; then the social image.
 */
export function MediaTab({ form, onChange, errors, uploads }: MediaTabProps) {
  return (
    <View style={styles.tab}>
      <FormSection title="Cover image">
        <ImageUploadField
          noun="cover image"
          value={form.coverImageUrl}
          onChange={(v) => onChange('coverImageUrl', v)}
          upload={uploads.cover}
          error={errors.coverImageUrl}
          hint={COVER_HINT}
          alt={form.coverImageAlt.trim()}
        />
        <TextField
          label="Alt text"
          value={form.coverImageAlt}
          onChangeText={(v) => onChange('coverImageAlt', v)}
          error={errors.coverImageAlt}
          help={
            form.coverImageUrl.trim()
              ? 'Required with a cover. What the image shows, for screen readers and search.'
              : 'What the image shows, for screen readers and search.'
          }
        />
      </FormSection>
      <FormSection title="Social image" description="Shown when the post is shared. 1200 by 630 pixels works best.">
        <ImageUploadField
          noun="social image"
          value={form.socialImageUrl}
          onChange={(v) => onChange('socialImageUrl', v)}
          upload={uploads.social}
          error={errors.socialImageUrl}
          alt="Social image"
        />
      </FormSection>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tab: { gap: space[5], paddingBottom: space[4] },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: space[2] },
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    marginTop: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.sm,
  },
  category: { gap: space[1] },
  newCategory: { alignSelf: 'flex-start' },
  newCategoryForm: { gap: space[3], marginTop: space[2] },
  provenanceHead: { paddingHorizontal: space[4], paddingTop: space[4] },
  serp: { borderRadius: radius.input, borderWidth: 1, padding: space[4], gap: space[2] },
  serpSite: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  rowLine: { flexDirection: 'row', alignItems: 'flex-start', gap: space[1] },
  faq: { borderWidth: 1, borderRadius: radius.input, padding: space[3], gap: space[3] },
  faqHead: { flexDirection: 'row', alignItems: 'center' },
  add: { alignSelf: 'flex-start' },
});
