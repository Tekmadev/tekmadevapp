import type { FlashListRef, ListRenderItemInfo } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { blogKeys, categoriesQuery, createCategory, deleteCategory, renameCategory } from '@/api/endpoints/blog';
import { sessionKeys } from '@/api/endpoints/session';
import { MESSAGES } from '@/api/errors';
import type { BlogCategory } from '@/api/schemas/blog';
import { OwnerOnly } from '@/auth/OwnerOnly';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ScreenList } from '@/components/ScreenList';
import { SkeletonList } from '@/components/Skeleton';
import { useReduceMotion } from '@/design/motion';
import { layout, space } from '@/design/tokens';
import { useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';

import { AddCategoryForm } from './list/AddCategoryForm';
import { CategoryRow } from './list/CategoryRow';
import { BLOG_COPY, categoryDeleteMessage, removeCategory, upsertCategory } from './list/logic';

const rowKey = (category: BlogCategory) => category.id;
const Separator = () => <Divider inset />;

/**
 * Blog categories (brief 8.11, owner only, from the Blog menu): each category
 * with its post count and slug, renamed in place (the slug never changes),
 * added from the field on top, and deleted after a hold. Writes wait for the
 * server, put its answer in the list, then refetch what the web admin would:
 * the categories, the post lists (rows show the category name) and GET /meta.
 */
export function CategoriesScreen() {
  return (
    <OwnerOnly>
      <CategoriesBody />
    </OwnerOnly>
  );
}

function CategoriesBody() {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();
  const list = useQuery(categoriesQuery());
  useRefreshOnFocus([blogKeys.categories()]);
  const listRef = useRef<FlashListRef<BlogCategory>>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BlogCategory | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const categories = list.data ?? [];
  const hasData = list.data !== undefined;
  const listKey = blogKeys.categories();

  const refreshAfterWrite = (posts: boolean) => {
    void queryClient.invalidateQueries({ queryKey: blogKeys.categories() });
    void queryClient.invalidateQueries({ queryKey: sessionKeys.meta });
    // Rows and the editor show the category name; a delete clears it from posts.
    if (posts) void queryClient.invalidateQueries({ queryKey: blogKeys.posts() });
  };

  const add = useMutation({
    mutationFn: ({ name, key }: { name: string; key: string }) => createCategory(name, key),
    onSuccess: (created) => {
      queryClient.setQueryData<BlogCategory[]>(listKey, (old) => (old ? upsertCategory(old, created) : [created]));
      refreshAfterWrite(false);
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameCategory(id, name),
    onSuccess: (renamed) => {
      queryClient.setQueryData<BlogCategory[]>(listKey, (old) => (old ? upsertCategory(old, renamed) : old));
      refreshAfterWrite(true);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<BlogCategory[]>(listKey, (old) => (old ? removeCategory(old, id) : old));
      refreshAfterWrite(true);
    },
  });

  const startEdit = (category: BlogCategory) => setEditingId(category.id);
  const cancelEdit = () => setEditingId(null);
  const askDelete = (category: BlogCategory) => {
    setDeleting(category);
    setDeleteOpen(true);
  };

  // Lift the row being renamed clear of the keyboard (it can sit low on the screen).
  const revealRow = (index: number) => {
    setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.15, animated: true }), 250);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    await remove.mutateAsync(deleting.id);
    if (editingId === deleting.id) setEditingId(null);
    notice.ok(BLOG_COPY.categoryDeleted);
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<BlogCategory>) => (
    <CategoryRow
      category={item}
      categories={categories}
      editing={editingId === item.id}
      index={index}
      still={reduceMotion}
      onEdit={startEdit}
      onCancel={cancelEdit}
      onRename={(category, name) => rename.mutateAsync({ id: category.id, name })}
      onDelete={askDelete}
      onFieldFocus={revealRow}
    />
  );

  const header = (
    <View style={styles.header}>
      {hasData ? <AddCategoryForm categories={categories} onAdd={(name, key) => add.mutateAsync({ name, key })} /> : null}
      {list.isRefetchError && hasData && online ? <ErrorState compact error={list.error} onRetry={() => list.refetch()} /> : null}
    </View>
  );

  // Offline with nothing cached the first read waits for the connection: say so, not a skeleton that never ends.
  const empty =
    list.isPending && list.fetchStatus === 'paused' ? (
      <ErrorState message={MESSAGES.network} onRetry={online ? () => list.refetch() : undefined} />
    ) : list.isPending ? (
      <SkeletonList rows={6} leading={false} style={styles.gutter} />
    ) : list.isError && !hasData ? (
      <ErrorState error={list.error} onRetry={() => list.refetch()} />
    ) : (
      <EmptyState message={BLOG_COPY.noCategories} />
    );

  return (
    <>
      <ScreenList<BlogCategory>
        title="Categories"
        back
        listRef={listRef}
        data={categories}
        renderItem={renderItem}
        keyExtractor={rowKey}
        extraData={{ editingId, categories }}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={<View style={styles.footer} />}
        onRefresh={() => list.refetch()}
        refetching={list.isRefetching}
        queryKey={listKey}
      />
      <ConfirmSheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete category"
        message={deleting ? categoryDeleteMessage(deleting) : ''}
        confirmLabel="Hold to delete"
        pendingLabel="Deleting"
        tone="signal"
        onConfirm={confirmDelete}
      />
    </>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: layout.gutter },
  header: { paddingHorizontal: layout.gutter, gap: space[3], marginBottom: space[4] },
  footer: { height: space[8] },
});
