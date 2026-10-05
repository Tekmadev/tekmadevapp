import { Canvas, Image as SkiaImage, makeImageFromView, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { fade, useReduceMotion } from '@/design/motion';
import { usePrefs, type ThemePreference } from '@/lib/prefs';
import { useLatestCallback } from '@/lib/useLatestCallback';

/** The old theme fades out over the new one. A little longer than a colour change: the whole screen moves. */
const CROSS_FADE_MS = 320;
/** A snapshot slower than this is not worth the wait: switch at once. */
const SNAPSHOT_TIMEOUT_MS = 600;
/** Frames to wait so the snapshot is on screen before the theme changes under it. */
const COVER_FRAMES = 2;

type Cover = { next: ThemePreference; phase: 'cover' | 'switched' };

function afterFrames(count: number, run: () => void): () => void {
  let id = 0;
  const step = (left: number) => {
    id = requestAnimationFrame(() => (left <= 1 ? run() : step(left - 1)));
  };
  step(count);
  return () => cancelAnimationFrame(id);
}

/** A picture of the view, or null when it fails or takes too long (a late picture is freed at once). */
function capture(ref: RefObject<View | null>, ms: number): Promise<SkImage | null> {
  return new Promise((resolve) => {
    let late = false;
    const timer = setTimeout(() => {
      late = true;
      resolve(null);
    }, ms);
    makeImageFromView(ref).then(
      (shot) => {
        clearTimeout(timer);
        if (late) shot?.dispose();
        else resolve(shot);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/**
 * The animated cross-fade between themes (brief 8.18). The screen is captured
 * as a picture (Skia `makeImageFromView`), the picture covers the screen, the
 * theme switches underneath, then the picture fades away. With reduced motion,
 * or if the capture fails or is slow, the theme simply switches.
 *
 *   const shot = useRef<View>(null);
 *   const theme = useThemeCrossFade(shot);
 *   <View ref={shot} collapsable={false} onLayout={theme.onLayout} style={{ flex: 1 }}>
 *     ...screen...
 *     {theme.overlay}
 *   </View>
 *   <SegmentedControl value={pref} onChange={theme.change} />
 */
export function useThemeCrossFade(ref: RefObject<View | null>): {
  onLayout: (e: LayoutChangeEvent) => void;
  change: (next: ThemePreference) => void;
  overlay: ReactNode;
} {
  const setTheme = usePrefs((s) => s.setTheme);
  const reduceMotion = useReduceMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [cover, setCover] = useState<Cover | null>(null);
  const [image, setImage] = useState<SkImage | null>(null);
  const capturing = useRef(false);
  const opacity = useSharedValue(1);

  // Stable, because a worklet calls it when the fade ends.
  const finish = useLatestCallback(() => {
    setCover(null);
    setImage(null);
    capturing.current = false;
  });

  // The picture's memory is freed once the overlay is gone (or the screen closes), never while it still draws.
  useEffect(() => {
    if (!image) return undefined;
    return () => {
      setTimeout(() => image.dispose(), 250);
    };
  }, [image]);

  const change = (next: ThemePreference) => {
    if (next === usePrefs.getState().theme || capturing.current) return;
    if (reduceMotion || size.width === 0) {
      setTheme(next);
      return;
    }
    capturing.current = true;
    void capture(ref, SNAPSHOT_TIMEOUT_MS).then((shot) => {
      if (!shot) {
        capturing.current = false;
        setTheme(next);
        return;
      }
      opacity.set(1);
      setImage(shot);
      setCover({ next, phase: 'cover' });
    });
  };

  // 1. The picture is up: once it has been drawn, switch the theme under it.
  useEffect(() => {
    if (!cover || cover.phase !== 'cover') return undefined;
    return afterFrames(COVER_FRAMES, () => {
      setTheme(cover.next);
      setCover({ ...cover, phase: 'switched' });
    });
  }, [cover, setTheme]);

  // 2. The new theme has rendered (same commit as phase "switched"): fade the picture away.
  useEffect(() => {
    if (!cover || cover.phase !== 'switched') return undefined;
    return afterFrames(1, () => {
      opacity.set(
        withTiming(0, fade(CROSS_FADE_MS), (finished) => {
          'worklet';
          if (finished) scheduleOnRN(finish);
        }),
      );
    });
  }, [cover, opacity, finish]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  const overlay = cover && image ? (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Canvas style={StyleSheet.absoluteFill} androidWarmup>
        <SkiaImage image={image} x={0} y={0} width={size.width} height={size.height} fit="fill" />
      </Canvas>
    </Animated.View>
  ) : null;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  };

  return { onLayout, change, overlay };
}
