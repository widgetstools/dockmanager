/**
 * Dock Manager Theme System
 *
 * Themes are plain objects that define all visual properties.
 * The DockviewComponent applies themes by setting CSS custom properties
 * on its container element, so themes are scoped and don't leak globally.
 *
 * Users can:
 *   1. Use a built-in theme: `theme: themes.vsCodeLight`
 *   2. Create a custom theme: `theme: { name: 'custom', mode: 'light', colors: { ... } }`
 *   3. Extend a built-in theme: `theme: { ...themes.vsCodeLight, colors: { ...themes.vsCodeLight.colors, primary: '#ff0000' } }`
 */

// ─── Theme interface ──────────────────────────────────────────────────

export interface DockThemeColors {
  /** Main background behind all panels */
  bg: string;
  /** Panel content surface */
  surface: string;
  /** Alternate surface (e.g., sidebar) */
  surfaceAlt: string;
  /** Panel header / tab bar background */
  panelHeader: string;
  /** Tab bar background */
  tabBar: string;
  /** Active/selected tab background */
  tabActive: string;
  /** Unselected tab text color */
  tabText: string;
  /** Selected + active tab text color (blue) */
  tabTextActive: string;
  /** Primary content text */
  text: string;
  /** Secondary text (labels, descriptions) */
  textSecondary: string;
  /** Muted text (placeholders, hints) */
  textMuted: string;
  /** Border color for panels, tabs, splitters */
  border: string;
  /** Splitter bar color */
  splitter: string;
  /** Splitter bar hover color */
  splitterHover: string;
  /** Hover state background */
  hover: string;
  /** Primary accent color (active indicators, selected tabs) */
  primary: string;
  /** Floating window shadow color */
  floatShadow: string;
}

export interface DockTheme {
  /** Human-readable theme name */
  name: string;
  /** Whether this is a light or dark theme */
  mode: 'light' | 'dark';
  /** Theme colors */
  colors: DockThemeColors;
}

// ─── CSS variable mapping ─────────────────────────────────────────────

/** Maps theme color keys to CSS custom property names */
const COLOR_TO_CSS: Record<keyof DockThemeColors, string> = {
  bg: '--dock-bg',
  surface: '--dock-surface',
  surfaceAlt: '--dock-surface-alt',
  panelHeader: '--dock-panel-header',
  tabBar: '--dock-tab-bar',
  tabActive: '--dock-tab-active',
  tabText: '--dock-tab-text',
  tabTextActive: '--dock-tab-text-active',
  text: '--dock-text',
  textSecondary: '--dock-text-secondary',
  textMuted: '--dock-text-muted',
  border: '--dock-border',
  splitter: '--dock-splitter',
  splitterHover: '--dock-splitter-hover',
  hover: '--dock-hover',
  primary: '--dock-primary',
  floatShadow: '--dock-float-shadow',
};

/**
 * Apply a theme to a container element by setting CSS custom properties.
 * This scopes the theme to that element's subtree.
 */
export function applyTheme(container: HTMLElement, theme: DockTheme): void {
  const colors = theme.colors;
  for (const [key, cssVar] of Object.entries(COLOR_TO_CSS)) {
    const value = colors[key as keyof DockThemeColors];
    if (value !== undefined) {
      container.style.setProperty(cssVar, value);
    }
  }
  // Also set derived variables that depend on theme colors
  container.style.setProperty('--dock-unpinned-bg', colors.surfaceAlt);
  container.style.setProperty('--dock-maximize-overlay-bg', colors.bg);
  container.style.setProperty('--dock-tab-overflow-bg', colors.surfaceAlt);
  container.style.setProperty('--dock-tab-overflow-hover', colors.hover);
  container.style.setProperty('--dock-scrollbar-thumb', colors.textMuted);
  container.style.setProperty('--dock-scrollbar-track', 'transparent');
}

// ─── Built-in Themes ──────────────────────────────────────────────────

// ── Light Themes ──

