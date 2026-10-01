import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { usePrefs } from '@/lib/prefs';

import { palettes, toneColors, type Palette, type Scheme, type Tone, type ToneColors } from './tokens';

export type Theme = {
  scheme: Scheme;
  isDark: boolean;
  colors: Palette;
  tones: Record<Tone, ToneColors>;
};

export function buildTheme(scheme: Scheme): Theme {
  const colors = palettes[scheme];
  return { scheme, isDark: scheme === 'dark', colors, tones: toneColors(scheme, colors) };
}

const themes: Record<Scheme, Theme> = { light: buildTheme('light'), dark: buildTheme('dark') };

const ThemeContext = createContext<Theme>(themes.dark);

/**
 * Follows the system by default; Settings can force Light or Dark.
 * The preference is pushed into Appearance so native surfaces (keyboard,
 * dialogs, the splash theme) follow the same choice as the JS UI.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = usePrefs((s) => s.theme);
  const system = useColorScheme();

  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  const scheme: Scheme = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
  const value = useMemo(() => themes[scheme], [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Read the theme outside React (e.g. while building a notification channel). */
export function themeFor(scheme: Scheme): Theme {
  return themes[scheme];
}
