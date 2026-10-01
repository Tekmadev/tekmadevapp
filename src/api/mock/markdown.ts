import type { BlockOf, BlogBlock, CalloutVariant, RenderResult } from '../schemas/blog';

/**
 * The mock server's Markdown to blocks converter (POST /blog/render), written to
 * the exact syntax the brief supports (8.11, "Supported Markdown"):
 *
 * - `##`, `###`, `####` headings; a single `#` becomes `##`. Deeper levels are not supported.
 * - paragraphs separated by a blank line (soft-wrapped lines join with a space)
 * - `-` / `*` bullet lists, `1.` numbered lists (no nesting: indented items are flattened)
 * - `> quote`
 * - `> [!tip] text`, `> [!info] text`, `> [!warning] text` callouts
 * - `> [!answer] Question?` then `> answer text` on the next quoted lines
 * - `![alt](url "caption")` on its own line
 * - pipe tables with a `---` separator row
 * - fenced code blocks (``` with an optional language)
 * - `---` divider
 * - `::: cta`, then `heading:`, `body:`, `button:`, `href:` lines, then `:::`
 *
 * Anything else becomes a paragraph. Inline syntax (bold, italic, code, links)
 * stays in the block text as Markdown, exactly like the server sends it.
 */

/** Words per minute for the reading time shown in the Preview. */
const WORDS_PER_MINUTE = 225;

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,4})\s+(.*?)\s*$/;
const DIVIDER = /^\s{0,3}-{3,}\s*$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})\.\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const IMAGE = /^\s*!\[([^\]]*)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s*\)\s*$/;
const CTA_OPEN = /^\s*:::\s*cta\s*$/i;
const CTA_CLOSE = /^\s*:::\s*$/;
const CTA_FIELD = /^\s*(heading|body|button|href)\s*:\s*(.*?)\s*$/i;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const CALLOUT = /^\[!(tip|info|warning)\]\s*(.*)$/i;
const ANSWER = /^\[!answer\]\s*(.*)$/i;

const isBlank = (line: string) => line.trim() === '';

/** A closing fence uses the same character, at least as many times, and nothing else. */
function closesFence(line: string, marker: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < marker.length) return false;
  for (const ch of trimmed) if (ch !== marker[0]) return false;
  return true;
}

/** Split a pipe table row into trimmed cells, ignoring the outer pipes and escaped `\|`. */
function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\' && row[i + 1] === '|') {
      current += '|';
      i += 1;
    } else if (ch === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** A header line and the separator under it, with the same number of columns. */
function isTableStart(lines: string[], i: number): boolean {
  const header = lines[i];
  const separator = lines[i + 1];
  if (header === undefined || separator === undefined) return false;
  if (!header.includes('|') || !separator.includes('|') || !TABLE_SEPARATOR.test(separator)) return false;
  return splitRow(header).length === splitRow(separator).length;
}

/** Joins the lines of a quoted group: blank quoted lines become paragraph breaks. */
function joinQuoted(lines: string[]): string {
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (isBlank(line)) {
      if (current.length > 0) paragraphs.push(current.join(' '));
      current = [];
    } else {
      current.push(line.trim());
    }
  }
  if (current.length > 0) paragraphs.push(current.join(' '));
  return paragraphs.join('\n\n');
}

function quoteBlock(content: string[]): BlogBlock | null {
  const first = (content[0] ?? '').trim();

  const callout = CALLOUT.exec(first);
  if (callout) {
    const variant = callout[1].toLowerCase() as CalloutVariant;
    const text = joinQuoted([callout[2], ...content.slice(1)]);
    // An empty callout has nothing to show.
    return text ? { type: 'callout', variant, text } : null;
  }

  const answer = ANSWER.exec(first);
  if (answer) {
    const question = answer[1].trim();
    const text = joinQuoted(content.slice(1));
    if (!text) return question ? { type: 'paragraph', text: question } : null;
    return question ? { type: 'answer', question, text } : { type: 'answer', text };
  }

  const text = joinQuoted(content);
  return text ? { type: 'quote', text } : null;
}

/** Parses the inside of a `::: cta` block. Missing heading, button or href: not a CTA. */
function ctaBlock(content: string[]): BlockOf<'cta'> | null {
  const fields: Partial<Record<'heading' | 'body' | 'button' | 'href', string>> = {};
  let lastKey: keyof typeof fields | null = null;
  for (const line of content) {
    if (isBlank(line)) continue;
    const field = CTA_FIELD.exec(line);
    if (field) {
      lastKey = field[1].toLowerCase() as keyof typeof fields;
      fields[lastKey] = field[2];
    } else if (lastKey === 'body') {
      // A long body may wrap onto the next lines.
      fields.body = `${fields.body ?? ''} ${line.trim()}`.trim();
    } else {
      return null;
    }
  }
  const { heading, body, button, href } = fields;
  if (!heading || !button || !href) return null;
  return body ? { type: 'cta', heading, body, buttonLabel: button, href } : { type: 'cta', heading, buttonLabel: button, href };
}

