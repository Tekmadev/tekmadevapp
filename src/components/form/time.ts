/**
 * Clock time helpers for DateTimeField. A ClockTime is a Toronto wall-clock time
 * (24 hour); it only becomes an instant through torontoWallTimeToInstant().
 */

export type ClockTime = { hour: number; minute: number };

export type Meridiem = 'am' | 'pm';

/** 0..23 to the 12 hour clock: 0 is 12 AM, 13 is 1 PM. */
export function to12h(hour: number): { hour12: number; meridiem: Meridiem } {
  const h = ((hour % 24) + 24) % 24;
  return { hour12: h % 12 === 0 ? 12 : h % 12, meridiem: h < 12 ? 'am' : 'pm' };
}

export function from12h(hour12: number, meridiem: Meridiem): number {
  const base = hour12 % 12;
  return meridiem === 'pm' ? base + 12 : base;
}

/** "2:41 PM" */
export function formatClockTime(t: ClockTime): string {
  const { hour12, meridiem } = to12h(t.hour);
  return `${hour12}:${String(t.minute).padStart(2, '0')} ${meridiem === 'am' ? 'AM' : 'PM'}`;
}

/**
 * Parse a typed time. Accepts "2:41 PM", "2:41pm", "2.41 p.m.", "2pm", "14:41",
 * "14h30", "1441", "noon" and "midnight". Without AM/PM, an hour from 1 to 12
 * keeps the meridiem the picker already shows (so "2:30" with PM selected is
 * 2:30 PM); 0 and 13 to 23 are read as a 24 hour clock. Returns null when the
 * text is not a real time.
 */
export function parseTimeInput(text: string, fallback: Meridiem = 'am'): ClockTime | null {
  let s = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  if (s === 'noon') return { hour: 12, minute: 0 };
  if (s === 'midnight') return { hour: 0, minute: 0 };

  let meridiem: Meridiem | null = null;
  const suffix = /\s*([ap])\.?\s*m?\.?$/.exec(s);
  if (suffix) {
    meridiem = suffix[1] === 'a' ? 'am' : 'pm';
    s = s.slice(0, suffix.index).trim();
  }

  let hour: number;
  let minute: number;
  const separated = /^(\d{1,2})\s*[:.h]\s*(\d{2})?$/.exec(s);
  if (separated) {
    hour = Number(separated[1]);
    minute = separated[2] == null ? 0 : Number(separated[2]);
  } else if (/^\d{1,4}$/.test(s)) {
    if (s.length <= 2) {
      hour = Number(s);
      minute = 0;
    } else {
      hour = Number(s.slice(0, s.length - 2));
      minute = Number(s.slice(-2));
    }
  } else {
    return null;
  }

  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    return { hour: from12h(hour, meridiem), minute };
  }
  if (hour > 23) return null;
  if (hour >= 1 && hour <= 12) return { hour: from12h(hour, fallback), minute };
  return { hour, minute };
}

/** The quick minute choices; anything else is typed with "Other time". */
export const QUICK_MINUTES = [0, 15, 30, 45] as const;
