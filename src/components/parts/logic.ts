/**
 * Pure helpers behind the component kit. No React Native imports here, so the
 * rules (badge caps, pull resistance, count-up frames, copy) are unit tested
 * without a device.
 */

import { cubicBezier } from '@/loader/keyframes';
import { formatDateTime, formatTime, todayToronto, toDate, torontoDateOf } from '@/lib/dates';

/* ---------- badges and labels ---------- */

/** Unread count on the Inbox tab: nothing at 0, "99+" above 99. */
export function badgeCountLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '';
  if (count > 99) return '99+';
  return String(Math.floor(count));
}

/** TalkBack label for a tab: "Inbox, 4 unread". */
export function tabAccessibilityLabel(title: string, unread = 0): string {
  const label = badgeCountLabel(unread);
  return label ? `${title}, ${label} unread` : title;
}

/** "Needs action (3)"; the count is optional. */
export function chipLabel(label: string, count?: number | null): string {
  return count == null || !Number.isFinite(count) ? label : `${label} (${count})`;
}

/* ---------- pull to refresh ---------- */

/** The distance (dp) at which the logo locks together and a release refreshes. */
export const PULL_TRIGGER = 72;
/** Content never travels further than this, however far the finger goes. */
export const PULL_MAX = 150;
const PULL_SOFTNESS = 200;

/**
 * Finger travel to content travel. Android has no overscroll bounce, so the
 * resistance is ours: close to 3:4 at first, then it stiffens and never passes
 * PULL_MAX. Tuned so the trigger (72dp) needs about 130dp of finger travel.
 */
export function pullDistance(drag: number): number {
  'worklet';
  if (drag <= 0) return 0;
  return PULL_MAX * (1 - Math.exp(-drag / PULL_SOFTNESS));
}

/* ---------- count-up ---------- */

/** Frames per second the count-up is sampled at (the UI thread picks the nearest frame). */
const COUNT_FPS = 60;

/**
 * The strings a count-up shows, sampled ahead of time on the JS thread so any
 * formatter works (Intl money formatting cannot run on the UI thread). The UI
 * thread then only indexes into this array, with no React render per frame.
 * Values follow cubic-bezier(0.2, 0, 0, 1): fast start, gentle landing. The
 * last frame is always exactly `format(to)`.
 */
export function buildCountFrames(
  from: number,
  to: number,
  format: (value: number) => string,
  durationMs: number,
  integer = true,
): string[] {
  const count = Math.min(120, Math.max(2, Math.round((durationMs / 1000) * COUNT_FPS)));
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const eased = cubicBezier(0.2, 0, 0, 1, t);
    const raw = i === count - 1 ? to : from + (to - from) * eased;
    frames.push(format(integer ? Math.round(raw) : raw));
  }
  return frames;
}

/** The widest frame by character count: it sizes the number while it counts, so nothing clips. */
export function longestFrame(frames: readonly string[]): string {
  let longest = '';
  for (const f of frames) if (f.length > longest.length) longest = f;
  return longest;
}

/* ---------- offline ---------- */

/**
 * "Offline · showing what was loaded at 2:41 PM". When the data is from another
 * Toronto day the date is added, so an old time never reads as today.
 */
export function offlineCopy(updatedAt: number | string | Date | null | undefined, now: Date = new Date()): string {
  const date = toDate(updatedAt ?? null);
  if (!date || date.getTime() <= 0) return 'Offline · showing what was loaded earlier';
  const sameDay = torontoDateOf(date) === todayToronto(now);
  return `Offline · showing what was loaded at ${sameDay ? formatTime(date) : formatDateTime(date, now)}`;
}

/* ---------- stages ---------- */

export type StageState = 'done' | 'current' | 'todo';

/** Where each stage sits relative to the current one. An unknown current marks everything to do. */
export function stageStates(values: readonly string[], current: string | null | undefined): StageState[] {
  const at = current == null ? -1 : values.indexOf(current);
  return values.map((_, i) => (at < 0 || i > at ? 'todo' : i === at ? 'current' : 'done'));
}

/* ---------- misc ---------- */

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/** A 0..1 fraction from anything (missing or broken input is 0). */
export function toFraction(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return clamp(value, 0, 1);
}

/** "41%" from 0..100, rounded; never more than 100. */
export function percentLabel(percent: number): string {
  if (!Number.isFinite(percent)) return '0%';
  return `${Math.round(clamp(percent, 0, 100))}%`;
}

/** Visible label of a phone or email link, and the URL it opens. Null when it is not one. */
export function contactUrl(kind: 'phone' | 'email', value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (kind === 'email') return /^\S+@\S+\.\S+$/.test(v) ? `mailto:${v}` : null;
  const digits = v.replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : null;
}
