import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image, type ImageLoadEventData } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { ExternalLink, ImageOff, RotateCw, X, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { errorMessage } from '@/api/errors';
import type { Asset } from '@/api/schemas/clients';
import { useAppLock } from '@/auth/lock/lockStore';
import { PrivacyCover } from '@/auth/lock/PrivacyCover';
import { openInBrowser } from '@/components/automation';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptics } from '@/design/haptics';
import { durations, springs, useReduceMotion } from '@/design/motion';
import { themeFor } from '@/design/theme';
import { layout, radius, space, withAlpha } from '@/design/tokens';
import { BlackHole } from '@/loader/BlackHole';
import { formatBytes } from '@/lib/format';
import { notice } from '@/lib/notice';
import { usePrefs } from '@/lib/prefs';

import { isExpired, signedAssetQuery } from './assetSigning';
import {
  MAX_SCALE,
  MIN_SCALE,
  ZOOMED_EPSILON,
  backdropOpacity,
  clamp,
  doubleTapTarget,
  fitSize,
  maxOffset,
  pinchTranslate,
  resistScale,
  shouldDismiss,
} from './zoomMath';

/** The viewer is always dark, whatever the app theme: photos read best on near black. */
const dark = themeFor('dark').colors;
/** Long enough for the light status bar style to reach the activity before the dialog copies it. */
const ARM_DELAY_MS = 60;
/** Decoding a bitmap larger than this at full size costs too much memory; bigger ones are downscaled to the screen. */
const FULL_RES_MAX_PIXELS = 8_000_000;

export type ImageViewerProps = {
  clientId: string;
  /** The image being shown (kept while the viewer fades out). */
  asset: Asset | null;
  /** Each opening gets a new session, which resets zoom and pan. */
  session: number;
  open: boolean;
  /** "Photo · 2.5 MB". */
  subtitle: string;
  onClose: () => void;
};

/**
 * Full-screen image viewer: pinch to zoom (to 4x) and pan at the same time,
 * double tap to zoom in on a point or back out, swipe down to close, tap to
 * hide the top bar. An expired signed URL is re-signed before loading; the
 * thumbnail shows while the full image loads.
 *
 * It is a Modal (its own window, which copies FLAG_SECURE from the activity),
 * because the Client detail sections live inside a scroll view. On iOS a Modal
 * is a view controller above the app's own view, where the app lock and the app
 * switcher cover are drawn: so there it hides while the app is locked (and comes
 * back after the unlock), and draws the app switcher cover inside itself.
 */
