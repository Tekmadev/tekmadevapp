import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  clientKeys,
  clientsMetaQuery,
  deleteOnboardingTemplate,
  onboardingTemplatesQuery,
  saveOnboardingTemplate,
  type TemplateInput,
} from '@/api/endpoints/clients';
import { sessionKeys } from '@/api/endpoints/session';
import { MESSAGES } from '@/api/errors';
import type { OnboardingTemplate } from '@/api/schemas/clients';
import { OwnerOnly } from '@/auth/OwnerOnly';
import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ScreenList } from '@/components/ScreenList';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { enterPull, STAGGER_MAX, useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { layout, radius, space } from '@/design/tokens';
import { countLabel } from '@/lib/format';
import { useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';
import { useRefreshOnFocus } from '@/modules/customers/useRefreshOnFocus';

import { stageLabel } from './list/labels';
import { groupTemplates, removeTemplate, upsertTemplate, type TemplateListItem } from './templates/logic';
import { TemplateCard } from './templates/TemplateCard';
import { TemplateSheet } from './templates/TemplateSheet';

const NOTE = 'Changes apply to new onboarding runs only.';
const EMPTY = 'No checklist templates yet. New onboarding runs start with an empty checklist.';

const itemKey = (item: TemplateListItem) => item.id;
const itemType = (item: TemplateListItem) => item.type;

/** The edit sheet's target: null template means "New template". `id` remounts the form on every open. */
type Editing = { template: OnboardingTemplate | null; id: number };

/**
 * Checklist templates (brief 8.5, owner only): the tasks every new onboarding
 * run starts with, grouped by stage. Tap a template to edit it, or add a new
 * one; deleting asks for a hold to confirm. Saves update the list from the
 * server's answer, then refetch it.
 */
export function ChecklistTemplatesScreen() {
  return (
    <OwnerOnly>
      <TemplatesBody />
    </OwnerOnly>
  );
}

function TemplatesBody() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const reduceMotion = useReduceMotion();
  const list = useQuery(onboardingTemplatesQuery());
  const meta = useQuery(clientsMetaQuery());
  useRefreshOnFocus([clientKeys.templates(), sessionKeys.meta]);

  const [editing, setEditing] = useState<Editing | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState<OnboardingTemplate | null>(null);

  const templates = list.data ?? [];
  const items = groupTemplates(templates);
  const hasData = list.data !== undefined;
  const templatesKey = onboardingTemplatesQuery().queryKey;

  const save = useMutation({
    mutationFn: ({ key, input }: { key: string; input: TemplateInput }) => saveOnboardingTemplate(key, input),
    onSuccess: (saved) => {
      queryClient.setQueryData(templatesKey, (old) => (old ? upsertTemplate(old, saved) : old));
      void queryClient.invalidateQueries({ queryKey: clientKeys.templates() });
    },
  });

  const remove = useMutation({
    mutationFn: (key: string) => deleteOnboardingTemplate(key),
    onSuccess: (result) => {
      queryClient.setQueryData(templatesKey, (old) => (old ? removeTemplate(old, result.key) : old));
      void queryClient.invalidateQueries({ queryKey: clientKeys.templates() });
    },
  });

  const openSheet = (template: OnboardingTemplate | null) => {
    setEditing((prev) => ({ template, id: (prev?.id ?? 0) + 1 }));
    setSheetOpen(true);
  };
  const openNew = () => openSheet(null);

  const confirmDelete = async () => {
    if (!deleting) return;
    await remove.mutateAsync(deleting.key);
    setSheetOpen(false);
    notice.ok('Template deleted.');
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<TemplateListItem>) => {
    if (item.type === 'stage') {
      return (
        <View style={[styles.stage, index === 0 ? styles.stageFirst : null]} accessibilityRole="header">
          <Text variant="eyebrow">{stageLabel(meta.data, item.stage)}</Text>
          <Text variant="small" color="ink4" tabular>
            {countLabel(item.count, 'template', 'templates')}
          </Text>
        </View>
      );
    }
    const animate = !reduceMotion && index < STAGGER_MAX;
    return (
      <Animated.View entering={animate ? enterPull(index) : undefined} style={styles.row}>
        <TemplateCard template={item.template} meta={meta.data} onPress={openSheet} />
      </Animated.View>
    );
  };

  const header = (
    <View style={styles.header}>
      <View style={[styles.note, { backgroundColor: colors.bg2, borderColor: colors.line }]}>
        <Text variant="small" color="ink2">
          {NOTE}
        </Text>
      </View>
      {hasData && templates.length > 0 ? (
        <Button label="New template" variant="secondary" size="sm" icon={Plus} onPress={openNew} style={styles.newButton} />
      ) : null}
      {list.isRefetchError && hasData && online ? <ErrorState compact error={list.error} onRetry={() => list.refetch()} /> : null}
    </View>
  );

  // Offline with nothing cached the first read waits for the connection: say so, not a skeleton that never ends.
  const empty = list.isPending && list.fetchStatus === 'paused' ? (
    <ErrorState message={MESSAGES.network} onRetry={online ? () => list.refetch() : undefined} />
  ) : list.isPending ? (
    <SkeletonList rows={6} leading={false} style={styles.gutter} />
  ) : list.isError && !hasData ? (
    <ErrorState error={list.error} onRetry={() => list.refetch()} />
  ) : (
    <EmptyState message={EMPTY} action={{ label: 'New template', onPress: openNew, icon: Plus }} />
  );

  return (
    <>
      <ScreenList<TemplateListItem>
        title="Checklist templates"
        back
        data={items}
        renderItem={renderItem}
        keyExtractor={itemKey}
        getItemType={itemType}
        extraData={meta.data}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={<View style={styles.footer} />}
        onRefresh={() => Promise.all([list.refetch(), meta.refetch()])}
        refetching={list.isRefetching}
        queryKey={templatesKey}
      />
      {editing ? (
        <TemplateSheet
          key={editing.id}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          template={editing.template}
          templates={templates}
          meta={meta.data}
          onSave={(key, input) => save.mutateAsync({ key, input })}
          onDelete={setDeleting}
        />
      ) : null}
      <ConfirmSheet
        visible={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this template?"
        message={`Delete "${deleting?.title ?? ''}". New onboarding runs will not get this task. Runs already started keep theirs.`}
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
  header: { paddingHorizontal: layout.gutter, gap: space[3], marginBottom: space[2] },
  note: { borderWidth: 1, borderRadius: radius.input, paddingHorizontal: space[4], paddingVertical: space[3] },
  newButton: { alignSelf: 'flex-start' },
  stage: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: layout.gutter,
    paddingTop: space[7],
    paddingBottom: space[3],
  },
  stageFirst: { paddingTop: space[4] },
  row: { paddingBottom: space[3] },
  footer: { height: space[8] },
});
