import {
  ANSWER_QUESTION,
  ANSWER_TEXT,
  CTA_HEADING,
  IMAGE_ALT_PLACEHOLDER,
  imageMarkdown,
  insertAnswer,
  insertBlock,
  insertCallout,
  insertCta,
  insertDivider,
  insertImage,
  insertLink,
  insertTable,
  insertUploadedImage,
  lineRange,
  linkMarkdown,
  mapSelection,
  selectedText,
  toggleInline,
  toggleLinePrefix,
  type Edit,
  type Selection,
} from '../toolbar';

/** Text with "[" and "]" marking the selection (or "|" for a cursor), to keep cases readable. */
function parse(marked: string): { text: string; selection: Selection } {
  const cursor = marked.indexOf('|');
  if (cursor >= 0) return { text: marked.replace('|', ''), selection: { start: cursor, end: cursor } };
  const start = marked.indexOf('[');
  const end = marked.indexOf(']') - 1;
  return { text: marked.replace('[', '').replace(']', ''), selection: { start, end } };
}

function show(edit: Edit): string {
  const { text, selection } = edit;
  if (selection.start === selection.end) return `${text.slice(0, selection.start)}|${text.slice(selection.start)}`;
  return `${text.slice(0, selection.start)}[${text.slice(selection.start, selection.end)}]${text.slice(selection.end)}`;
}

describe('toggleInline', () => {
  it('wraps the selection in bold and keeps the word selected', () => {
    const { text, selection } = parse('Make it [count] today');
    expect(show(toggleInline(text, selection, 'bold'))).toBe('Make it **[count]** today');
  });

  it('wraps in italic', () => {
    const { text, selection } = parse('A [quiet] word');
    expect(show(toggleInline(text, selection, 'italic'))).toBe('A *[quiet]* word');
  });

  it('keeps spaces at the edges outside the markers', () => {
    const { text, selection } = parse('one[ two ]three');
    expect(show(toggleInline(text, selection, 'bold'))).toBe('one **[two]** three');
  });

  it('inserts an empty pair with the cursor between when nothing is selected', () => {
    const { text, selection } = parse('Hello |');
    expect(show(toggleInline(text, selection, 'bold'))).toBe('Hello **|**');
    expect(show(toggleInline(text, selection, 'italic'))).toBe('Hello *|*');
  });

  it('unwraps when the markers sit just outside the selection', () => {
    const { text, selection } = parse('Make it **[count]** today');
    expect(show(toggleInline(text, selection, 'bold'))).toBe('Make it [count] today');
  });

  it('unwraps when the markers are selected with the word', () => {
    const { text, selection } = parse('Make it [**count**] today');
    expect(show(toggleInline(text, selection, 'bold'))).toBe('Make it [count] today');
  });

  it('adds italic to bold text instead of breaking the bold', () => {
    const { text, selection } = parse('**[word]**');
    expect(show(toggleInline(text, selection, 'italic'))).toBe('***[word]***');
  });

  it('removes only italic from bold italic', () => {
    const { text, selection } = parse('***[word]***');
    expect(show(toggleInline(text, selection, 'italic'))).toBe('**[word]**');
  });

  it('wraps each line of a multi-line selection', () => {
    const { text, selection } = parse('[first\nsecond]');
    expect(toggleInline(text, selection, 'bold').text).toBe('**first**\n**second**');
  });

  it('leaves a selection of only spaces alone', () => {
    const { text, selection } = parse('a[   ]b');
    expect(toggleInline(text, selection, 'bold').text).toBe('a   b');
  });
});

describe('lineRange', () => {
  it('covers the whole line around a cursor', () => {
    const text = 'one\ntwo three\nfour';
    expect(lineRange(text, { start: 6, end: 6 })).toEqual({ from: 4, to: 13 });
  });

  it('does not take the next line when the selection ends after a newline', () => {
    const text = 'one\ntwo\nthree';
    expect(lineRange(text, { start: 0, end: 4 })).toEqual({ from: 0, to: 3 });
  });

  it('handles a cursor at the very start of a body that begins with a newline', () => {
    expect(lineRange('\nabc', { start: 0, end: 0 })).toEqual({ from: 0, to: 0 });
  });
});

