/**
 * Word-level diff for the approval "before / after" block: the words that
 * were removed are marked on the before side, the words that were added on
 * the after side, and everything shared stays plain so the eye lands on the change.
 */

export type DiffSpan = { text: string; changed: boolean };

export type WordDiff = {
  before: DiffSpan[];
  after: DiffSpan[];
  /** 'whole' when the texts were too long to compare word by word: each side is marked as a whole. */
  mode: 'word' | 'whole';
};

/** Words and the whitespace between them, so joining the tokens gives back the exact text. */
function tokenize(s: string): string[] {
  return s.match(/\s+|[^\s]+/g) ?? [];
}

const isSpace = (t: string) => /^\s+$/.test(t);

/** Merge neighbours with the same flag; whitespace between two changes joins them into one mark. */
function toSpans(tokens: readonly string[], changed: readonly boolean[]): DiffSpan[] {
  const flags = tokens.map((t, i) => (isSpace(t) ? !!changed[i - 1] && !!changed[i + 1] : changed[i]));
  const out: DiffSpan[] = [];
  tokens.forEach((text, i) => {
    const last = out[out.length - 1];
    if (last && last.changed === flags[i]) last.text += text;
    else out.push({ text, changed: flags[i] });
  });
  return out;
}

/**
 * Longest-common-subsequence diff over words. Quadratic, so it is capped
 * (`maxTokens` per side); past the cap each side is marked as a whole.
 */
export function diffWords(before: string, after: string, maxTokens = 400): WordDiff {
  if (before === after) {
    return { before: [{ text: before, changed: false }], after: [{ text: after, changed: false }], mode: 'word' };
  }
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length > maxTokens || b.length > maxTokens) {
    return { before: [{ text: before, changed: true }], after: [{ text: after, changed: true }], mode: 'whole' };
  }

  const n = a.length;
  const m = b.length;
  // lcs[i][j] = LCS length of a[i..] and b[j..], in one flat array.
  const lcs = new Uint16Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[at(i, j)] = a[i] === b[j] ? lcs[at(i + 1, j + 1)] + 1 : Math.max(lcs[at(i + 1, j)], lcs[at(i, j + 1)]);
    }
  }

  const removed = new Array<boolean>(n).fill(true);
  const added = new Array<boolean>(m).fill(true);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      removed[i] = false;
      added[j] = false;
      i++;
      j++;
    } else if (lcs[at(i + 1, j)] >= lcs[at(i, j + 1)]) {
      i++;
    } else {
      j++;
    }
  }

  return { before: toSpans(a, removed), after: toSpans(b, added), mode: 'word' };
}
