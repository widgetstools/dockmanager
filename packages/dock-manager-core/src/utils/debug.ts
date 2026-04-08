/**
 * Debug logging gate.
 *
 * Verbose `[FLYOUT_CONTENT]` (and future) diagnostics are silent by default.
 * Enable at runtime in any of three ways:
 *
 *   1. In the browser console / app bootstrap:
 *        (window as any).__DOCK_MANAGER_DEBUG__ = true
 *
 *   2. localStorage flag (persists across reloads):
 *        localStorage.setItem('dock-manager-debug', '1')
 *
 *   3. Programmatically from host code:
 *        import { setDockManagerDebug } from '@widgetstools/dock-manager-core';
 *        setDockManagerDebug(true);
 *
 * The check is intentionally cheap (one property read) so production builds
 * pay almost nothing when disabled.
 */

let explicitOverride: boolean | null = null;

function readEnvFlag(): boolean {
  if (explicitOverride !== null) return explicitOverride;
  if (typeof window === 'undefined') return false;
  try {
    if ((window as unknown as { __DOCK_MANAGER_DEBUG__?: boolean }).__DOCK_MANAGER_DEBUG__) {
      return true;
    }
    if (typeof localStorage !== 'undefined' && localStorage.getItem('dock-manager-debug')) {
      return true;
    }
  } catch {
    /* private mode / sandboxed iframe — ignore */
  }
  return false;
}

export function isDockManagerDebugEnabled(): boolean {
  return readEnvFlag();
}

export function setDockManagerDebug(enabled: boolean): void {
  explicitOverride = enabled;
}

/**
 * Tag-prefixed debug logger. No-op when debug is disabled.
 * Usage: `debugLog('FLYOUT_CONTENT', 'attached panel=', panelId);`
 */
export function debugLog(tag: string, ...args: unknown[]): void {
  if (!readEnvFlag()) return;
  // eslint-disable-next-line no-console
  console.log(`[${tag}]`, ...args);
}

export function debugWarn(tag: string, ...args: unknown[]): void {
  if (!readEnvFlag()) return;
  // eslint-disable-next-line no-console
  console.warn(`[${tag}]`, ...args);
}

export function debugError(tag: string, ...args: unknown[]): void {
  // Errors always log — they indicate real failures, not diagnostic noise.
  // eslint-disable-next-line no-console
  console.error(`[${tag}]`, ...args);
}
