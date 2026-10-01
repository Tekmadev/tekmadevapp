import {
  changeDirection,
  countLabel,
  formatBytes,
  formatChange,
  formatCompact,
  formatCount,
  formatDurationMs,
  formatElapsed,
  formatPercent,
  formatPhone,
  initials,
  plural,
  truncate,
} from '@/lib/format';

describe('formatCount', () => {
  it('groups thousands like the web admin', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(7)).toBe('7');
    expect(formatCount(1204)).toBe('1,204');
    expect(formatCount(1_234_567)).toBe('1,234,567');
    expect(formatCount(-1204)).toBe('-1,204');
  });

  it('rounds to a whole number and never prints -0', () => {
    expect(formatCount(1204.4)).toBe('1,204');
    expect(formatCount(1204.5)).toBe('1,205');
    expect(formatCount(-0)).toBe('0');
    expect(formatCount(-0.4)).toBe('0');
  });

  it('is empty for non-numbers', () => {
    expect(formatCount(NaN)).toBe('');
    expect(formatCount(Infinity)).toBe('');
  });
});

describe('formatCompact', () => {
  it('keeps numbers under 1,000 as they are', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(999)).toBe('999');
    expect(formatCompact(42.4)).toBe('42');
  });

  it('shortens with one decimal at most', () => {
    expect(formatCompact(1000)).toBe('1K');
    expect(formatCompact(1204)).toBe('1.2K');
    expect(formatCompact(12_400)).toBe('12.4K');
    expect(formatCompact(12_450)).toBe('12.5K');
    expect(formatCompact(123_456)).toBe('123.5K');
    expect(formatCompact(2_500_000)).toBe('2.5M');
    expect(formatCompact(3_000_000_000)).toBe('3B');
  });

  it('rolls over to the next unit instead of 1000K', () => {
    expect(formatCompact(999.6)).toBe('1K');
    expect(formatCompact(999_949)).toBe('999.9K');
    expect(formatCompact(999_950)).toBe('1M');
    expect(formatCompact(999_960_000)).toBe('1B');
  });

  it('handles negatives and non-numbers', () => {
    expect(formatCompact(-12_400)).toBe('-12.4K');
    expect(formatCompact(-5)).toBe('-5');
    expect(formatCompact(NaN)).toBe('');
  });
});

describe('formatPercent', () => {
  it('shows whole percents by default', () => {
    expect(formatPercent(0.12)).toBe('12%');
    expect(formatPercent(0.72)).toBe('72%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(12.5)).toBe('1,250%');
  });

  it('rounds half away from zero without float noise', () => {
    // 0.145 * 100 is 14.499999999999998 in floating point.
    expect(formatPercent(0.145)).toBe('15%');
    expect(formatPercent(0.144)).toBe('14%');
    expect(formatPercent(-0.145)).toBe('-15%');
  });

  it('takes a number of decimals', () => {
    expect(formatPercent(0.725, 1)).toBe('72.5%');
    expect(formatPercent(0.7, 1)).toBe('70.0%');
    expect(formatPercent(0.12345, 2)).toBe('12.35%');
  });

  it('never prints -0%', () => {
    expect(formatPercent(-0.001)).toBe('0%');
    expect(formatPercent(-0)).toBe('0%');
  });

  it('is empty for non-numbers', () => {
    expect(formatPercent(NaN)).toBe('');
    expect(formatPercent(Infinity)).toBe('');
  });
});

describe('formatChange', () => {
  it('reads like the analytics sub line', () => {
    expect(formatChange(0.12)).toBe('Up 12%');
    expect(formatChange(-0.03)).toBe('Down 3%');
    expect(formatChange(0)).toBe('No change');
    expect(formatChange(2.5)).toBe('Up 250%');
    expect(formatChange(-1)).toBe('Down 100%');
  });

  it('calls anything that rounds to 0% no change', () => {
    expect(formatChange(0.004)).toBe('No change');
    expect(formatChange(-0.004)).toBe('No change');
    expect(formatChange(0.005)).toBe('Up 1%');
  });

  it('is empty when there is nothing to compare against', () => {
    expect(formatChange(null)).toBe('');
    expect(formatChange(undefined)).toBe('');
    expect(formatChange(Infinity)).toBe('');
    expect(formatChange(NaN)).toBe('');
  });

  it('changeDirection agrees with the text', () => {
    expect(changeDirection(0.12)).toBe('up');
    expect(changeDirection(-0.03)).toBe('down');
    expect(changeDirection(0.004)).toBe('flat');
    expect(changeDirection(null)).toBe('flat');
    expect(changeDirection(Infinity)).toBe('flat');
  });
});

describe('plural and countLabel', () => {
  it('only one is singular', () => {
    expect(plural(1, 'time', 'times')).toBe('time');
    expect(plural(-1, 'time', 'times')).toBe('time');
    expect(plural(0, 'time', 'times')).toBe('times');
    expect(plural(2, 'time', 'times')).toBe('times');
    expect(plural(1.5, 'hour', 'hours')).toBe('hours');
  });

  it('counts with grouping', () => {
    expect(countLabel(3, 'time', 'times')).toBe('3 times');
    expect(countLabel(1, 'time', 'times')).toBe('1 time');
    expect(countLabel(0, 'post', 'posts')).toBe('0 posts');
    expect(countLabel(1204, 'click', 'clicks')).toBe('1,204 clicks');
  });
});

describe('formatDurationMs', () => {
  it('shows seconds with two decimals, like the loader sliders', () => {
    expect(formatDurationMs(1600)).toBe('1.60s');
    expect(formatDurationMs(1100)).toBe('1.10s');
    expect(formatDurationMs(300)).toBe('0.30s');
    expect(formatDurationMs(0)).toBe('0.00s');
    expect(formatDurationMs(3000)).toBe('3.00s');
    expect(formatDurationMs(1005)).toBe('1.01s');
  });

  it('is empty for non-numbers', () => {
    expect(formatDurationMs(NaN)).toBe('');
  });
});

describe('formatElapsed', () => {
  it('reads like a stopwatch', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(7_000)).toBe('0:07');
    expect(formatElapsed(7_999)).toBe('0:07');
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(120_000)).toBe('2:00');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
  });

  it('never goes negative', () => {
    expect(formatElapsed(-5)).toBe('0:00');
    expect(formatElapsed(NaN)).toBe('0:00');
  });
});

