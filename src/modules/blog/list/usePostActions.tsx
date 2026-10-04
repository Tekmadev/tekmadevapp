import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { BookOpen, ExternalLink, EyeOff, Pencil, Send, Share2, Trash2 } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Platform, Share } from 'react-native';

import { blogKeys, publishPost, setPostStatus, trashPost } from '@/api/endpoints/blog';
import { MESSAGES } from '@/api/errors';
import type { BlogMeta, PostDetail, PostPage, PostRow } from '@/api/schemas/blog';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { ActionSheet, type ActionSheetItem } from '@/components/sheet/ActionSheet';
import { useTheme } from '@/design/theme';
import { useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';

import {
  BLOG_COPY,
  dropRow,
  liveUrl,
  patchRow,
  postMenuActions,
  publishMessage,
  rowFromPost,
  statusBadge,
  trashMessage,
  unpublishMessage,
  type PostAccess,
} from './logic';

type ConfirmKind = 'publish' | 'unpublish' | 'trash';
type Confirming = { kind: ConfirmKind; row: PostRow };

export type PostActions = {
  /** Tap: the editor (the read-only post view without `blog.write`). */
  open: (row: PostRow) => void;
  /** Long press or "More actions": every action in a sheet. */
  more: (row: PostRow) => void;
  /** Swipe right: Publish (or Unpublish when live), after a hold to confirm. */
  togglePublish: (row: PostRow) => void;
  /** Swipe left: Move to trash, after a hold to confirm. */
  trash: (row: PostRow) => void;
  /** The actions sheet and the confirm sheet; render once next to the list. */
  sheets: ReactNode;
};

const openEditor = (row: PostRow) => router.push({ pathname: '/blog/[id]', params: { id: row.id } });

/** The system share sheet with a post's live link. */
export function sharePostUrl(url: string) {
  // iOS shares a URL as a link; Android only reads `message`.
  const content = Platform.OS === 'ios' ? { url } : { message: url };
  Share.share(content).catch(() => notice.err(MESSAGES.generic));
}

const shareLink = (row: PostRow) => sharePostUrl(liveUrl(row.slug));

/**
 * Every write the Blog list offers, with its confirm step: publish and
 * unpublish (an ink hold), and move to trash (a red hold). Each waits for the
 * server, then puts the returned post in the cache (the row and the editor's
 * copy) and refetches the lists, since a status change moves a post between
 * filters. Trash also refetches categories (their post counts drop).
 * The sheet only lists what `access` allows (postMenuActions): without
 * `blog.write` it is Open, View live and Share link.
 */
export function usePostActions(meta: BlogMeta | undefined, access: PostAccess): PostActions {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const { colors } = useTheme();

  // Rows stay in state while their sheet animates closed, so the copy never blanks mid-close.
  const [menuRow, setMenuRow] = useState<PostRow | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const applyPost = (detail: PostDetail) => {
    queryClient.setQueryData(blogKeys.post(detail.post.id), detail);
    const row = rowFromPost(detail.post);
    queryClient.setQueriesData<InfiniteData<PostPage, string | null>>({ queryKey: blogKeys.lists() }, (old) =>
      patchRow(old, row),
    );
    void queryClient.invalidateQueries({ queryKey: blogKeys.lists() });
  };

  const publish = useMutation({ mutationFn: (id: string) => publishPost(id), onSuccess: applyPost });
  const unpublish = useMutation({ mutationFn: (id: string) => setPostStatus(id, 'draft'), onSuccess: applyPost });
  const remove = useMutation({
    mutationFn: (id: string) => trashPost(id),
    onSuccess: (_result, id) => {
      queryClient.setQueriesData<InfiniteData<PostPage, string | null>>({ queryKey: blogKeys.lists() }, (old) =>
        dropRow(old, id),
      );
      queryClient.removeQueries({ queryKey: blogKeys.post(id), exact: true });
      void queryClient.invalidateQueries({ queryKey: blogKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: blogKeys.categories() });
    },
  });

  const ask = (kind: ConfirmKind, row: PostRow) => {
    setConfirming({ kind, row });
    setConfirmOpen(true);
  };

  const togglePublish = (row: PostRow) => ask(row.status === 'published' ? 'unpublish' : 'publish', row);
  const trash = (row: PostRow) => ask('trash', row);

  const more = (row: PostRow) => {
    setMenuRow(row);
    setMenuOpen(true);
  };

  const viewLive = (row: PostRow) => {
    WebBrowser.openBrowserAsync(liveUrl(row.slug), {
      toolbarColor: colors.bg,
      secondaryToolbarColor: colors.bg,
      showTitle: true,
      enableBarCollapsing: true,
    }).catch(() => notice.err('Could not open the post.'));
  };

  const menuItems = (row: PostRow): ActionSheetItem[] => {
    const live = row.status === 'published';
    const offlineHint = online ? undefined : MESSAGES.offline;
    return postMenuActions(row, access).map((action): ActionSheetItem => {
      switch (action) {
        case 'edit':
          return { label: 'Edit', icon: Pencil, onPress: () => openEditor(row) };
        case 'read':
          return { label: 'Open', icon: BookOpen, hint: 'Read the post', onPress: () => openEditor(row) };
        case 'unpublish':
          return { label: 'Unpublish', icon: EyeOff, hint: offlineHint ?? 'Takes it off the site', disabled: !online, onPress: () => ask('unpublish', row) };
        case 'publish':
          return { label: 'Publish', icon: Send, hint: offlineHint ?? 'Live on tekmadev.com', disabled: !online, onPress: () => ask('publish', row) };
        case 'viewLive':
          return { label: 'View live', icon: ExternalLink, onPress: () => viewLive(row) };
        case 'share':
          return {
            label: 'Share link',
            icon: Share2,
            disabled: !live,
            hint: live ? undefined : access.canWrite ? BLOG_COPY.shareFirst : BLOG_COPY.shareNotLive,
            onPress: () => shareLink(row),
          };
        case 'trash':
          return { label: 'Move to trash', icon: Trash2, destructive: true, disabled: !online, hint: offlineHint, onPress: () => ask('trash', row) };
      }
    });
  };

  const confirm = async () => {
    if (!confirming) return;
    const { kind, row } = confirming;
    if (kind === 'publish') {
      await publish.mutateAsync(row.id);
      notice.ok(BLOG_COPY.published);
    } else if (kind === 'unpublish') {
      await unpublish.mutateAsync(row.id);
      notice.ok(BLOG_COPY.unpublished);
    } else {
      await remove.mutateAsync(row.id);
      notice.ok(BLOG_COPY.trashed);
    }
  };

  const sheetCopy = (c: Confirming | null) => {
    if (!c) return { title: '', message: '', confirmLabel: 'Hold to confirm', pendingLabel: undefined, tone: 'ink' as const };
    switch (c.kind) {
      case 'publish':
        return { title: BLOG_COPY.publishTitle, message: publishMessage(c.row), confirmLabel: 'Hold to publish', pendingLabel: 'Publishing', tone: 'ink' as const };
      case 'unpublish':
        return { title: BLOG_COPY.unpublishTitle, message: unpublishMessage(c.row), confirmLabel: 'Hold to unpublish', pendingLabel: 'Unpublishing', tone: 'ink' as const };
      case 'trash':
        return { title: BLOG_COPY.trashTitle, message: trashMessage(c.row), confirmLabel: 'Hold to move to trash', pendingLabel: 'Moving to trash', tone: 'signal' as const };
    }
  };
  const copy = sheetCopy(confirming);

  const sheets = (
    <>
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={menuRow?.title}
        subtitle={menuRow ? statusBadge(meta, menuRow.status).label : undefined}
        items={menuRow ? menuItems(menuRow) : []}
      />
      <ConfirmSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={copy.title}
        message={copy.message}
        confirmLabel={copy.confirmLabel}
        pendingLabel={copy.pendingLabel}
        tone={copy.tone}
        onConfirm={confirm}
      />
    </>
  );

  return { open: openEditor, more, togglePublish, trash, sheets };
}
