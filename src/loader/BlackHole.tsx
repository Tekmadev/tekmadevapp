import type { Transforms3d } from '@shopify/react-native-skia';
import { memo, useEffect, useId } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { makeMutable, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';

import type { LoaderSettings } from '@/api/schemas/session';
import { useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';

import { beatFrame, degToRad, KEY_REST, REDUCED_CYCLE_MS, reducedOpacity } from './keyframes';
import { MarkScene } from './MarkCanvas';
import { bleedFor, MARK_RADIUS } from './pose';
import { useLoaderStore } from './settings';

export type BlackHoleProps = {
  /** Rendered size in dp (the 2400 unit viewBox is scaled to this). */
  size: number;
  /** Fill colour; defaults to the theme gold. */
  color?: string;
  /** One beat in ms; defaults to the page loader `beatMs` setting. */
  beatMs?: number;
  /** Pause the beat (e.g. offscreen). It finishes the current beat into the whole logo first. Default false. */
  paused?: boolean;
  style?: StyleProp<ViewStyle>;
  /** When set, the loader is announced as a progress bar with this label; otherwise it is hidden from TalkBack. */
  accessibilityLabel?: string;
};

/** Just enough canvas bleed for the outer arc tips while they spin. */
const BEAT_BLEED = bleedFor(MARK_RADIUS);

/** The whole logo at the start of a beat (p = 0). */
const START: Transforms3d = [{ rotate: 0 }, { scale: 1 }];

/* ------------------------------------------------------------------ */
/* Live settings on the UI thread                                      */
/* ------------------------------------------------------------------ */

/**
 * The settings every mark reads each frame: the saved ones, or the Loader
 * screen's live preview while the owner drags a slider. One shared value for
 * the whole app, fed by the store, so a slider step reaches every running mark
 * on the next frame with no React render.
 */
function storeSettings(): LoaderSettings {
  const state = useLoaderStore.getState();
  return state.previewing ?? state.settings;
}
let pushedSettings = storeSettings();
const liveSettings = makeMutable<LoaderSettings>(pushedSettings);
useLoaderStore.subscribe((state) => {
  const next = state.previewing ?? state.settings;
  if (next === pushedSettings) return;
  pushedSettings = next;
  liveSettings.set(next);
});

/* ------------------------------------------------------------------ */
/* One beat loop for every mark                                        */
/* ------------------------------------------------------------------ */

/**
 * A mark's state on the UI thread. It lives in the loop, not in shared values:
 * only the four Skia props are shared values, written when the pose changes.
 */
type Mark = {
  /** Raw beat position, 0 to 1. */
  phase: number;
  /** The progress the Skia props show now (NaN forces the next draw). */
  shown: number;
  /** The props hold the reduced motion pose (still logo) rather than a beat pose. */
  reducedShown: boolean;
  /** Just registered: its first frame does not advance, like a frame callback's first frame. */
  fresh: boolean;
  /** Beat length in ms; 0 follows the live `beatMs`. */
  period: number;
  paused: boolean;
  reduced: boolean;
  outer: SharedValue<Transforms3d>;
  inner: SharedValue<Transforms3d>;
  innerOpacity: SharedValue<number>;
  opacity: SharedValue<number>;
};

type BeatLoop = {
  marks: Map<string, Mark>;
  /** Marks that still need frames: running, finishing a beat before a pause, or due one redraw. */
  active: Set<string>;
  running: boolean;
  /** Timestamp of the previous frame; -1 when the loop is (re)starting. */
  last: number;
  wake: () => void;
};

/** Per module load, so a Fast Refresh starts a fresh loop with the new code. */
const LOOP_KEY = `__tekmadevBeatLoop_${Math.random().toString(36).slice(2)}`;

/** Writes the Skia props for progress `q`, only when the pose actually changes. */
function draw(m: Mark, q: number, s: LoaderSettings) {
  'worklet';
  if (m.reduced) {
    if (!m.reducedShown) {
      m.reducedShown = true;
      m.outer.set([]);
      m.inner.set([]);
      m.innerOpacity.set(1);
      m.shown = NaN;
    }
    if (q !== m.shown) {
      m.shown = q;
      m.opacity.set(reducedOpacity(q));
    }
    return;
  }
  if (m.reducedShown) {
    m.reducedShown = false;
    m.opacity.set(1);
    m.shown = NaN;
  }
  // During the rest (and while held) the pose is the same whole logo: no writes, no redraw.
  if (q === m.shown) return;
  m.shown = q;
  const f = beatFrame(q, s);
  m.outer.set([{ rotate: degToRad(f.outerRotate) }, { scale: f.outerScale }]);
  m.inner.set([{ rotate: degToRad(f.innerRotate) }, { scale: f.innerScale }]);
  m.innerOpacity.set(f.innerOpacity);
}

/**
 * Advances one mark by `elapsed` ms and draws it. Returns false once it is
 * still (paused at the whole logo), so the loop stops visiting it.
 */
function step(m: Mark, elapsed: number, s: LoaderSettings): boolean {
  'worklet';
  const dt = m.fresh ? 0 : elapsed;
  m.fresh = false;
  const reduced = m.reduced;
  const cycle = reduced ? REDUCED_CYCLE_MS : Math.max(m.period > 0 ? m.period : s.beatMs, 1);
  const p = m.phase;
  let next = p + dt / cycle;
  let moving = true;
  if (m.paused) {
    // Finish the beat (or the fade) into the whole logo, then hold still.
    if (reduced) {
      if (p === 0 || next >= 1) {
        next = 0;
        moving = false;
      }
    } else if (p === 0 || p >= KEY_REST) {
      next = p;
      moving = false;
    } else if (next >= KEY_REST) {
      next = KEY_REST;
      moving = false;
    }
  } else if (next >= 1) {
    next -= Math.floor(next);
  }
  m.phase = next;
  draw(m, reduced ? next : Math.min(next, KEY_REST), s);
  return moving;
}

/** The loop on the UI runtime, made on first use. One requestAnimationFrame chain serves every mark. */
function getLoop(): BeatLoop {
  'worklet';
  const g = globalThis as unknown as Record<string, BeatLoop | undefined>;
  const existing = g[LOOP_KEY];
  if (existing) return existing;

  const loop: BeatLoop = { marks: new Map(), active: new Set(), running: false, last: -1, wake: () => undefined };
  const frame = (timestamp: number) => {
    const elapsed = loop.last < 0 ? 0 : timestamp - loop.last;
    loop.last = timestamp;
    const s = liveSettings.get();
    loop.active.forEach((id) => {
      const m = loop.marks.get(id);
      if (!m || !step(m, elapsed, s)) loop.active.delete(id);
    });
    if (loop.active.size > 0) {
      requestAnimationFrame(frame);
    } else {
      // Nothing moves: no frame work at all until a mark wakes the loop again.
      loop.running = false;
      loop.last = -1;
    }
  };
  loop.wake = () => {
    if (loop.running || loop.active.size === 0) return;
    loop.running = true;
    loop.last = -1;
    requestAnimationFrame(frame);
  };
  g[LOOP_KEY] = loop;
  return loop;
}

function registerMark(
  id: string,
  outer: SharedValue<Transforms3d>,
  inner: SharedValue<Transforms3d>,
  innerOpacity: SharedValue<number>,
  opacity: SharedValue<number>,
) {
  'worklet';
  const loop = getLoop();
  if (loop.marks.has(id)) return;
  // Starts held at the whole logo (the props' initial values); configureMark sets it going.
  loop.marks.set(id, {
    phase: 0,
    shown: 0,
    reducedShown: false,
    fresh: true,
    period: 0,
    paused: true,
    reduced: false,
    outer,
    inner,
    innerOpacity,
    opacity,
  });
}

function configureMark(id: string, period: number, paused: boolean, reduced: boolean) {
  'worklet';
  const loop = getLoop();
  const m = loop.marks.get(id);
  if (!m) return;
  m.period = period;
  m.paused = paused;
  if (m.reduced !== reduced) {
    // A new mode starts its own cycle from the whole logo.
    m.reduced = reduced;
    m.phase = 0;
    m.shown = NaN;
  }
  // One visit at least: a held mark draws once if it must, then drops out.
  loop.active.add(id);
  loop.wake();
}

function unregisterMark(id: string) {
  'worklet';
  const loop = getLoop();
  loop.marks.delete(id);
  loop.active.delete(id);
}

/**
 * The Tekmadev black hole (brief section 5). The inner hooks spin a full turn
 * clockwise while the outer arcs spin half a turn counterclockwise, everything
 * pulled toward the centre at the peak, then released into the logo to rest.
 *
 * Every mark in the app shares one UI-thread loop (a single
 * requestAnimationFrame chain) that runs only while some mark moves. Each frame
 * it advances each moving mark's own beat (its own period and start) and writes
 * the four Skia props directly: no frame callback per mark, no derived values,
 * no JS work and no React render per frame. A mark at rest in its beat, or
 * paused at the whole logo, writes nothing, so its canvas does not redraw.
 * Settings come from one shared value: dragging a Loader slider changes the
 * beat on the next frame, mid beat, with no restart.
 *
 * Reduced motion: no rotation or scale; all four paths fade 1, 0.4, 1 over 1.6s.
 */
export const BlackHole = memo(function BlackHole({
  size,
  color,
  beatMs,
  paused = false,
  style,
  accessibilityLabel,
}: BlackHoleProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const id = useId();

  const outer = useSharedValue<Transforms3d>(START);
  const inner = useSharedValue<Transforms3d>(START);
  const innerOpacity = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scheduleOnUI(registerMark, id, outer, inner, innerOpacity, opacity);
    return () => scheduleOnUI(unregisterMark, id);
  }, [id, outer, inner, innerOpacity, opacity]);

  // Runs after the registration above (same UI queue, in order).
  const period = beatMs ?? 0;
  useEffect(() => {
    scheduleOnUI(configureMark, id, period, paused, reduceMotion);
  }, [id, period, paused, reduceMotion]);

  const a11y = accessibilityLabel
    ? ({ accessible: true, accessibilityRole: 'progressbar', accessibilityLabel } as const)
    : ({ accessible: false, importantForAccessibility: 'no-hide-descendants' } as const);

  return (
    <View style={[{ width: size, height: size }, style]} {...a11y}>
      <MarkScene
        size={size}
        bleed={BEAT_BLEED}
        color={color ?? colors.gold}
        outerA={outer}
        inner={inner}
        innerOpacity={innerOpacity}
        opacity={opacity}
      />
    </View>
  );
});
