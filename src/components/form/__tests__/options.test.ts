import { filterOptions, selectedOptions, toggleValue, type SelectOption } from '../options';

const cities: SelectOption[] = [
  { value: 'mtl', label: 'Montréal', hint: 'Quebec' },
  { value: 'ham', label: 'Hamilton', hint: 'Ontario' },
  { value: 'ott', label: 'Ottawa', hint: 'Ontario' },
];

describe('options', () => {
  it('filters on label and hint, ignoring case and accents', () => {
    expect(filterOptions(cities, 'montreal').map((o) => o.value)).toEqual(['mtl']);
    expect(filterOptions(cities, 'ontario ott').map((o) => o.value)).toEqual(['ott']);
    expect(filterOptions(cities, '  ')).toHaveLength(3);
  });

  it('toggles values for multiple choice', () => {
    expect(toggleValue(['a', 'b'], 'b')).toEqual(['a']);
    expect(toggleValue(['a'], 'c')).toEqual(['a', 'c']);
  });

  it('returns chosen options in option order and skips unknown values', () => {
    expect(selectedOptions(cities, ['ott', 'zzz', 'mtl']).map((o) => o.label)).toEqual(['Montréal', 'Ottawa']);
  });
});