describe('toggleLinePrefix', () => {
  it('turns the current line into an H2 and moves the cursor with it', () => {
    const { text, selection } = parse('Intro\n\nWhy it| matters');
    expect(show(toggleLinePrefix(text, selection, 'h2'))).toBe('Intro\n\n## Why it| matters');
  });

  it('starts an empty line as a heading', () => {
    const { text, selection } = parse('|');
    expect(show(toggleLinePrefix(text, selection, 'h3'))).toBe('### |');
  });

  it('switches heading levels and toggles the same level off', () => {
    expect(toggleLinePrefix('## Title', { start: 3, end: 3 }, 'h3').text).toBe('### Title');
    expect(toggleLinePrefix('### Title', { start: 4, end: 4 }, 'h2').text).toBe('## Title');
    expect(show(toggleLinePrefix('## Ti|tle'.replace('|', ''), { start: 5, end: 5 }, 'h2'))).toBe('Ti|tle');
  });

  it('bullets every selected line, then removes them', () => {
    const { text, selection } = parse('[one\ntwo\nthree]');
    const on = toggleLinePrefix(text, selection, 'bullet');
    expect(on.text).toBe('- one\n- two\n- three');
    expect(show(on)).toBe('[- one\n- two\n- three]');
    expect(toggleLinePrefix(on.text, on.selection, 'bullet').text).toBe('one\ntwo\nthree');
  });

  it('numbers lines 1, 2, 3 and replaces bullets', () => {
    const { text, selection } = parse('[- one\n- two\n- three]');
    expect(toggleLinePrefix(text, selection, 'numbered').text).toBe('1. one\n2. two\n3. three');
  });

  it('skips blank lines when numbering', () => {
    const { text, selection } = parse('[one\n\ntwo]');
    expect(toggleLinePrefix(text, selection, 'numbered').text).toBe('1. one\n\n2. two');
  });

  it('quotes lines and keeps a blank line inside the quote', () => {
    const { text, selection } = parse('[one\n\ntwo]');
    expect(toggleLinePrefix(text, selection, 'quote').text).toBe('> one\n>\n> two');
  });

  it('gives an empty line "> " to type after, and unquotes', () => {
    expect(show(toggleLinePrefix('', { start: 0, end: 0 }, 'quote'))).toBe('> |');
    expect(toggleLinePrefix('> said', { start: 4, end: 4 }, 'quote').text).toBe('said');
  });

  it('only touches the lines in the selection', () => {
    const { text, selection } = parse('keep\n[a\nb]\nkeep');
    expect(toggleLinePrefix(text, selection, 'bullet').text).toBe('keep\n- a\n- b\nkeep');
  });
});

describe('insertBlock', () => {
  it('puts a blank line before and after the block', () => {
    const { text, selection } = parse('Para one.|');
    expect(show(insertBlock(text, selection, '---'))).toBe('Para one.\n\n---\n\n|');
  });

  it('splits a paragraph at the cursor', () => {
    const { text, selection } = parse('Hello |world');
    expect(insertBlock(text, selection, 'BLOCK').text).toBe('Hello\n\nBLOCK\n\nworld');
  });

  it('adds nothing before a block at the start of the body', () => {
    expect(insertBlock('', { start: 0, end: 0 }, 'BLOCK').text).toBe('BLOCK\n\n');
  });

  it('reuses blank lines that are already there', () => {
    const { text, selection } = parse('One.\n\n|\n\nTwo.');
    expect(insertBlock(text, selection, 'BLOCK').text).toBe('One.\n\nBLOCK\n\nTwo.');
  });

  it('can leave the cursor at the end of the block', () => {
    const { text, selection } = parse('|');
    expect(show(insertBlock(text, selection, '> [!tip] ', 'end'))).toBe('> [!tip] |\n\n');
  });
});

