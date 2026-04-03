/**
 * Auto-injects dock manager CSS into the document <head> on first use.
 *
 * Uses a reference counter so multiple DockviewComponent instances share
 * the same <style> tag. The tag is removed when all instances are disposed.
 *
 * If the consumer has already imported the CSS manually (via a bundler import
 * or a <link> tag), the existing styles take precedence and this module
 * simply increments the reference counter without injecting a duplicate.
 */

// The CSS content is inlined at build time by the build script.
// This placeholder is replaced with the actual CSS string.
// If not replaced (e.g., during tests), the injector becomes a no-op.
export const DOCK_CSS: string = '__DOCK_CSS_PLACEHOLDER__';

const STYLE_TAG_ID = 'dock-manager-styles';

let refCount = 0;
let styleEl: HTMLStyleElement | null = null;

/** Returns true if dock manager styles are already present in the document. */
function stylesAlreadyLoaded(): boolean {
  // Check for our own injected tag
  if (document.getElementById(STYLE_TAG_ID)) return true;

  // Check if a <link> or <style> already defines dock-manager-root styles
  // by looking for the --dock-bg custom property on :root
  const rootStyle = getComputedStyle(document.documentElement);
  const dockBg = rootStyle.getPropertyValue('--dock-bg').trim();
  return dockBg.length > 0;
}

/**
 * Ensure dock manager styles are present in the document.
 * Call from DockviewComponent constructor.
 */
export function ensureStyles(): void {
  refCount++;

  if (refCount > 1) return; // Already injected or detected
  if (typeof document === 'undefined') return; // SSR safety
  if (DOCK_CSS === '__DOCK_CSS_PLACEHOLDER__') return; // Build didn't inline CSS (tests)
  if (stylesAlreadyLoaded()) return; // Consumer imported CSS manually

  styleEl = document.createElement('style');
  styleEl.id = STYLE_TAG_ID;
  styleEl.textContent = DOCK_CSS;
  document.head.appendChild(styleEl);
}

/**
 * Decrement the reference counter. Removes the injected <style> tag
 * when the last DockviewComponent instance is disposed.
 */
export function releaseStyles(): void {
  refCount = Math.max(0, refCount - 1);

  if (refCount === 0 && styleEl) {
    styleEl.remove();
    styleEl = null;
  }
}
