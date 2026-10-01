import { markdownToBlocks, readingTimeMinutes, renderMarkdown, slugify } from '@/api/mock/markdown';
import { blogPosts } from '@/api/mock/fixtures/blog';
import { zRenderResult, type BlogBlock } from '@/api/schemas/blog';

/**
 * The mock Markdown converter follows the brief's supported syntax exactly
 * (8.11): every block type, inline Markdown kept as text, and "anything else
 * becomes a paragraph".
 */

const md = (...lines: string[]) => lines.join('\n');
const types = (blocks: BlogBlock[]) => blocks.map((b) => b.type);

describe('headings', () => {
  it('maps ##, ### and #### to levels 2 to 4, and a single # to level 2', () => {
    expect(markdownToBlocks(md('# Title', '## Two', '### Three', '#### Four'))).toEqual([
      { type: 'heading', level: 2, text: 'Title' },
      { type: 'heading', level: 2, text: 'Two' },
      { type: 'heading', level: 3, text: 'Three' },
      { type: 'heading', level: 4, text: 'Four' },
    ]);
  });

  it('drops closing hashes and keeps inline Markdown', () => {
    expect(markdownToBlocks('## Why **speed** wins ##')).toEqual([{ type: 'heading', level: 2, text: 'Why **speed** wins' }]);
  });

  it('treats deeper levels and a missing space as paragraphs', () => {
    expect(markdownToBlocks(md('##### Five', '', '#hashtag'))).toEqual([
      { type: 'paragraph', text: '##### Five' },
      { type: 'paragraph', text: '#hashtag' },
    ]);
  });
});

describe('paragraphs', () => {
  it('splits on blank lines, joins wrapped lines and keeps inline syntax verbatim', () => {
    const blocks = markdownToBlocks(md('First **bold** and *italic*', 'with `code` and [a link](https://x.test).', '', '', 'Second.'));
    expect(blocks).toEqual([
      { type: 'paragraph', text: 'First **bold** and *italic* with `code` and [a link](https://x.test).' },
      { type: 'paragraph', text: 'Second.' },
    ]);
  });

  it('handles Windows line endings and an empty document', () => {
    expect(markdownToBlocks('One\r\nTwo\r\n\r\nThree')).toEqual([
      { type: 'paragraph', text: 'One Two' },
      { type: 'paragraph', text: 'Three' },
    ]);
    expect(markdownToBlocks('')).toEqual([]);
    expect(markdownToBlocks('   \n\n  ')).toEqual([]);
  });

  it('lets a heading interrupt a paragraph', () => {
    expect(types(markdownToBlocks(md('Text', '## Heading', 'More')))).toEqual(['paragraph', 'heading', 'paragraph']);
  });
});

describe('lists', () => {
  it('reads - and * bullets as one unordered list', () => {
    expect(markdownToBlocks(md('- one', '* two', '- **three**'))).toEqual([{ type: 'list', ordered: false, items: ['one', 'two', '**three**'] }]);
  });

  it('reads numbered lists, whatever the numbers', () => {
    expect(markdownToBlocks(md('1. one', '2. two', '7. three'))).toEqual([{ type: 'list', ordered: true, items: ['one', 'two', 'three'] }]);
  });

  it('flattens nesting, joins wrapped items and keeps one list across blank lines', () => {
    expect(markdownToBlocks(md('- one', '  - nested', '- two', 'continues here', '', '- three'))).toEqual([
      { type: 'list', ordered: false, items: ['one', 'nested', 'two continues here', 'three'] },
    ]);
  });

  it('starts a new list when the kind changes', () => {
    expect(markdownToBlocks(md('- a', '1. b'))).toEqual([
      { type: 'list', ordered: false, items: ['a'] },
      { type: 'list', ordered: true, items: ['b'] },
    ]);
  });

  it('only lets a numbered line starting at 1 interrupt a paragraph', () => {
    expect(markdownToBlocks(md('We grew a lot in', '2026. It was busy.'))).toEqual([{ type: 'paragraph', text: 'We grew a lot in 2026. It was busy.' }]);
    expect(types(markdownToBlocks(md('Steps:', '1. Call', '2. Book')))).toEqual(['paragraph', 'list']);
  });

  it('does not mistake bold text for a bullet', () => {
    expect(markdownToBlocks('**Bold** start')).toEqual([{ type: 'paragraph', text: '**Bold** start' }]);
  });
});