export function markdownToBlocks(markdown: string): BlogBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const blocks: BlogBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      flushParagraph();
      i += 1;
      continue;
    }

    // Fenced code: everything up to the closing fence (or the end) is kept verbatim.
    const fence = FENCE.exec(line);
    if (fence) {
      flushParagraph();
      const marker = fence[1];
      const language = fence[2];
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !closesFence(lines[i], marker)) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // the closing fence
      blocks.push(language ? { type: 'code', language, code: code.join('\n') } : { type: 'code', code: code.join('\n') });
      continue;
    }

    if (CTA_OPEN.test(line)) {
      let end = i + 1;
      while (end < lines.length && !CTA_CLOSE.test(lines[end])) end += 1;
      const cta = end < lines.length ? ctaBlock(lines.slice(i + 1, end)) : null;
      if (cta) {
        flushParagraph();
        blocks.push(cta);
        i = end + 1;
        continue;
      }
      // Not a valid CTA: the opening line falls through and becomes paragraph text.
    }

    if (isTableStart(lines, i)) {
      flushParagraph();
      const headers = splitRow(lines[i]);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
        const cells = splitRow(lines[i]);
        // Every row gets exactly one cell per header.
        rows.push(headers.map((_, c) => cells[c] ?? ''));
        i += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    if (DIVIDER.test(line)) {
      flushParagraph();
      blocks.push({ type: 'divider' });
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const text = heading[2].replace(/\s+#+$/, '').trim();
      if (text) {
        flushParagraph();
        const hashes = heading[1].length;
        blocks.push({ type: 'heading', level: hashes <= 2 ? 2 : hashes === 3 ? 3 : 4, text });
        i += 1;
        continue;
      }
    }

    const image = IMAGE.exec(line);
    if (image) {
      flushParagraph();
      const [, alt, url, caption] = image;
      blocks.push(caption ? { type: 'image', url, alt, caption } : { type: 'image', url, alt });
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      flushParagraph();
      const content: string[] = [];
      while (i < lines.length) {
        const quoted = QUOTE.exec(lines[i]);
        if (!quoted) break;
        content.push(quoted[1]);
        i += 1;
      }
      const block = quoteBlock(content);
      if (block) blocks.push(block);
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    // A numbered line only interrupts a paragraph when it starts at 1 ("In 2026. we..." stays text).
    if (bullet || (ordered && (paragraph.length === 0 || ordered[1] === '1'))) {
      flushParagraph();
      const isOrdered = !bullet;
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i];
        const item = isOrdered ? ORDERED.exec(current) : BULLET.exec(current);
        if (item) {
          items.push((isOrdered ? item[2] : item[1]).trim());
          i += 1;
          continue;
        }
        if (isBlank(current)) {
          // A blank line between items of the same kind keeps one list.
          let next = i;
          while (next < lines.length && isBlank(lines[next])) next += 1;
          const nextLine = lines[next];
          if (nextLine !== undefined && (isOrdered ? ORDERED.test(nextLine) : BULLET.test(nextLine)) && !DIVIDER.test(nextLine)) {
            i = next;
            continue;
          }
          break;
        }
        if (startsBlock(lines, i) || (isOrdered ? BULLET.test(current) : ORDERED.test(current))) break;
        // A wrapped line continues the item above it.
        items[items.length - 1] = `${items[items.length - 1]} ${current.trim()}`.trim();
        i += 1;
      }
      blocks.push({ type: 'list', ordered: isOrdered, items: items.filter((item) => item.length > 0) });
      continue;
    }

    paragraph.push(line.trim());
    i += 1;
  }
  flushParagraph();
  return blocks.filter((block) => block.type !== 'list' || block.items.length > 0);
}

/** True when line `i` opens a block other than a paragraph or list item. */
function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i];
  if (FENCE.test(line) || CTA_OPEN.test(line) || DIVIDER.test(line) || QUOTE.test(line) || IMAGE.test(line)) return true;
  if (isTableStart(lines, i)) return true;
  const heading = HEADING.exec(line);
  return !!heading && heading[2].replace(/\s+#+$/, '').trim().length > 0;
}

/** Strips inline Markdown so syntax characters are not counted as words. */
function plain(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, ' ');
}

function blockWords(block: BlogBlock): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'quote':
    case 'callout':
      return block.text;
    case 'answer':
      return `${block.question ?? ''} ${block.text}`;
    case 'list':
      return block.items.join(' ');
    case 'image':
      return block.caption ?? '';
    case 'table':
      return [...block.headers, ...block.rows.flat()].join(' ');
    case 'code':
      return block.code;
    case 'cta':
      return `${block.heading} ${block.body ?? ''} ${block.buttonLabel}`;
    case 'divider':
      return '';
  }
}

/** A token counts as a word when it has a letter or digit (Latin, accented Latin). */
const WORDLIKE = /[A-Za-z0-9\u00C0-\u024F]/;

export function countWords(blocks: BlogBlock[]): number {
  let words = 0;
  for (const block of blocks) {
    words += plain(blockWords(block)).split(/\s+/).filter((w) => WORDLIKE.test(w)).length;
  }
  return words;
}

/** Minutes to read, rounded up: 0 for an empty body, otherwise at least 1. */
export function readingTimeMinutes(blocks: BlogBlock[]): number {
  const words = countWords(blocks);
  return words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/** What POST /blog/render returns. */
export function renderMarkdown(markdown: string): RenderResult {
  const blocks = markdownToBlocks(markdown);
  return { blocks, readingTimeMinutes: readingTimeMinutes(blocks) };
}

/** Folds accents ("Caf\u00e9" style letters to plain ones). Engines without normalize() keep the text. */
function fold(input: string): string {
  try {
    return input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return input;
  }
}

/**
 * URL slug the way the server makes one: lowercase ASCII letters, digits and
 * single dashes ("AI & Booked Calls!" becomes "ai-booked-calls"). Accents are
 * folded first. May return "" when nothing usable is left.
 */
export function slugify(input: string, maxLength = 80): string {
  return fold(input)
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}