describe('blocks', () => {
  it('inserts a callout with the selected text', () => {
    const { text, selection } = parse('Intro.\n\n[Check the service area first.]');
    expect(insertCallout(text, selection, 'warning').text).toBe('Intro.\n\n> [!warning] Check the service area first.\n\n');
  });

  it('inserts an empty callout ready to type', () => {
    const { text, selection } = parse('|');
    expect(show(insertCallout(text, selection, 'tip'))).toBe('> [!tip] |\n\n');
  });

  it('quotes every line of a multi-line callout', () => {
    const { text, selection } = parse('[line one\nline two]');
    expect(insertCallout(text, selection, 'info').text).toBe('> [!info] line one\n> line two\n\n');
  });

  it('inserts the Q&A answer block with the question selected', () => {
    const { text, selection } = parse('|');
    const edit = insertAnswer(text, selection);
    expect(edit.text).toBe(`> [!answer] ${ANSWER_QUESTION}\n> ${ANSWER_TEXT}\n\n`);
    expect(edit.text.slice(edit.selection.start, edit.selection.end)).toBe(ANSWER_QUESTION);
  });

  it('uses the selection as the question and selects the answer placeholder', () => {
    const { text, selection } = parse('[Does it work after hours?]');
    const edit = insertAnswer(text, selection);
    expect(edit.text).toBe(`> [!answer] Does it work after hours?\n> ${ANSWER_TEXT}\n\n`);
    expect(edit.text.slice(edit.selection.start, edit.selection.end)).toBe(ANSWER_TEXT);
  });

  it('inserts a pipe table with its separator row', () => {
    const edit = insertTable('Text|'.replace('|', ''), { start: 4, end: 4 });
    expect(edit.text).toBe('Text\n\n| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n| Cell | Cell |\n\n');
    expect(edit.text.slice(edit.selection.start, edit.selection.end)).toBe('Column 1');
  });

  it('inserts the CTA template with the heading selected', () => {
    const edit = insertCta('', { start: 0, end: 0 });
    expect(edit.text.startsWith('::: cta\nheading: ')).toBe(true);
    expect(edit.text).toContain('\nbody: ');
    expect(edit.text).toContain('\nbutton: ');
    expect(edit.text).toContain('\nhref: /start\n:::');
    expect(edit.text.slice(edit.selection.start, edit.selection.end)).toBe(CTA_HEADING);
  });

  it('inserts a divider and moves to the next paragraph', () => {
    const { text, selection } = parse('Above|');
    expect(show(insertDivider(text, selection))).toBe('Above\n\n---\n\n|');
  });
});

describe('links and images', () => {
  it('writes [text](url)', () => {
    expect(linkMarkdown('our pricing', 'https://www.tekmadev.com/pricing')).toBe('[our pricing](https://www.tekmadev.com/pricing)');
  });

  it('keeps brackets in the text from breaking the link', () => {
    expect(linkMarkdown('a [b]', '/start')).toBe('[a (b)](/start)');
  });

  it('uses the URL as the text when there is none', () => {
    expect(linkMarkdown('  ', '/start')).toBe('[/start](/start)');
  });

  it('replaces the selection with the link', () => {
    const { text, selection } = parse('See [pricing] now');
    expect(show(insertLink(text, selection, 'pricing', '/pricing'))).toBe('See [pricing](/pricing)| now');
  });

  it('writes an image with and without a caption', () => {
    expect(imageMarkdown('https://x.com/a.jpg', 'A van', 'Most calls are urgent.')).toBe('![A van](https://x.com/a.jpg "Most calls are urgent.")');
    expect(imageMarkdown('https://x.com/a.jpg', 'A van', '')).toBe('![A van](https://x.com/a.jpg)');
  });

  it('cleans alt brackets, caption quotes and URL spaces', () => {
    expect(imageMarkdown(' https://x.com/my pic.jpg ', 'A [big] van', 'He said "hi"')).toBe(
      `![A big van](https://x.com/my%20pic.jpg "He said 'hi'")`,
    );
  });

  it('puts an image on its own line', () => {
    const { text, selection } = parse('Before|');
    expect(insertImage(text, selection, 'https://x.com/a.jpg', 'Alt', '').text).toBe('Before\n\n![Alt](https://x.com/a.jpg)\n\n');
  });

  it('reads the selected text on one line', () => {
    const { text, selection } = parse('a [b\nc] d');
    expect(selectedText(text, selection)).toBe('b c');
  });
});