/** VS Code-inspired light theme — clean whites and grays */
export const vsCodeLight: DockTheme = {
  name: 'VS Code Light',
  mode: 'light',
  colors: {
    bg: '220 20% 96%',
    surface: '0 0% 100%',
    surfaceAlt: '220 14% 95%',
    panelHeader: '220 14% 92%',
    tabBar: '220 14% 93%',
    tabActive: '0 0% 100%',
    tabText: '0 0% 38%',
    tabTextActive: '217 91% 50%',
    text: '0 0% 15%',
    textSecondary: '0 0% 35%',
    textMuted: '0 0% 50%',
    border: '220 13% 82%',
    splitter: '220 13% 87%',
    splitterHover: '217 91% 60%',
    hover: '220 14% 93%',
    primary: '217 91% 50%',
    floatShadow: '0 0% 0%',
  },
};

/** GitHub-inspired light theme — warm grays with subtle blue accent */
export const githubLight: DockTheme = {
  name: 'GitHub Light',
  mode: 'light',
  colors: {
    bg: '210 20% 97%',
    surface: '0 0% 100%',
    surfaceAlt: '210 18% 96%',
    panelHeader: '210 18% 92%',
    tabBar: '210 15% 94%',
    tabActive: '0 0% 100%',
    tabText: '210 10% 35%',
    tabTextActive: '212 92% 45%',
    text: '210 12% 16%',
    textSecondary: '210 10% 32%',
    textMuted: '210 8% 48%',
    border: '210 14% 80%',
    splitter: '210 14% 89%',
    splitterHover: '212 92% 55%',
    hover: '210 15% 94%',
    primary: '212 92% 45%',
    floatShadow: '210 20% 20%',
  },
};

/** Soft warm light theme — cream tones with amber accent */
export const warmLight: DockTheme = {
  name: 'Warm Light',
  mode: 'light',
  colors: {
    bg: '40 30% 96%',
    surface: '40 20% 99%',
    surfaceAlt: '40 25% 95%',
    panelHeader: '40 25% 91%',
    tabBar: '40 20% 93%',
    tabActive: '40 20% 99%',
    tabText: '30 10% 35%',
    tabTextActive: '25 80% 45%',
    text: '30 15% 15%',
    textSecondary: '30 10% 32%',
    textMuted: '30 8% 48%',
    border: '35 15% 80%',
    splitter: '35 15% 87%',
    splitterHover: '25 80% 55%',
    hover: '40 20% 93%',
    primary: '25 80% 45%',
    floatShadow: '30 20% 15%',
  },
};

/** Solarized Light — low-contrast cream with teal accents, designed for all-day use */
export const solarizedLight: DockTheme = {
  name: 'Solarized Light',
  mode: 'light',
  colors: {
    bg: '44 87% 94%',
    surface: '44 87% 97%',
    surfaceAlt: '44 60% 93%',
    panelHeader: '44 60% 89%',
    tabBar: '44 50% 91%',
    tabActive: '44 87% 97%',
    tabText: '194 14% 35%',
    tabTextActive: '175 59% 35%',
    text: '192 81% 14%',
    textSecondary: '194 14% 32%',
    textMuted: '180 8% 48%',
    border: '44 30% 80%',
    splitter: '44 30% 85%',
    splitterHover: '175 59% 45%',
    hover: '44 50% 91%',
    primary: '175 59% 35%',
    floatShadow: '44 20% 30%',
  },
};

/** Sepia — book-like warmth with brown tones, very gentle on eyes */
export const sepiaLight: DockTheme = {
  name: 'Sepia',
  mode: 'light',
  colors: {
    bg: '35 35% 94%',
    surface: '35 30% 97%',
    surfaceAlt: '35 28% 93%',
    panelHeader: '35 28% 88%',
    tabBar: '35 25% 90%',
    tabActive: '35 30% 97%',
    tabText: '25 12% 35%',
    tabTextActive: '18 60% 42%',
    text: '25 20% 18%',
    textSecondary: '25 12% 32%',
    textMuted: '25 8% 48%',
    border: '30 18% 80%',
    splitter: '30 18% 85%',
    splitterHover: '18 60% 50%',
    hover: '35 25% 91%',
    primary: '18 60% 42%',
    floatShadow: '25 15% 25%',
  },
};

