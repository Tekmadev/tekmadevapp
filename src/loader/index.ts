/**
 * The black hole loader (brief section 5). Import from `@/loader`.
 * See README.md in this folder for which variant to use where.
 */

export { BlackHole, type BlackHoleProps } from './BlackHole';
export { BootSplash, HEADER_MARK, SPLASH_MARK_SIZE, type BootSplashProps } from './BootSplash';
export { BREATH_CYCLE_MS, BreathingMark, type BreathingMarkProps } from './BreathingMark';
export { ButtonSpinner, type ButtonSpinnerProps } from './ButtonSpinner';
export { InlineLoader, type InlineLoaderProps } from './InlineLoader';
export { LogoMark, type LogoMarkProps } from './LogoMark';
export { PageLoader, type PageLoaderProps } from './PageLoader';
export { PullToRefreshIndicator, type PullToRefreshIndicatorProps } from './PullToRefreshIndicator';
export { TopProgress, type TopProgressProps } from './TopProgress';

export {
  clampLoaderSettings,
  LOADER_DEFAULTS,
  LOADER_KEYS,
  LOADER_RANGES,
  useLoaderSettings,
  useLoaderStore,
} from './settings';
export { LOGO_PATHS, LOGO_VIEWBOX } from './logoPaths';