export function ImageViewer({ clientId, asset, session, open, subtitle, onClose }: ImageViewerProps) {
  const reduceMotion = useReduceMotion();
  // The dialog copies the activity's status bar style when it appears, so the light
  // style is applied first and the Modal shows a moment later.
  const [armedFor, setArmedFor] = useState<number | null>(null);
  useEffect(() => {
    if (!open || armedFor === session) return undefined;
    const timer = setTimeout(() => setArmedFor(session), ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open, session, armedFor]);

  // iOS: the lock is drawn under any Modal, so the viewer steps aside while it is up.
  const lockedOnIos = useAppLock((s) => Platform.OS === 'ios' && s.locked === true);
  const coverOnIos = usePrefs((s) => Platform.OS === 'ios' && s.hideInRecents);

  if (!asset) return null;
  const visible = open && armedFor === session && !lockedOnIos;

  return (
    <>
      {open && !lockedOnIos ? <StatusBar style="light" /> : null}
      <Modal
        visible={visible}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={onClose}
      >
        <GestureHandlerRootView style={styles.fill}>
          <ViewerContent key={`${asset.id}:${session}`} clientId={clientId} asset={asset} subtitle={subtitle} onClose={onClose} />
          {coverOnIos ? <PrivacyCover /> : null}
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}

type ContentProps = { clientId: string; asset: Asset; subtitle: string; onClose: () => void };

function ViewerContent({ clientId, asset, subtitle, onClose }: ContentProps) {
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const queryClient = useQueryClient();
  const reduceMotion = useReduceMotion();

  // A signed URL past its expiry is replaced first; the cached bundle then carries the fresh one.
  const expired = isExpired(asset.expiresAt);
  const sign = useQuery({ ...signedAssetQuery(queryClient, clientId, asset.id), enabled: expired });
  const url = expired ? (sign.data?.url ?? null) : asset.url;
  const thumbUrl = expired ? (sign.data?.thumbnailUrl ?? null) : asset.thumbnailUrl;

  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [chrome, setChrome] = useState(true);

  // Gesture state (UI thread).
  const boxW = useSharedValue(screen.width);
  const boxH = useSharedValue(screen.height);
  const imgW = useSharedValue(asset.width ?? 0);
  const imgH = useSharedValue(asset.height ?? 0);
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const pinching = useSharedValue(false);
  const settledByPinch = useSharedValue(false);
  const s0 = useSharedValue(1);
  const t0x = useSharedValue(0);
  const t0y = useSharedValue(0);
  const f0x = useSharedValue(0);
  const f0y = useSharedValue(0);
  const lastFx = useSharedValue(0);
  const lastFy = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    boxW.set(e.nativeEvent.layout.width);
    boxH.set(e.nativeEvent.layout.height);
  };

  const onLoad = (e: ImageLoadEventData) => {
    if (!imgW.get() || !imgH.get()) {
      imgW.set(e.source.width);
      imgH.set(e.source.height);
    }
    setLoaded(true);
    setFailed(false);
  };

  const close = () => onClose();

  /** Spring back inside the limits after a pinch, keeping the point under the fingers steady. */
  const settle = () => {
    'worklet';
    const s = scale.get();
    const target = clamp(s, MIN_SCALE, MAX_SCALE);
    if (target <= MIN_SCALE + ZOOMED_EPSILON) {
      scale.set(withSpring(MIN_SCALE, springs.default));
      tx.set(withSpring(0, springs.default));
      ty.set(withSpring(0, springs.default));
      return;
    }
    const fit = fitSize(boxW.get(), boxH.get(), imgW.get(), imgH.get());
    const x = target === s ? tx.get() : pinchTranslate(lastFx.get(), lastFx.get(), tx.get(), s, target);
    const y = target === s ? ty.get() : pinchTranslate(lastFy.get(), lastFy.get(), ty.get(), s, target);
    const mx = maxOffset(fit.width, boxW.get(), target);
    const my = maxOffset(fit.height, boxH.get(), target);
    scale.set(withSpring(target, springs.default));
    tx.set(withSpring(clamp(x, -mx, mx), springs.default));
    ty.set(withSpring(clamp(y, -my, my), springs.default));
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      'worklet';
      cancelAnimation(scale);
      cancelAnimation(tx);
      cancelAnimation(ty);
      pinching.set(true);
      s0.set(scale.get());
      t0x.set(tx.get());
      t0y.set(ty.get());
      f0x.set(e.focalX - boxW.get() / 2);
      f0y.set(e.focalY - boxH.get() / 2);
      lastFx.set(f0x.get());
      lastFy.set(f0y.get());
    })
    .onUpdate((e) => {
      'worklet';
      const next = resistScale(s0.get() * e.scale);
      const fx = e.focalX - boxW.get() / 2;
      const fy = e.focalY - boxH.get() / 2;
      lastFx.set(fx);
      lastFy.set(fy);
      scale.set(next);
      tx.set(pinchTranslate(f0x.get(), fx, t0x.get(), s0.get(), next));
      ty.set(pinchTranslate(f0y.get(), fy, t0y.get(), s0.get(), next));
    })
    .onEnd(() => {
      'worklet';
      settledByPinch.set(true);
      settle();
    })
    .onFinalize(() => {
      'worklet';
      pinching.set(false);
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      'worklet';
      settledByPinch.set(false);
      if (!pinching.get()) {
        cancelAnimation(tx);
        cancelAnimation(ty);
      }
    })
    .onChange((e) => {
      'worklet';
      if (pinching.get()) return;
      settledByPinch.set(false);
      const s = scale.get();
      if (s <= MIN_SCALE + ZOOMED_EPSILON) {
        // Not zoomed: the image follows the finger, and a swipe down closes.
        tx.set(tx.get() + e.changeX * 0.5);
        ty.set(ty.get() + e.changeY);
        return;
      }
      const fit = fitSize(boxW.get(), boxH.get(), imgW.get(), imgH.get());
      const mx = maxOffset(fit.width, boxW.get(), s);
      const my = maxOffset(fit.height, boxH.get(), s);
      const nx = tx.get() + e.changeX;
      const ny = ty.get() + e.changeY;
      // Past an edge the image resists instead of sliding away.
      tx.set(Math.abs(nx) > mx ? tx.get() + e.changeX * 0.35 : nx);
      ty.set(Math.abs(ny) > my ? ty.get() + e.changeY * 0.35 : ny);
    })
    .onEnd((e) => {
      'worklet';
      if (pinching.get() || settledByPinch.get()) return;
      const s = scale.get();
      if (s <= MIN_SCALE + ZOOMED_EPSILON) {
        if (shouldDismiss(ty.get(), e.velocityY, boxH.get())) {
          ty.set(
            withTiming(boxH.get(), { duration: durations.fast }, (finished) => {
              if (finished) scheduleOnRN(close);
            }),
          );
          return;
        }
        tx.set(withSpring(0, springs.snappy));
        ty.set(withSpring(0, springs.snappy));
        return;
      }
      const fit = fitSize(boxW.get(), boxH.get(), imgW.get(), imgH.get());
      const mx = maxOffset(fit.width, boxW.get(), s);
      const my = maxOffset(fit.height, boxH.get(), s);
      tx.set(mx > 0 ? withDecay({ velocity: e.velocityX, clamp: [-mx, mx], rubberBandEffect: true }) : withSpring(0, springs.default));
      ty.set(my > 0 ? withDecay({ velocity: e.velocityY, clamp: [-my, my], rubberBandEffect: true }) : withSpring(0, springs.default));
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(260)
    .maxDistance(24)
    .onEnd((e, success) => {
      'worklet';
      if (!success) return;
      const box = { width: boxW.get(), height: boxH.get() };
      const target = doubleTapTarget(
        { x: e.x - box.width / 2, y: e.y - box.height / 2 },
        { x: tx.get(), y: ty.get() },
        scale.get(),
        fitSize(box.width, box.height, imgW.get(), imgH.get()),
        box,
      );
      scale.set(withSpring(target.scale, springs.default));
      tx.set(withSpring(target.x, springs.default));
      ty.set(withSpring(target.y, springs.default));
    });

  const toggleChrome = () => setChrome((c) => !c);
  const singleTap = Gesture.Tap()
    .maxDistance(12)
    .onEnd((_e, success) => {
      'worklet';
      if (success) scheduleOnRN(toggleChrome);
    });

  const gesture = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: scale.get() <= MIN_SCALE + ZOOMED_EPSILON ? backdropOpacity(ty.get(), boxH.get()) : 1,
  }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: scale.get() <= MIN_SCALE + ZOOMED_EPSILON ? 1 - clamp(Math.abs(ty.get()) / 120, 0, 1) : 1,
  }));

  // TalkBack: zoom without a pinch.
  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'zoomIn') {
      scale.set(withSpring(2, springs.default));
    } else if (e.nativeEvent.actionName === 'zoomOut') {
      scale.set(withSpring(MIN_SCALE, springs.default));
      tx.set(withSpring(0, springs.default));
      ty.set(withSpring(0, springs.default));
    }
  };

  const retry = () => {
    haptics.light();
    setFailed(false);
    setLoaded(false);
    if (sign.isError) void sign.refetch();
    setAttempt((n) => n + 1);
  };

  const openOutside = () => {
    if (url) openInBrowser(url, dark);
    else notice.err('This file is not ready yet. Try again in a moment.');
  };

  const fullRes = asset.width != null && asset.height != null && asset.width * asset.height <= FULL_RES_MAX_PIXELS;
  const signFailed = expired && sign.isError;
  const showError = failed || signFailed;
  const showLoader = !loaded && !showError;

  return (
    <View style={styles.fill} onLayout={onLayout} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: dark.bg3 }, backdropStyle]} />

      <GestureDetector gesture={gesture}>
        <Animated.View style={styles.fill} collapsable={false}>
          <Animated.View
            style={[styles.fill, imageStyle]}
            accessible
            accessibilityRole="image"
            accessibilityLabel={asset.fileName}
            accessibilityActions={[
              { name: 'zoomIn', label: 'Zoom in' },
              { name: 'zoomOut', label: 'Zoom out' },
            ]}
            onAccessibilityAction={onAccessibilityAction}
          >
            {url && !showError ? (
              <Image
                key={attempt}
                source={{ uri: url, cacheKey: `asset-${asset.id}` }}
                placeholder={thumbUrl ? { uri: thumbUrl, cacheKey: `asset-thumb-${asset.id}` } : undefined}
                placeholderContentFit="contain"
                contentFit="contain"
                allowDownscaling={!fullRes}
                transition={reduceMotion ? null : durations.fast}
                recyclingKey={asset.id}
                onLoad={onLoad}
                onError={() => setFailed(true)}
                style={styles.fill}
              />
            ) : null}
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {showLoader ? (
        <View pointerEvents="none" style={styles.center}>
          <BlackHole size={36} color={dark.gold} accessibilityLabel="Loading" />
        </View>
      ) : null}

      {showError ? (
        <View style={styles.center} pointerEvents="box-none">
          <View style={styles.errorBox}>
            <Icon icon={ImageOff} size={28} rawColor={dark.ink3} />
            <Text variant="body" align="center" style={{ color: dark.ink2 }}>
              {signFailed ? errorMessage(sign.error) : 'Could not load this image.'}
            </Text>
            <DarkPill icon={RotateCw} label="Try again" onPress={retry} />
          </View>
        </View>
      ) : null}

      {chrome ? (
        <Animated.View
          entering={FadeIn.duration(durations.fast)}
          exiting={FadeOut.duration(durations.fast)}
          style={[styles.topBar, { paddingTop: insets.top + space[2], paddingLeft: insets.left + space[2], paddingRight: insets.right + space[2] }]}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.topRow, chromeStyle]}>
            <DarkIconButton icon={X} label="Close" onPress={close} />
            <View style={styles.titles}>
              <Text variant="bodyStrong" numberOfLines={1} ellipsizeMode="middle" style={{ color: dark.ink }}>
                {asset.fileName}
              </Text>
              <Text variant="small" numberOfLines={1} style={{ color: dark.ink3 }}>
                {subtitle || formatBytes(asset.sizeBytes)}
              </Text>
            </View>
            <DarkIconButton icon={ExternalLink} label="Open in browser" onPress={openOutside} />
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function DarkIconButton({ icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.iconButton, { backgroundColor: withAlpha(dark.bg3, 0.55) }]}>
      <Icon icon={icon} size={22} rawColor={dark.ink} />
    </PressableScale>
  );
}

function DarkPill({ icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.pill, { borderColor: dark.lineStrong }]}>
      <Icon icon={icon} size={16} rawColor={dark.ink} />
      <Text variant="label" weight="600" style={{ color: dark.ink }}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  errorBox: { alignItems: 'center', gap: space[3], paddingHorizontal: space[8], maxWidth: 360 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: space[2] },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  titles: { flex: 1, minWidth: 0 },
  iconButton: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: layout.minTouch,
    paddingHorizontal: space[5],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
