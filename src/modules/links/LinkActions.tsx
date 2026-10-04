import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ban, Copy, Power, QrCode, Share2, Trash2 } from 'lucide-react-native';

import { deleteLink, linkKeys, setLinkActive } from '@/api/endpoints/links';
import { overviewKeys } from '@/api/endpoints/overview';
import { MESSAGES } from '@/api/errors';
import type { ShortLink } from '@/api/schemas/links';
import { useCan } from '@/auth/permissions';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { ActionSheet, type ActionSheetItem } from '@/components/sheet/ActionSheet';
import { reportSubmitError } from '@/components/SubmitGroup';
import { haptics } from '@/design/haptics';
import { useIsOnline } from '@/lib/connectivity';
import { notice } from '@/lib/notice';

import { LINK_COPY, linkMenuActions, removeLink, shareUrlOf, shortLinkText, upsertLink } from './logic';
import { copyLink, shareLink } from './share';

/** Which sheet is open for which link: the actions menu, or a hold-to-confirm. */
export type LinkSheet = { link: ShortLink; kind: 'menu' | 'disable' | 'delete' };

export function openQr(link: Pick<ShortLink, 'id'>) {
  router.push({ pathname: '/links/qr/[id]', params: { id: link.id } });
}

/**
 * Disable / Enable and Delete (brief 8.11). Nothing is optimistic: a disabled
 * link answers 404 at once, so the switch waits for the server. The returned
 * link replaces the cached one, then GET /links refreshes behind it. A delete
 * also refreshes the click lists (the history stays, the counter goes) and
 * Home, whose "Top tracking links" drops the link.
 */
export function useLinkMutations() {
  const queryClient = useQueryClient();

  const setActive = async (link: ShortLink, active: boolean) => {
    const saved = await setLinkActive(link.id, active);
    queryClient.setQueryData<ShortLink[]>(linkKeys.list(), (old) => upsertLink(old, saved));
    void queryClient.invalidateQueries({ queryKey: linkKeys.list() });
    haptics.success();
    notice.ok(active ? 'Link enabled. It works again at once.' : 'Link disabled. It returns 404 now.');
    return saved;
  };

  /** `beforeCache` runs once the server confirmed, before the link leaves the cache (a detail screen goes back first). */
  const remove = async (link: ShortLink, beforeCache?: () => void) => {
    await deleteLink(link.id);
    beforeCache?.();
    queryClient.setQueryData<ShortLink[]>(linkKeys.list(), (old) => removeLink(old, link.id));
    void queryClient.invalidateQueries({ queryKey: linkKeys.list() });
    void queryClient.invalidateQueries({ queryKey: linkKeys.clicksLists() });
    void queryClient.invalidateQueries({ queryKey: overviewKeys.all });
    notice.ok('Link deleted.');
  };

  return { setActive, remove };
}

export type LinkSheetsProps = {
  sheet: LinkSheet | null;
  onChange: (sheet: LinkSheet | null) => void;
  /** Runs after a delete went through, before the link leaves the cache. */
  onDeleted?: () => void;
};

/**
 * The sheets behind a link's actions: the long-press / overflow menu (Copy
 * link, Share, QR code, Disable or Enable, Delete), the Disable confirm (it
 * returns 404 at once) and the Delete confirm with the brief's consequence.
 * Enabling needs no confirm: it only brings the link back. Without
 * `links.write` the menu is Copy link, Share and QR code only.
 */
export function LinkSheets({ sheet, onChange, onDeleted }: LinkSheetsProps) {
  const online = useIsOnline();
  const canWrite = useCan('links.write');
  const { setActive, remove } = useLinkMutations();
  const close = () => onChange(null);

  if (!sheet) return null;
  const { link, kind } = sheet;
  const url = shareUrlOf(link);
  const title = shortLinkText(link.slug);
  const offlineHint = online ? undefined : MESSAGES.offline;

  if (kind === 'menu') {
    const enable = () => {
      setActive(link, true).catch((error: unknown) => {
        haptics.error();
        reportSubmitError(error);
      });
    };
    const items = linkMenuActions(link, canWrite).map((action): ActionSheetItem => {
      switch (action) {
        case 'copy':
          return { label: 'Copy link', icon: Copy, onPress: () => void copyLink(url) };
        case 'share':
          return { label: 'Share', icon: Share2, onPress: () => void shareLink(url) };
        case 'qr':
          return { label: 'QR code', icon: QrCode, hint: 'Full screen, to scan, save or share', onPress: () => openQr(link) };
        case 'disable':
          return {
            label: 'Disable link',
            icon: Ban,
            hint: offlineHint ?? 'It returns 404 at once',
            disabled: !online,
            onPress: () => onChange({ link, kind: 'disable' }),
          };
        case 'enable':
          return { label: 'Enable link', icon: Power, hint: offlineHint ?? 'It works again at once', disabled: !online, onPress: enable };
        case 'delete':
          return { label: 'Delete link', icon: Trash2, destructive: true, hint: offlineHint, disabled: !online, onPress: () => onChange({ link, kind: 'delete' }) };
      }
    });
    return <ActionSheet visible onClose={close} title={title} subtitle={link.label ?? link.destination} items={items} />;
  }

  // The confirms are only reachable through write actions; never draw one without the capability.
  if (!canWrite) return null;

  if (kind === 'disable') {
    return (
      <ConfirmSheet
        visible
        onClose={close}
        title={`Disable ${title}?`}
        message={LINK_COPY.disableMessage}
        confirmLabel="Hold to disable"
        pendingLabel="Disabling"
        tone="ink"
        onConfirm={() => setActive(link, false)}
      />
    );
  }

  return (
    <ConfirmSheet
      visible
      onClose={close}
      title={`Delete ${title}?`}
      message={LINK_COPY.deleteMessage}
      confirmLabel="Hold to delete"
      pendingLabel="Deleting"
      onConfirm={() => remove(link, onDeleted)}
    />
  );
}