describe('formatBytes', () => {
  it('uses decimal units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1000)).toBe('1 KB');
    expect(formatBytes(8_400)).toBe('8.4 KB');
    expect(formatBytes(84_000)).toBe('84 KB');
    expect(formatBytes(1_200_000)).toBe('1.2 MB');
    expect(formatBytes(12_000_000)).toBe('12 MB');
    expect(formatBytes(1_500_000_000)).toBe('1.5 GB');
  });

  it('rolls over instead of showing 1000 KB', () => {
    expect(formatBytes(999_960)).toBe('1 MB');
    expect(formatBytes(9_960)).toBe('10 KB');
  });

  it('is empty for missing, negative or invalid sizes', () => {
    expect(formatBytes(null)).toBe('');
    expect(formatBytes(undefined)).toBe('');
    expect(formatBytes(-1)).toBe('');
    expect(formatBytes(NaN)).toBe('');
  });
});

describe('formatPhone', () => {
  it('formats North American numbers', () => {
    expect(formatPhone('+19055550142')).toBe('(905) 555-0142');
    expect(formatPhone('9055550142')).toBe('(905) 555-0142');
    expect(formatPhone('19055550142')).toBe('(905) 555-0142');
    expect(formatPhone('905-555-0142')).toBe('(905) 555-0142');
    expect(formatPhone('+1 (613) 555-0199')).toBe('(613) 555-0199');
    expect(formatPhone('1.416.555.0100')).toBe('(416) 555-0100');
    expect(formatPhone('  (905) 555-0142  ')).toBe('(905) 555-0142');
  });

  it('returns anything else as given', () => {
    expect(formatPhone('+447700900123')).toBe('+447700900123');
    expect(formatPhone('+33 1 23 45 67 89')).toBe('+33 1 23 45 67 89');
    expect(formatPhone('+9055550142')).toBe('+9055550142');
    expect(formatPhone('555-0142')).toBe('555-0142');
    expect(formatPhone('905-555-0142 ext 12')).toBe('905-555-0142 ext 12');
    expect(formatPhone('0455550142')).toBe('0455550142');
    expect(formatPhone('9051550142')).toBe('9051550142');
    expect(formatPhone(' call me ')).toBe('call me');
  });

  it('is empty when there is no number', () => {
    expect(formatPhone(null)).toBe('');
    expect(formatPhone(undefined)).toBe('');
    expect(formatPhone('')).toBe('');
  });
});

describe('initials', () => {
  it('takes the first and last word', () => {
    expect(initials('Anna Park')).toBe('AP');
    expect(initials('Shajeed I.')).toBe('SI');
    expect(initials('maya chen')).toBe('MC');
    expect(initials('Mary Anne de la Cruz')).toBe('MC');
    expect(initials('  Anna   Park  ')).toBe('AP');
  });

  it('uses one letter for one word', () => {
    expect(initials('Maya')).toBe('M');
  });

  it('skips punctuation and symbols', () => {
    expect(initials('Acme Plumbing & Heating')).toBe('AH');
    expect(initials('(Ottawa) Office')).toBe('OO');
    expect(initials('"Dee" Ramos')).toBe('DR');
  });

  it('uses the local part of an email', () => {
    expect(initials('maya.chen@tekmadev.com')).toBe('MC');
    expect(initials('owner@tekmadev.com')).toBe('O');
  });

  it('keeps accented and non-Latin letters', () => {
    expect(initials('Émile Ouellet')).toBe('ÉO');
    expect(initials('Zoë')).toBe('Z');
  });

  it('is empty when there is nothing to use', () => {
    expect(initials('')).toBe('');
    expect(initials('   ')).toBe('');
    expect(initials('&')).toBe('');
    expect(initials(null)).toBe('');
    expect(initials(undefined)).toBe('');
  });
});

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('Short', 10)).toBe('Short');
    expect(truncate('Exactly10!', 10)).toBe('Exactly10!');
  });

  it('cuts long text with an ellipsis within the limit', () => {
    expect(truncate('Hamilton and Ottawa', 10)).toBe('Hamilton…');
    expect(truncate('abcdefghijkl', 5)).toBe('abcd…');
    expect(Array.from(truncate('abcdefghijkl', 5))).toHaveLength(5);
  });

  it('does not leave a space before the ellipsis', () => {
    expect(truncate('Acme Plumbing', 6)).toBe('Acme…');
  });

  it('never splits an emoji', () => {
    expect(truncate('👋👋👋👋', 3)).toBe('👋👋…');
    expect(truncate('👋👋', 2)).toBe('👋👋');
  });

  it('handles tiny limits and missing text', () => {
    expect(truncate('Hello', 1)).toBe('…');
    expect(truncate('Hello', 0)).toBe('');
    expect(truncate('Hello', -3)).toBe('');
    expect(truncate(null, 5)).toBe('');
    expect(truncate(undefined, 5)).toBe('');
  });
});
