export const DOCK_CSS: string = '__DOCK_CSS_PLACEHOLDER__';
const STYLE_TAG_ID = 'dock-manager-styles';
let refCount = 0;
let styleEl: HTMLStyleElement | null = null;

function stylesAlreadyLoaded(): boolean {
  if (document.getElementById(STYLE_TAG_ID)) return true;
  return getComputedStyle(document.documentElement).getPropertyValue('--dock-bg').trim().length > 0;
}

export function ensureStyles(): void {
  refCount++;
  if (refCount > 1) return;
  if (typeof document === 'undefined') return;
  if (DOCK_CSS === '__DOCK_CSS_PLACEHOLDER__') return;
  if (stylesAlreadyLoaded()) return;
  styleEl = document.createElement('style');
  styleEl.id = STYLE_TAG_ID;
  styleEl.textContent = DOCK_CSS;
  document.head.appendChild(styleEl);
}

export function releaseStyles(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && styleEl) { styleEl.remove(); styleEl = null; }
}
