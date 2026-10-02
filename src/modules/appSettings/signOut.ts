import { session } from '@/auth/session';
import { drafts } from '@/lib/storage';
import { clearAppShortcuts } from '@/modules/quickActions/shortcuts';
import { searchSheet } from '@/modules/search/searchStore';

/** Same copy as the More tab's sign-out sheet, so both read the same. */
export { SIGN_OUT_COPY, signOutMessage } from '@/modules/more/MoreScreen';

/**
 * Sign out on purpose (App settings, the lock screen), exactly like the More
 * tab: drafts, recent searches and launcher shortcuts go, then the session and
 * every cache (brief 8.18). Preferences stay with the phone. Works offline.
 */
export async function signOutOnPurpose(): Promise<void> {
  drafts.clearAll();
  searchSheet.reset();
  await clearAppShortcuts();
  await session.signOut();
}