describe('quotes, callouts and answers', () => {
  it('reads a plain quote across lines, with blank quoted lines as paragraph breaks', () => {
    expect(markdownToBlocks(md('> First line', '> second line', '>', '> New paragraph'))).toEqual([
      { type: 'quote', text: 'First line second line\n\nNew paragraph' },
    ]);
  });

  it('reads tip, info and warning callouts (case-insensitive), with continuation lines', () => {
    expect(markdownToBlocks(md('> [!tip] Start small.', '> Then grow.', '', '> [!INFO] Note', '', '> [!warning] Careful'))).toEqual([
      { type: 'callout', variant: 'tip', text: 'Start small. Then grow.' },
      { type: 'callout', variant: 'info', text: 'Note' },
      { type: 'callout', variant: 'warning', text: 'Careful' },
    ]);
  });

  it('keeps an unknown marker as a quote', () => {
    expect(markdownToBlocks('> [!note] Hello')).toEqual([{ type: 'quote', text: '[!note] Hello' }]);
  });

  it('reads an answer block: the question on the marker line, the answer on the next quoted lines', () => {
    expect(markdownToBlocks(md('> [!answer] Does it work after hours?', '> Yes. It replies by text', '> and books the next slot.'))).toEqual([
      { type: 'answer', question: 'Does it work after hours?', text: 'Yes. It replies by text and books the next slot.' },
    ]);
  });

  it('allows an answer without a question, and drops empty callouts', () => {
    expect(markdownToBlocks(md('> [!answer]', '> Just the answer.', '', '> [!tip]'))).toEqual([{ type: 'answer', text: 'Just the answer.' }]);
  });

  it('ends a quote at a blank line', () => {
    expect(types(markdownToBlocks(md('> one', '', '> two')))).toEqual(['quote', 'quote']);
  });
});

describe('images', () => {
  it('reads an image on its own line, with and without a caption', () => {
    expect(markdownToBlocks(md('![A van](https://img.test/van.jpg "Our van")', '![](https://img.test/x.png)'))).toEqual([
      { type: 'image', url: 'https://img.test/van.jpg', alt: 'A van', caption: 'Our van' },
      { type: 'image', url: 'https://img.test/x.png', alt: '' },
    ]);
  });

  it('keeps an inline image inside text as paragraph text', () => {
    expect(markdownToBlocks('See ![x](https://img.test/x.png) here')).toEqual([{ type: 'paragraph', text: 'See ![x](https://img.test/x.png) here' }]);
  });
});

describe('tables', () => {
  it('reads a pipe table with a --- separator, padding short rows', () => {
    expect(markdownToBlocks(md('| Month | Booked |', '| --- | :---: |', '| July | 38 |', '| August |', '', 'After'))).toEqual([
      { type: 'table', headers: ['Month', 'Booked'], rows: [['July', '38'], ['August', '']] },
      { type: 'paragraph', text: 'After' },
    ]);
  });

  it('reads tables without outer pipes and with escaped pipes', () => {
    expect(markdownToBlocks(md('A | B', '--- | ---', 'x \\| y | z'))).toEqual([{ type: 'table', headers: ['A', 'B'], rows: [['x | y', 'z']] }]);
  });

  it('needs a separator with the same column count', () => {
    expect(types(markdownToBlocks(md('| A | B |', '| --- |')))).toEqual(['paragraph']);
    expect(types(markdownToBlocks(md('a | b', 'c | d')))).toEqual(['paragraph']);
  });
});

