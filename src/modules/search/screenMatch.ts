/**
 * Matching screens for global search ("Pricing", "Loader"). Pure and local:
 * the screen list comes from the module registry, so this works offline.
 *
 * Ranking, best first: exact title, title starts with the query, a title word
 * starts with it, then the same against keywords (weighted a little lower),
 * then every query word starting a word somewhere, then contains (3+ letters),
 * then a forgiving in-order match on the title ("prcng" finds Pricing). Ties
 * keep registry order, which is the order the app presents its screens.
 */

export type Matchable = { title: string; keywords?: readonly string[] };

/** Lowercase, accents and punctuation folded away, single spaces. */
export function foldText(input: string): string {
  let s = input;
  try {
    s = s.normalize('NFD');
  } catch {
    // An engine without normalize still matches unaccented text.
  }
  return s
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function fieldScore(field: string, q: string): number {
  if (!field || !q) return 0;
  if (field === q) return 100;
  if (field.startsWith(q)) return 90;
  if (field.includes(` ${q}`)) return 80;
  if (q.length >= 3 && field.includes(q)) return 50;
  return 0;
}

/** The query's letters appear in order in the title, starting at a word start. */
function inOrder(title: string, q: string): boolean {
  const compactQuery = q.replace(/ /g, '');
  if (compactQuery.length < 3) return false;
  const words = title.split(' ');
  if (!words.some((w) => w.startsWith(compactQuery[0]))) return false;
  const start = title.indexOf(compactQuery[0]);
  let i = 0;
  for (let j = start; j < title.length && i < compactQuery.length; j++) {
    if (title[j] === compactQuery[i]) i++;
  }
  return i === compactQuery.length;
}

/** 0 means no match. */
export function screenScore(item: Matchable, query: string): number {
  const q = foldText(query);
  if (!q) return 0;
  const title = foldText(item.title);
  const keywords = (item.keywords ?? []).map(foldText).filter(Boolean);

  let best = fieldScore(title, q);
  for (const k of keywords) best = Math.max(best, fieldScore(k, q) * 0.8);
  if (best > 0) return best;

  const tokens = q.split(' ');
  if (tokens.length > 1) {
    const all = ` ${[title, ...keywords].join(' ')}`;
    if (tokens.every((t) => all.includes(` ${t}`))) return 40;
  }
  return inOrder(title, q) ? 20 : 0;
}

/** The best matches, at most `limit`, best first (ties keep the input order). */
export function matchScreens<T extends Matchable>(items: readonly T[], query: string, limit = 6): T[] {
  if (!foldText(query)) return [];
  return items
    .map((item, index) => ({ item, index, score: screenScore(item, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.item);
}

/**
 * Whether the results for `previous` are a fair stand-in while `next` loads
 * (the person is still typing or deleting the same word), so the list does
 * not jump to empty and back on every keystroke.
 */
export function relatedQueries(previous: string, next: string): boolean {
  const a = foldText(previous);
  const b = foldText(next);
  if (!a || !b) return false;
  return a.startsWith(b) || b.startsWith(a);
}
