/**
 * Input shaping and validation for form fields (slugs, coupon codes, emails,
 * link destinations). The server stays the judge: these only give instant,
 * friendly feedback while typing, and match the server's rules where it has one.
 */

/** Strip accents so "Café" becomes "Cafe" (falls back to the input where normalize is missing). */
function deaccent(input: string): string {
  try {
    return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return input;
  }
}

/**
 * Slug while the user types: lowercase, spaces and underscores become dashes,
 * anything else outside a-z, 0-9 and "-" is dropped, repeated dashes collapse and
 * there is no leading dash. A trailing dash stays so "my-" can become "my-post".
 */
export function slugifyLive(input: string): string {
  return deaccent(input.toLowerCase())
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '');
}

/** The slug to send: slugifyLive plus no trailing dash. */
export function finalizeSlug(input: string): string {
  return slugifyLive(input).replace(/-+$/, '');
}

/** Coupon code while the user types: uppercase, only A-Z, 0-9 and dashes kept. */
export function codeLive(input: string): string {
  return deaccent(input.toUpperCase()).replace(/[^A-Z0-9-]/g, '');
}

/**
 * A plausible email: something@domain.tld with no spaces, no empty labels and a
 * TLD of at least two characters. Surrounding spaces are ignored (send the trimmed value).
 */
export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/.test(input.trim());
}

// A hostname with at least one dot and a letters-only TLD ("example.com", "www.a-b.co.uk").
const HOST = '(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}';
const PORT = '(?::\\d{1,5})?';
const REST = '(?:[/?#]\\S*)?';

const BARE_DOMAIN = new RegExp(`^${HOST}${PORT}${REST}$`, 'i');
const HTTPS_URL = new RegExp(`^https://${HOST}${PORT}${REST}$`, 'i');

/**
 * A website typed without its scheme ("example.com", "www.example.com/page").
 * The links form rejects these with "Add https:// for another website."
 */
export function isBareDomain(input: string): boolean {
  const text = input.trim();
  if (!text || text.startsWith('/') || text.includes('://')) return false;
  return BARE_DOMAIN.test(text);
}

/**
 * A link destination the server accepts: a path on our site ("/start",
 * "/blog/post?x=1") or a full https:// URL. "//host" and "/\host" are refused:
 * browsers treat both as another website, which would make an open redirect.
 */
export function isValidDestination(input: string): boolean {
  const text = input.trim();
  if (!text || /\s/.test(text)) return false;
  if (text.startsWith('/')) return !text.startsWith('//') && !text.startsWith('/\\');
  return HTTPS_URL.test(text);
}
