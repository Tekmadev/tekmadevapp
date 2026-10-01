import { addChips, removeChip, splitChipText } from '../chips';

describe('splitChipText', () => {
  it('finishes chips at commas and new lines and keeps the unfinished rest', () => {
    expect(splitChipText('seo, local,')).toEqual({ complete: ['seo', 'local'], rest: '' });
    expect(splitChipText('a,b')).toEqual({ complete: ['a'], rest: 'b' });
    expect(splitChipText('a\nb\n')).toEqual({ complete: ['a', 'b'], rest: '' });
    expect(splitChipText(' , ,x')).toEqual({ complete: [], rest: 'x' });
    expect(splitChipText('plain')).toEqual({ complete: [], rest: 'plain' });
  });
});

describe('addChips', () => {
  it('trims, skips blanks and ignores duplicates whatever their case', () => {
    expect(addChips(['SEO'], ['seo', ' web ', ' ', 'Design'])).toEqual({
      chips: ['SEO', 'web', 'Design'],
      duplicates: ['seo'],
      overflow: [],
    });
    expect(addChips([], ['a', 'A']).chips).toEqual(['a']);
  });

  it('stops at the maximum', () => {
    expect(addChips(['a'], ['b', 'c'], { maxItems: 2 })).toEqual({ chips: ['a', 'b'], duplicates: [], overflow: ['c'] });
  });

  it('cuts long chips and normalizes before comparing', () => {
    expect(addChips([], ['abcdef'], { maxLength: 3 }).chips).toEqual(['abc']);
    expect(addChips(['web design'], ['Web Design'], { normalize: (s) => s.toLowerCase() }).duplicates).toEqual(['web design']);
  });
});

describe('removeChip', () => {
  it('removes by position', () => {
    expect(removeChip(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
    expect(removeChip(['a'], 5)).toEqual(['a']);
  });
});
