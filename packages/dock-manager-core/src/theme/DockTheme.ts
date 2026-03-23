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
 *   4. Use createTheme factory: `theme: createTheme('My Theme', 'dark', { hue: 220, sat: 16 }, { hue: 193, sat: 43, light: 60 })`
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

// ─── Theme Factory ───────────────────────────────────────────────────

/** HSL color shorthand: `hue saturation% lightness%` */
const hsl = (h: number, s: number, l: number) => `${h} ${s}% ${l}%`;

interface ThemeBase {
  hue: number;
  sat: number;
  light?: number;  // base bg lightness (default: 96 for light, 10 for dark)
}

interface ThemeAccent {
  hue: number;
  sat: number;
  light?: number;  // accent lightness (default: 50 for light, 65 for dark)
}

/**
 * Create a theme from a base palette and accent color.
 *
 * @param name - Human-readable theme name
 * @param mode - 'light' or 'dark'
 * @param base - Background hue/saturation (lightness auto-derived from mode)
 * @param accent - Primary accent hue/saturation
 * @param overrides - Optional per-color overrides for special themes
 */
export function createTheme(
  name: string,
  mode: 'light' | 'dark',
  base: ThemeBase,
  accent: ThemeAccent,
  overrides?: Partial<DockThemeColors>,
): DockTheme {
  const { hue: h, sat: s } = base;
  const { hue: ah, sat: as_ } = accent;

  let colors: DockThemeColors;

  if (mode === 'light') {
    const bl = base.light ?? 96;       // bg lightness
    const al = accent.light ?? 50;     // accent lightness
    const ts = Math.max(s - 6, 0);     // text saturation (lower)

    colors = {
      bg:             hsl(h, s, bl),
      surface:        hsl(h, Math.max(s - 5, 0), Math.min(bl + 3, 100)),
      surfaceAlt:     hsl(h, Math.max(s - 2, 0), bl - 1),
      panelHeader:    hsl(h, Math.max(s - 2, 0), bl - 4),
      tabBar:         hsl(h, Math.max(s - 5, 0), bl - 3),
      tabActive:      hsl(h, Math.max(s - 5, 0), Math.min(bl + 3, 100)),
      tabText:        hsl(h - 10, Math.max(ts - 8, 0), 35),
      tabTextActive:  hsl(ah, as_, al),
      text:           hsl(h - 10, Math.max(ts - 2, 0), 15),
      textSecondary:  hsl(h - 10, Math.max(ts - 8, 0), 32),
      textMuted:      hsl(h - 10, Math.max(ts - 12, 0), 48),
      border:         hsl(h, Math.max(s - 6, 0), 80),
      splitter:       hsl(h, Math.max(s - 6, 0), 87),
      splitterHover:  hsl(ah, as_, al + 8),
      hover:          hsl(h, Math.max(s - 5, 0), bl - 3),
      primary:        hsl(ah, as_, al),
      floatShadow:    hsl(h, Math.max(s, 0), 15),
    };
  } else {
    const bl = base.light ?? 10;       // bg lightness
    const al = accent.light ?? 65;     // accent lightness
    const ts = Math.round(s * 0.5);    // text saturation (much lower)

    colors = {
      bg:             hsl(h, s, bl),
      surface:        hsl(h, s, bl + 3),
      surfaceAlt:     hsl(h, Math.max(s - 2, 0), bl + 5),
      panelHeader:    hsl(h, Math.max(s - 2, 0), bl + 8),
      tabBar:         hsl(h, s, bl + 1),
      tabActive:      hsl(h, s, bl + 3),
      tabText:        hsl(h - 5, Math.max(ts, 8), 65),
      tabTextActive:  hsl(ah, as_, al),
      text:           hsl(h - 5, Math.round(s * 0.8), 90),
      textSecondary:  hsl(h - 5, Math.max(ts, 8), 68),
      textMuted:      hsl(h - 5, Math.max(ts - 3, 6), 50),
      border:         hsl(h, Math.max(s - 2, 0), bl + 14),
      splitter:       hsl(h, Math.max(s - 2, 0), bl + 10),
      splitterHover:  hsl(ah, as_, al - 8),
      hover:          hsl(h, Math.max(s - 2, 0), bl + 8),
      primary:        hsl(ah, as_, al),
      floatShadow:    hsl(h, Math.min(s + 5, 100), Math.max(bl - 7, 0)),
    };
  }

  if (overrides) {
    Object.assign(colors, overrides);
  }

  return { name, mode, colors };
}

// ─── Built-in Themes ──────────────────────────────────────────────────

// ── Light Themes ──

export const vsCodeLight = createTheme('VS Code Light', 'light',
  { hue: 220, sat: 20 },
  { hue: 217, sat: 91, light: 50 },
  { floatShadow: '0 0% 0%' },
);

export const githubLight = createTheme('GitHub Light', 'light',
  { hue: 210, sat: 20, light: 97 },
  { hue: 212, sat: 92, light: 45 },
  { floatShadow: '210 20% 20%' },
);

export const warmLight = createTheme('Warm Light', 'light',
  { hue: 40, sat: 30 },
  { hue: 25, sat: 80, light: 45 },
);

export const solarizedLight = createTheme('Solarized Light', 'light',
  { hue: 44, sat: 87, light: 94 },
  { hue: 175, sat: 59, light: 35 },
  {
    tabText: '194 14% 35%',
    text: '192 81% 14%',
    textSecondary: '194 14% 32%',
    textMuted: '180 8% 48%',
    floatShadow: '44 20% 30%',
  },
);

export const sepiaLight = createTheme('Sepia', 'light',
  { hue: 35, sat: 35, light: 94 },
  { hue: 18, sat: 60, light: 42 },
);

export const mintLight = createTheme('Mint', 'light',
  { hue: 150, sat: 20 },
  { hue: 162, sat: 63, light: 35 },
);

export const lavenderLight = createTheme('Lavender', 'light',
  { hue: 260, sat: 20 },
  { hue: 262, sat: 52, light: 50 },
);

// ── Dark Themes ──

export const vsCodeDark = createTheme('VS Code Dark', 'dark',
  { hue: 222, sat: 47, light: 7 },
  { hue: 217, sat: 91, light: 70 },
  { text: '210 40% 96%', floatShadow: '0 0% 0%' },
);

export const draculaDark = createTheme('Dracula Dark', 'dark',
  { hue: 231, sat: 15, light: 14 },
  { hue: 265, sat: 90, light: 72 },
  { text: '60 30% 92%' },
);

export const nordDark = createTheme('Nord Dark', 'dark',
  { hue: 220, sat: 16, light: 16 },
  { hue: 193, sat: 43, light: 60 },
  { text: '219 28% 88%' },
);

export const solarizedDark = createTheme('Solarized Dark', 'dark',
  { hue: 192, sat: 81, light: 8 },
  { hue: 175, sat: 59, light: 55 },
  {
    tabText: '180 8% 65%',
    text: '44 87% 94%',
    textSecondary: '180 8% 68%',
    textMuted: '194 14% 50%',
    floatShadow: '192 60% 3%',
  },
);

export const midnightDark = createTheme('Midnight Blue', 'dark',
  { hue: 225, sat: 30 },
  { hue: 210, sat: 60, light: 65 },
);

export const forestDark = createTheme('Forest Dark', 'dark',
  { hue: 160, sat: 18, light: 9 },
  { hue: 152, sat: 50, light: 55 },
);

export const slateDark = createTheme('Slate Dark', 'dark',
  { hue: 215, sat: 12, light: 11 },
  { hue: 205, sat: 40, light: 62 },
);

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