describe('code', () => {
  it('keeps fenced code verbatim, with its language', () => {
    expect(markdownToBlocks(md('```json', '{', '  "a": "**not bold**"', '}', '```', 'After'))).toEqual([
      { type: 'code', language: 'json', code: '{\n  "a": "**not bold**"\n}' },
      { type: 'paragraph', text: 'After' },
    ]);
  });

  it('allows no language, blank lines inside, and an unclosed fence', () => {
    expect(markdownToBlocks(md('```', 'a', '', '## not a heading', '```'))).toEqual([{ type: 'code', code: 'a\n\n## not a heading' }]);
    expect(markdownToBlocks(md('```ts', 'const x = 1;'))).toEqual([{ type: 'code', language: 'ts', code: 'const x = 1;' }]);
  });
});

describe('dividers', () => {
  it('reads --- as a divider, even right under a paragraph', () => {
    expect(markdownToBlocks(md('Text', '---', '-----'))).toEqual([{ type: 'paragraph', text: 'Text' }, { type: 'divider' }, { type: 'divider' }]);
  });
});

describe('CTA blocks', () => {
  it('reads heading, body, button and href lines', () => {
    expect(markdownToBlocks(md('::: cta', 'heading: Book a call', 'body: We look at your numbers', 'with you.', 'button: Book now', 'href: /start', ':::'))).toEqual([
      { type: 'cta', heading: 'Book a call', body: 'We look at your numbers with you.', buttonLabel: 'Book now', href: '/start' },
    ]);
  });

  it('makes the body optional and ignores key case and order', () => {
    expect(markdownToBlocks(md(':::cta', 'HREF: https://www.tekmadev.com/start', 'Button: Go', 'heading: Ready?', ':::'))).toEqual([
      { type: 'cta', heading: 'Ready?', buttonLabel: 'Go', href: 'https://www.tekmadev.com/start' },
    ]);
  });

  it('falls back to paragraphs when a required line is missing or the block is not closed', () => {
    expect(types(markdownToBlocks(md('::: cta', 'heading: Missing button', 'href: /start', ':::')))).toEqual(['paragraph']);
    expect(markdownToBlocks(md('::: cta', 'heading: Open', '', 'Text'))).toEqual([
      { type: 'paragraph', text: '::: cta heading: Open' },
      { type: 'paragraph', text: 'Text' },
    ]);
  });
});

describe('render result', () => {
  it('computes reading time from the words in the blocks', () => {
    expect(renderMarkdown('').readingTimeMinutes).toBe(0);
    expect(renderMarkdown('One short line.').readingTimeMinutes).toBe(1);
    const long = Array.from({ length: 500 }, () => 'word').join(' ');
    expect(readingTimeMinutes(markdownToBlocks(long))).toBe(3);
    // Syntax characters are not words.
    expect(renderMarkdown('**bold** - *').readingTimeMinutes).toBe(1);
  });

  it('renders every fixture body into blocks that satisfy the schema', () => {
    for (const post of blogPosts) {
      expect(zRenderResult.safeParse(renderMarkdown(post.bodyMarkdown)).success).toBe(true);
    }
  });

  it('covers every block type in the AI drafts', () => {
    const all = ['heading', 'paragraph', 'list', 'quote', 'callout', 'answer', 'image', 'table', 'code', 'cta', 'divider'];
    for (const post of blogPosts.filter((p) => p.source === 'ai_draft')) {
      const found = new Set(types(renderMarkdown(post.bodyMarkdown).blocks));
      expect(all.filter((t) => !found.has(t as BlogBlock['type']))).toEqual([]);
    }
  });
});

describe('slugify', () => {
  it('lowercases, dashes and folds accents', () => {
    expect(slugify('AI & Booked Calls!')).toBe('ai-booked-calls');
    expect(slugify("  Owner's guide: 2026  ")).toBe('owners-guide-2026');
    // Built from char codes so this file stays ASCII.
    expect(slugify(`Caf${String.fromCharCode(0xe9)} Cr${String.fromCharCode(0xe8)}me`)).toBe('cafe-creme');
    expect(slugify('!!!')).toBe('');
    expect(slugify('a'.repeat(100)).length).toBe(80);
  });
});
