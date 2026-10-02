/** Copy and pure helpers for Profile (brief 8.17). */

export const PROFILE_COPY = {
  title: 'Profile',
  emailHelp: 'Your email is your login. To change it, ask an owner.',
  nameHelp: 'Shown to the team and in the Inbox. Leave it empty to show your email.',
  saveName: 'Save name',
  saving: 'Saving',
  nameSaved: 'Display name saved.',
  nameCleared: 'Display name removed. Your email shows instead.',
  changePassword: 'Change password',
  changing: 'Changing',
  passwordHelp: 'At least 8 characters. You stay signed in on this phone.',
  loadFailed: 'Could not load your profile.',
} as const;

export const DISPLAY_NAME_MAX = 80;

/** What PATCH /profile gets: trimmed, and null clears the name. */
export function nameToSave(draft: string): string | null {
  const trimmed = draft.trim();
  return trimmed === '' ? null : trimmed;
}

/** True when saving would change something (spaces around the name do not count). */
export function isNameChanged(draft: string, saved: string | null | undefined): boolean {
  return nameToSave(draft) !== nameToSave(saved ?? '');
}

export function nameSavedMessage(saved: string | null): string {
  return saved ? PROFILE_COPY.nameSaved : PROFILE_COPY.nameCleared;
}
