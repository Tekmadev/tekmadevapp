import { create } from 'zustand';

import { useSession } from '@/auth/session';

import { addRecent, forgetRecents, loadRecents, saveRecents } from './recentSearches';

/**
 * The global search sheet's state. Any screen opens it (`searchSheet.open()`),
 * the one SearchSheet mounted in the signed-in layout renders it. The field
 * and the results live in different parts of the sheet, so they share the
 * query through this store.
 *
 * - `text`: what is in the field, every keystroke (screens match on this).
 * - `query`: the debounced text (records are fetched for this).
 */
type SearchState = {
  open: boolean;
  text: string;
  query: string;
  recents: string[];
};

export const useSearchStore = create<SearchState>()(() => ({
  open: false,
  text: '',
  query: '',
  recents: [],
}));

const currentUserId = () => useSession.getState().me?.user.id ?? null;

export const searchSheet = {
  /** Opens on an empty field with this person's recent searches. */
  open: () => {
    useSearchStore.setState({ open: true, text: '', query: '', recents: loadRecents(currentUserId()) });
  },
  close: () => {
    useSearchStore.setState({ open: false });
  },
  setText: (text: string) => {
    useSearchStore.setState({ text });
  },
  /**
   * The field's debounced value. A late debounce for text that has since been
   * replaced (a recent search tapped mid-typing) is ignored.
   */
  setQuery: (query: string) => {
    if (query !== useSearchStore.getState().text) return;
    useSearchStore.setState({ query });
  },
  /** Search for this right away (a recent search tapped). */
  run: (query: string) => {
    useSearchStore.setState({ text: query, query });
  },
  /** Remember a query that led somewhere (a result opened, or the keyboard's search key). */
  remember: (query: string) => {
    const userId = currentUserId();
    if (!userId || !query.trim()) return;
    const recents = addRecent(useSearchStore.getState().recents, query);
    saveRecents(userId, recents);
    useSearchStore.setState({ recents });
  },
  clearRecents: () => {
    forgetRecents();
    useSearchStore.setState({ recents: [] });
  },
  /** Sign-out: closed, empty and forgotten. */
  reset: () => {
    forgetRecents();
    useSearchStore.setState({ open: false, text: '', query: '', recents: [] });
  },
};