describe('insertUploadedImage', () => {
  const url = 'https://mock-project.supabase.co/storage/v1/object/public/blog-media/posts/2026/10/1a2b3c4d-van.webp';

  it('puts the image on its own line at the cursor and selects the alt placeholder', () => {
    const { text, selection } = parse('First paragraph.|\n\nSecond.');
    const edit = insertUploadedImage(text, selection, url);
    expect(show(edit)).toBe(`First paragraph.\n\n![[Describe the image]](${url})\n\nSecond.`);
    expect(edit.text.slice(edit.selection.start, edit.selection.end)).toBe(IMAGE_ALT_PLACEHOLDER);
  });

  it('splits a paragraph with blank lines when the cursor is inside it', () => {
    const { text, selection } = parse('Hello |world');
    expect(insertUploadedImage(text, selection, url).text).toBe(`Hello\n\n![Describe the image](${url})\n\nworld`);
  });

  it('starts an empty body without blank lines before the image', () => {
    const edit = insertUploadedImage('', { start: 0, end: 0 }, url);
    expect(edit.text).toBe(`![Describe the image](${url})\n\n`);
    expect(edit.selection).toEqual({ start: 2, end: 2 + IMAGE_ALT_PLACEHOLDER.length });
  });

  it('never replaces selected text: the image goes after it', () => {
    const { text, selection } = parse('Keep [these words] here');
    expect(insertUploadedImage(text, selection, url).text).toBe(`Keep these words\n\n![Describe the image](${url})\n\nhere`);
  });

  it('encodes spaces and parentheses so the Markdown stays whole', () => {
    expect(insertUploadedImage('', { start: 0, end: 0 }, 'https://x.com/a b(1).webp').text).toBe(
      '![Describe the image](https://x.com/a%20b%281%29.webp)\n\n',
    );
  });
});

describe('mapSelection', () => {
  const at = (n: number): Selection => ({ start: n, end: n });

  it('keeps a point when the text changed after it', () => {
    expect(mapSelection('Hello world', 'Hello world, again', at(5))).toEqual(at(5));
  });

  it('moves a point by what was typed or deleted before it', () => {
    expect(mapSelection('Hello world', 'Oh, hello world', at(6))).toEqual(at(10));
    expect(mapSelection('Hello big world', 'Hello world', at(10))).toEqual(at(6));
  });

  it('leaves the point before text typed exactly at it', () => {
    expect(mapSelection('ab', 'aXYZb', at(1))).toEqual(at(1));
  });

  it('sends a point inside deleted text to where the deletion starts', () => {
    expect(mapSelection('Hello world', 'Hello ', at(8))).toEqual(at(6));
  });

  it('follows a run of single edits exactly (the editor maps on every change)', () => {
    let text = 'Intro.\n\nOutro.';
    let anchor = at(6);
    for (const next of ['Big intro.\n\nOutro.', 'Big intro.\n\nOutro, longer.', 'A big intro.\n\nOutro, longer.']) {
      anchor = mapSelection(text, next, anchor);
      text = next;
    }
    expect(text.slice(0, anchor.start)).toBe('A big intro.');
  });

  it('keeps a selection inside the text', () => {
    expect(mapSelection('abc', 'abc', { start: 10, end: 2 })).toEqual({ start: 2, end: 3 });
  });
});