/** Mint — soft green tones, refreshing and calming */
export const mintLight: DockTheme = {
  name: 'Mint',
  mode: 'light',
  colors: {
    bg: '150 20% 96%',
    surface: '150 15% 99%',
    surfaceAlt: '150 18% 95%',
    panelHeader: '150 18% 90%',
    tabBar: '150 15% 92%',
    tabActive: '150 15% 99%',
    tabText: '160 10% 35%',
    tabTextActive: '162 63% 35%',
    text: '160 18% 14%',
    textSecondary: '160 10% 32%',
    textMuted: '155 8% 48%',
    border: '150 14% 80%',
    splitter: '150 14% 87%',
    splitterHover: '162 63% 45%',
    hover: '150 15% 93%',
    primary: '162 63% 35%',
    floatShadow: '155 15% 20%',
  },
};

/** Lavender — soft purple-gray, elegant and easy on eyes */
export const lavenderLight: DockTheme = {
  name: 'Lavender',
  mode: 'light',
  colors: {
    bg: '260 20% 96%',
    surface: '260 15% 99%',
    surfaceAlt: '260 16% 95%',
    panelHeader: '260 16% 90%',
    tabBar: '260 14% 92%',
    tabActive: '260 15% 99%',
    tabText: '265 10% 35%',
    tabTextActive: '262 52% 50%',
    text: '265 18% 16%',
    textSecondary: '265 10% 32%',
    textMuted: '260 8% 48%',
    border: '260 14% 80%',
    splitter: '260 14% 87%',
    splitterHover: '262 52% 58%',
    hover: '260 14% 93%',
    primary: '262 52% 50%',
    floatShadow: '260 15% 22%',
  },
};

// ── Dark Themes ──

/** VS Code-inspired dark theme — deep blues and grays */
export const vsCodeDark: DockTheme = {
  name: 'VS Code Dark',
  mode: 'dark',
  colors: {
    bg: '222 47% 7%',
    surface: '222 47% 10%',
    surfaceAlt: '222 47% 12%',
    panelHeader: '222 47% 15%',
    tabBar: '222 47% 11%',
    tabActive: '222 47% 10%',
    tabText: '215 20% 65%',
    tabTextActive: '217 91% 70%',
    text: '210 40% 96%',
    textSecondary: '215 20% 68%',
    textMuted: '215 15% 50%',
    border: '217 33% 24%',
    splitter: '217 33% 20%',
    splitterHover: '217 91% 60%',
    hover: '217 33% 16%',
    primary: '217 91% 70%',
    floatShadow: '0 0% 0%',
  },
};

/** Dracula-inspired dark theme — purple accents on dark gray */
export const draculaDark: DockTheme = {
  name: 'Dracula Dark',
  mode: 'dark',
  colors: {
    bg: '231 15% 14%',
    surface: '231 15% 17%',
    surfaceAlt: '231 15% 19%',
    panelHeader: '231 15% 22%',
    tabBar: '231 15% 16%',
    tabActive: '231 15% 17%',
    tabText: '225 15% 65%',
    tabTextActive: '265 90% 72%',
    text: '60 30% 92%',
    textSecondary: '225 15% 68%',
    textMuted: '225 12% 50%',
    border: '231 15% 28%',
    splitter: '231 15% 24%',
    splitterHover: '265 90% 60%',
    hover: '231 15% 22%',
    primary: '265 90% 72%',
    floatShadow: '231 20% 5%',
  },
};

/** Nord-inspired dark theme — arctic blue-gray palette */
export const nordDark: DockTheme = {
  name: 'Nord Dark',
  mode: 'dark',
  colors: {
    bg: '220 16% 16%',
    surface: '220 16% 20%',
    surfaceAlt: '220 16% 22%',
    panelHeader: '220 16% 25%',
    tabBar: '220 16% 19%',
    tabActive: '220 16% 20%',
    tabText: '219 14% 65%',
    tabTextActive: '193 43% 60%',
    text: '219 28% 88%',
    textSecondary: '219 14% 68%',
    textMuted: '219 12% 50%',
    border: '220 16% 30%',
    splitter: '220 16% 26%',
    splitterHover: '193 43% 50%',
    hover: '220 16% 24%',
    primary: '193 43% 60%',
    floatShadow: '220 20% 8%',
  },
};

