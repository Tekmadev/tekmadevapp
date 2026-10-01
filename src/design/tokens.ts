/**
 * Design tokens. Colour values are copied exactly from the website.
 * Everything visual in the app reads from here (through useTheme), never from literals.
 */

export type Scheme = 'light' | 'dark';

export type Palette = {
  bg: string;
  bg2: string;
  bg3: string;
  surface: string;
  ink: string;
  ink2: string;
  ink3: string;
  ink4: string;
  ink5: string;
  line: string;
  lineStrong: string;
  lineSoft: string;
  gold: string;
  goldDeep: string;
  goldMid: string;
  goldSoft: string;
  goldTint: string;
  signal: string;
  /** Text and icons drawn on an `ink` background (primary buttons). */
  onInk: string;
  /** Scrim behind sheets and dialogs. */
  scrim: string;
  /** Warm shadow colour for floating elements. */
  shadow: string;
  /** Gold gradient stops for hero numbers and the tab indicator (135deg). */
  goldGradient: readonly [string, string];
};

export const palettes: Record<Scheme, Palette> = {
  light: {
    bg: '#f5f2eb',
    bg2: '#fbf9f4',
    bg3: '#ede9de',
    surface: '#ffffff',
    ink: '#0d0c0a',
    ink2: '#2a2722',
    ink3: '#5a564d',
    ink4: '#8a857a',
    ink5: '#b0aca2',
    line: 'rgba(13,12,10,0.08)',
    lineStrong: 'rgba(13,12,10,0.14)',
    lineSoft: 'rgba(13,12,10,0.05)',
    gold: '#a17a4f',
    goldDeep: '#7a5b3a',
    goldMid: '#b79368',
    goldSoft: '#dcc399',
    goldTint: '#f4ebd6',
    signal: '#b8392c',
    onInk: '#f5f2eb',
    scrim: 'rgba(13,12,10,0.36)',
    shadow: '#3a2a14',
    goldGradient: ['#a17a4f', '#7a5b3a'],
  },
  dark: {
    bg: '#0e0d0b',
    bg2: '#16140f',
    bg3: '#080706',
    surface: '#1a1712',
    ink: '#f4f0e8',
    ink2: '#d6d0c4',
    ink3: '#a39d8f',
    ink4: '#78736a',
    ink5: '#56524b',
    line: 'rgba(244,240,232,0.10)',
    lineStrong: 'rgba(244,240,232,0.16)',
    lineSoft: 'rgba(244,240,232,0.06)',
    gold: '#c89c65',
    goldDeep: '#a8814f',
    goldMid: '#d7b07a',
    goldSoft: '#e8d1a6',
    goldTint: '#221b10',
    signal: '#d8503f',
    onInk: '#0e0d0b',
    scrim: 'rgba(0,0,0,0.56)',
    shadow: '#000000',
    goldGradient: ['#d7b07a', '#a8814f'],
  },
};

export type Tone = 'neutral' | 'gold' | 'ok' | 'warn' | 'muted' | 'signal';
export const TONES: readonly Tone[] = ['neutral', 'gold', 'ok', 'warn', 'muted', 'signal'];

export type ToneColors = { text: string; bg: string; dot: string };

/** Status tones: a tinted background and a text colour, per scheme. */
export function toneColors(scheme: Scheme, p: Palette): Record<Tone, ToneColors> {
  const dark = scheme === 'dark';
  return {
    neutral: { text: p.ink2, bg: p.bg3, dot: p.ink3 },
    gold: { text: dark ? p.goldMid : p.goldDeep, bg: withAlpha(p.gold, 0.15), dot: p.gold },
    ok: { text: dark ? '#6ee7b7' : '#047857', bg: withAlpha('#10b981', 0.15), dot: '#10b981' },
    warn: { text: dark ? '#fcd34d' : '#b45309', bg: withAlpha('#f59e0b', 0.15), dot: '#f59e0b' },
    muted: { text: p.ink4, bg: p.lineSoft, dot: p.ink4 },
    signal: { text: p.signal, bg: withAlpha(p.signal, 0.1), dot: p.signal },
  };
}

/** `#rrggbb` + alpha (0..1) to `rgba()`. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 4pt grid. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const layout = {
  gutter: 16,
  sectionGap: 28,
  minTouch: 48,
  tabBarHeight: 64,
  tabBarBottomGap: 12,
  headerHeight: 56,
} as const;

export const radius = {
  pill: 999,
  card: 20,
  sheet: 28,
  input: 14,
  sm: 10,
  xs: 6,
} as const;
