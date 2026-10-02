import { useMutation, useQueryClient, type Mutation } from '@tanstack/react-query';

import { notificationKeys, updateNotificationPref } from '@/api/endpoints/notifications';
import type { NotificationCategory, NotificationPrefs } from '@/api/schemas/notifications';
import { reportSubmitError } from '@/components/SubmitGroup';

import { replacePref, revertPrefField, setPrefField, type PrefField } from './logic';

export type PrefChange = { category: NotificationCategory; field: PrefField; value: boolean };

/** Every Quiet and Push write shares this key (its own, so the Inbox's write bookkeeping never counts it). */
export const prefMutationKey = [...notificationKeys.prefs(), 'mutation'] as const;

const isChangeFor = (category: NotificationCategory) => (mutation: Mutation<unknown, unknown, unknown, unknown>) => {
  const vars = mutation.state.variables;
  return typeof vars === 'object' && vars !== null && 'category' in vars && vars.category === category;
};

/**
 * One Quiet or Push switch. The outcome is certain (it is the person's own
 * setting), so the switch moves at once and rolls back if the server refuses.
 * The server's row then replaces the cached one, unless a newer change to the
 * same category is still saving (its answer lands last). Quiet changes what
 * counts toward unread, so the Inbox lists and the bell refresh after it.
 */
export function usePrefMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: prefMutationKey,
    mutationFn: ({ category, field, value }: PrefChange) => updateNotificationPref(category, { [field]: value }),
    onMutate: async ({ category, field, value }: PrefChange) => {
      await qc.cancelQueries({ queryKey: notificationKeys.prefs() });
      const previous = qc.getQueryData<NotificationPrefs>(notificationKeys.prefs())?.find((p) => p.category === category)?.[field];
      qc.setQueryData<NotificationPrefs>(notificationKeys.prefs(), (prefs) => (prefs ? setPrefField(prefs, category, field, value) : prefs));
      return { previous };
    },
    onError: (error, { category, field, value }, result) => {
      const previous = result?.previous;
      if (previous !== undefined) {
        qc.setQueryData<NotificationPrefs>(notificationKeys.prefs(), (prefs) =>
          prefs ? revertPrefField(prefs, category, field, value, previous) : prefs,
        );
      }
      reportSubmitError(error);
    },
    onSuccess: (pref) => {
      if (qc.isMutating({ mutationKey: prefMutationKey, predicate: isChangeFor(pref.category) }) > 1) return;
      qc.setQueryData<NotificationPrefs>(notificationKeys.prefs(), (prefs) => (prefs ? replacePref(prefs, pref) : prefs));
    },
    onSettled: (_pref, _error, { field }) => {
      if (field !== 'muted') return;
      void qc.invalidateQueries({ queryKey: notificationKeys.lists() });
      void qc.invalidateQueries({ queryKey: notificationKeys.summary() });
    },
  });
}