/** Solarized Dark — low-contrast dark with teal accents, designed for all-day use */
export const solarizedDark: DockTheme = {
  name: 'Solarized Dark',
  mode: 'dark',
  colors: {
    bg: '192 81% 8%',
    surface: '192 81% 11%',
    surfaceAlt: '192 60% 13%',
    panelHeader: '192 60% 16%',
    tabBar: '192 70% 10%',
    tabActive: '192 81% 11%',
    tabText: '180 8% 65%',
    tabTextActive: '175 59% 55%',
    text: '44 87% 94%',
    textSecondary: '180 8% 68%',
    textMuted: '194 14% 50%',
    border: '192 50% 24%',
    splitter: '192 50% 16%',
    splitterHover: '175 59% 50%',
    hover: '192 60% 15%',
    primary: '175 59% 55%',
    floatShadow: '192 60% 3%',
  },
};

/** Midnight Blue — deep navy with soft blue accents, very easy on eyes at night */
export const midnightDark: DockTheme = {
  name: 'Midnight Blue',
  mode: 'dark',
  colors: {
    bg: '225 30% 10%',
    surface: '225 28% 13%',
    surfaceAlt: '225 26% 15%',
    panelHeader: '225 26% 18%',
    tabBar: '225 28% 12%',
    tabActive: '225 28% 13%',
    tabText: '220 15% 65%',
    tabTextActive: '210 60% 65%',
    text: '220 25% 90%',
    textSecondary: '220 15% 68%',
    textMuted: '220 12% 50%',
    border: '225 25% 24%',
    splitter: '225 25% 20%',
    splitterHover: '210 60% 55%',
    hover: '225 26% 18%',
    primary: '210 60% 65%',
    floatShadow: '225 30% 4%',
  },
};

/** Forest — deep green-gray with emerald accents, nature-inspired calm */
export const forestDark: DockTheme = {
  name: 'Forest Dark',
  mode: 'dark',
  colors: {
    bg: '160 18% 9%',
    surface: '160 16% 12%',
    surfaceAlt: '160 14% 14%',
    panelHeader: '160 14% 17%',
    tabBar: '160 16% 11%',
    tabActive: '160 16% 12%',
    tabText: '155 10% 65%',
    tabTextActive: '152 50% 55%',
    text: '150 15% 90%',
    textSecondary: '155 10% 68%',
    textMuted: '155 8% 50%',
    border: '160 14% 24%',
    splitter: '160 14% 18%',
    splitterHover: '152 50% 48%',
    hover: '160 14% 16%',
    primary: '152 50% 55%',
    floatShadow: '160 18% 3%',
  },
};

/** Slate — neutral gray with warm undertones, minimalist and gentle */
export const slateDark: DockTheme = {
  name: 'Slate Dark',
  mode: 'dark',
  colors: {
    bg: '215 12% 11%',
    surface: '215 10% 14%',
    surfaceAlt: '215 9% 16%',
    panelHeader: '215 9% 19%',
    tabBar: '215 10% 13%',
    tabActive: '215 10% 14%',
    tabText: '210 8% 65%',
    tabTextActive: '205 40% 62%',
    text: '210 15% 90%',
    textSecondary: '210 8% 68%',
    textMuted: '210 6% 50%',
    border: '215 9% 24%',
    splitter: '215 9% 20%',
    splitterHover: '205 40% 52%',
    hover: '215 9% 18%',
    primary: '205 40% 62%',
    floatShadow: '215 12% 4%',
  },
};

// ─── Theme collection ─────────────────────────────────────────────────

/** All built-in themes */
export const themes = {
  // Light
  vsCodeLight,
  githubLight,
  warmLight,
  solarizedLight,
  sepiaLight,
  mintLight,
  lavenderLight,
  // Dark
  vsCodeDark,
  draculaDark,
  nordDark,
  solarizedDark,
  midnightDark,
  forestDark,
  slateDark,
} as const;

/** Get a theme by name */
export function getThemeByName(name: string): DockTheme | undefined {
  return Object.values(themes).find(t => t.name === name);
}

/** Get all themes for a given mode */
export function getThemesByMode(mode: 'light' | 'dark'): DockTheme[] {
  return Object.values(themes).filter(t => t.mode === mode);
}
