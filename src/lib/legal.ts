/**
 * The legal pages the App Store and Google Play expect an app to link to. They
 * live on the website and open in the in-app browser (`openInBrowser`), from
 * More > Legal and from the sign-in screen (the privacy policy must be
 * reachable without signing in).
 */
export const PRIVACY_URL = 'https://www.tekmadev.com/privacy';
export const TERMS_URL = 'https://www.tekmadev.com/terms';
/** How to ask Tekmadev to delete your account and personal information. */
export const ACCOUNT_DELETION_URL = 'https://www.tekmadev.com/account-deletion';

export const LEGAL_COPY = {
  section: 'Legal',
  privacy: 'Privacy policy',
  terms: 'Terms of service',
  licenses: 'Open-source licenses',
  deletion: 'Request account deletion',
  opensInBrowser: 'Opens in the browser',
} as const;
