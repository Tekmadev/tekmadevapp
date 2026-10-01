import { createContext, forwardRef, use, useCallback, type ComponentProps, type ForwardedRef } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';
import { GestureDetector, type NativeGesture } from 'react-native-gesture-handler';
import Animated, { type AnimatedRef } from 'react-native-reanimated';

/**
 * Pull to refresh needs the scroll view's own touch handling to join the
 * gesture system (Gesture.Native), so our pull pan can run alongside it, and it
 * needs an animated ref on the real native scroll view to hold it at the top
 * from the UI thread. FlashList and KeyboardAwareScrollView create the scroll
 * view themselves, so these wrappers are handed to them as the scroll component
 * and read both from context.
 */
export type ScrollGestureValue = {
  native: NativeGesture;
  /** Attached to the native scroll view (scrollTo on the UI thread, JS scrolling). */
  scrollRef: AnimatedRef<Animated.ScrollView>;
};

export const ScrollGestureContext = createContext<ScrollGestureValue | null>(null);

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

type AnimatedScrollViewProps = ComponentProps<typeof Animated.ScrollView>;

/** Reanimated scroll view (Screen, KeyboardAwareScrollView) joined to the pull gesture. */
export const GestureAnimatedScrollView = forwardRef<Animated.ScrollView, AnimatedScrollViewProps>(
  function GestureAnimatedScrollView(props, ref) {
    const ctx = use(ScrollGestureContext);
    const scrollRef = ctx?.scrollRef;
    const setRef = useCallback(
      (node: ScrollView | null) => {
        scrollRef?.(node);
        // Reanimated hands back the plain ScrollView instance; the forwarded type is its animated alias.
        assignRef(ref, node as Animated.ScrollView | null);
      },
      [scrollRef, ref],
    );
    const view = <Animated.ScrollView {...props} ref={setRef} />;
    return ctx ? <GestureDetector gesture={ctx.native}>{view}</GestureDetector> : view;
  },
);

/**
 * Plain scroll view for FlashList's `renderScrollComponent`. FlashList passes its
 * own onScroll (virtualization); our Reanimated handler is attached to the same
 * native view by the animated FlashList wrapper, so this stays a plain view.
 * Must stay a module-level component: FlashList memoizes on its identity.
 */
export const GestureListScrollView = forwardRef<ScrollView, ScrollViewProps>(function GestureListScrollView(props, ref) {
  const ctx = use(ScrollGestureContext);
  const scrollRef = ctx?.scrollRef;
  const setRef = useCallback(
    (node: ScrollView | null) => {
      scrollRef?.(node);
      assignRef(ref, node);
    },
    [scrollRef, ref],
  );
  const view = <ScrollView {...props} ref={setRef} />;
  return ctx ? <GestureDetector gesture={ctx.native}>{view}</GestureDetector> : view;
});
