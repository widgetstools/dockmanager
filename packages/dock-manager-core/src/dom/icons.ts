/**
 * Inline SVG icon functions for dock manager UI elements.
 * These replace the lucide-react icons used in the React wrapper,
 * making the core package framework-agnostic.
 */

const S = 14; // default icon size
const SW = '2'; // stroke width

function svg(paths: string, size = S): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/** X / Close icon */
export function iconClose(size = 12): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
}

/** Maximize (expand) icon */
export function iconMaximize(): string {
  return svg('<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>');
}

/** Minimize (restore) icon */
export function iconRestore(): string {
  return svg('<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>');
}

/** Float / AppWindow icon */
export function iconFloat(): string {
  return svg('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4h10"/>');
}

/** Dock back / PanelBottom icon */
export function iconDockBack(): string {
  return svg('<rect x="2" y="2" width="20" height="20" rx="2"/><path d="M2 14h20"/>');
}

/**
 * Pin icon (from Lucide "pin") — upright pushpin.
 * Shown on docked/pinned panes. Clicking unpins.
 */
export function iconPin(): string {
  return svg('<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>');
}

/**
 * Pin-off icon (from Lucide "pin-off") — pushpin with slash.
 * Shown on unpinned panes. Clicking pins.
 */
export function iconUnpin(): string {
  return svg('<path d="M12 17v5"/><path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"/><path d="m2 2 20 20"/><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"/>');
}


/** Chevron down icon */
export function iconChevronDown(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>`;
}

/** Ellipsis (three dots) icon for tab overflow */
export function iconEllipsis(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;
}

/** Play / Run icon (triangle) */
export function iconPlay(): string {
  return svg('<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/>');
}
