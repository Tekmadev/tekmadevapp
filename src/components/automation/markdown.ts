/**
 * A small Markdown reader for approval previews. It covers what an automation
 * is likely to send (headings, paragraphs, bold, italic, code, links, lists,
 * quotes, fenced code, dividers) and degrades to plain text for anything else.
 * It is not the blog renderer: the blog preview comes from POST /blog/render.
 */

export type InlineSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  /** Set on link text. */
  href?: string;
};

export type MdBlock =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; spans: InlineSpan[] }
  | { kind: 'paragraph'; spans: InlineSpan[] }
  | { kind: 'list'; ordered: boolean; start: number; items: InlineSpan[][] }
  | { kind: 'quote'; spans: InlineSpan[] }
  | { kind: 'code'; text: string }
  | { kind: 'divider' };

type Flags = { bold?: boolean; italic?: boolean };

type Match = { index: number; length: number; kind: 'code' | 'link' | 'bold' | 'italic'; inner: string; href?: string };

const isWordChar = (c: string | undefined) => c !== undefined && /[A-Za-z0-9]/.test(c);

/** First match of `pattern` in `s` that passes `accept` (used to keep snake_case words plain). */
function firstMatch(pattern: RegExp, s: string, accept: (m: RegExpExecArray) => boolean = () => true): RegExpExecArray | null {
  const re = new RegExp(pattern.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (accept(m)) return m;
    re.lastIndex = m.index + 1;
  }
  return null;
}

const CODE = /`([^`\n]+)`/;
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/;
const BOLD = /\*\*(?=\S)([\s\S]+?)\*\*|__(?=\S)([\s\S]+?)__/;
const ITALIC = /\*(?=[^\s*])([^*\n]+?)\*|_(?=[^\s_])([^_\n]+?)_/;

function findNext(s: string): Match | null {
  const candidates: Match[] = [];
  const code = firstMatch(CODE, s);
  if (code) candidates.push({ index: code.index, length: code[0].length, kind: 'code', inner: code[1] });
  const link = firstMatch(LINK, s);
  if (link) candidates.push({ index: link.index, length: link[0].length, kind: 'link', inner: link[1], href: link[2] });
  const bold = firstMatch(BOLD, s);
  if (bold) candidates.push({ index: bold.index, length: bold[0].length, kind: 'bold', inner: bold[1] ?? bold[2] ?? '' });
  const italic = firstMatch(
    ITALIC,
    s,
    // Underscores inside a word (snake_case, file_name) are not emphasis.
    (m) => !m[0].startsWith('_') || (!isWordChar(s[m.index - 1]) && !isWordChar(s[m.index + m[0].length])),
  );
  if (italic) candidates.push({ index: italic.index, length: italic[0].length, kind: 'italic', inner: italic[1] ?? italic[2] ?? '' });
  if (candidates.length === 0) return null;
  // Earliest wins; on a tie the order above decides (code, link, bold, then italic).
  return candidates.reduce((best, c) => (c.index < best.index ? c : best));
}

function sameStyle(a: InlineSpan, b: InlineSpan) {
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.code === !!b.code && a.href === b.href;
}

/** Inline Markdown to styled spans. Unclosed markers stay as typed. */
export function parseInline(text: string, flags: Flags = {}): InlineSpan[] {
  const out: InlineSpan[] = [];
  const push = (span: InlineSpan) => {
    if (!span.text) return;
    const last = out[out.length - 1];
    if (last && sameStyle(last, span)) last.text += span.text;
    else out.push({ ...span });
  };
  let rest = text;
  while (rest.length > 0) {
    const m = findNext(rest);
    if (!m) {
      push({ text: rest, ...flags });
      break;
    }
    if (m.index > 0) push({ text: rest.slice(0, m.index), ...flags });
    if (m.kind === 'code') push({ text: m.inner, code: true, ...flags });
    else if (m.kind === 'link') for (const s of parseInline(m.inner, flags)) push({ ...s, href: m.href });
    else if (m.kind === 'bold') for (const s of parseInline(m.inner, { ...flags, bold: true })) push(s);
    else for (const s of parseInline(m.inner, { ...flags, italic: true })) push(s);
    rest = rest.slice(m.index + m.length);
  }
  return out;
}

/** Closing hashes need a space before them, so "## Learn C#" keeps its "#". */
const HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const DIVIDER = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```/;

/** Block-level Markdown to a flat list of blocks. */
export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', spans: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushQuote = () => {
    if (quote.length) blocks.push({ kind: 'quote', spans: parseInline(quote.join(' ').trim()) });
    quote = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: 'list', ordered: list.ordered, start: list.start, items: list.items.map((t) => parseInline(t)) });
    list = null;
  };
  const flushAll = () => {
    flushParagraph();
    flushQuote();
    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (FENCE.test(line)) {
      flushAll();
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushAll();
      const level = Math.min(heading[1].length, 4) as 1 | 2 | 3 | 4;
      blocks.push({ kind: 'heading', level, spans: parseInline(heading[2]) });
      continue;
    }

    if (DIVIDER.test(line)) {
      flushAll();
      blocks.push({ kind: 'divider' });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      flushQuote();
      const isOrdered = !!ordered;
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, start: ordered ? Number(ordered[1]) : 1, items: [] };
      }
      list.items.push(bullet ? bullet[1] : (ordered?.[2] ?? ''));
      continue;
    }

    const quoted = QUOTE.exec(line);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(quoted[1]);
      continue;
    }

    // An indented line right after a list item continues that item.
    if (list && /^\s{2,}\S/.test(line)) {
      const items: string[] = list.items;
      items[items.length - 1] = `${items[items.length - 1]} ${line.trim()}`;
      continue;
    }

    flushQuote();
    flushList();
    paragraph.push(line.trim());
  }
  flushAll();
  return blocks;
}

/** Only web and mail links open from a preview; anything else stays plain text. */
export function isSafeHref(href: string | undefined): href is string {
  return !!href && /^(https?:\/\/|mailto:)/i.test(href.trim());
}
