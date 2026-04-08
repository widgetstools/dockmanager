import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isDockManagerDebugEnabled,
  setDockManagerDebug,
  debugLog,
  debugWarn,
  debugError,
} from '../utils/debug';

describe('debug logging', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setDockManagerDebug(false);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    setDockManagerDebug(false);
  });

  it('is disabled by default', () => {
    expect(isDockManagerDebugEnabled()).toBe(false);
    debugLog('TAG', 'hello');
    debugWarn('TAG', 'hello');
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('emits log and warn when enabled', () => {
    setDockManagerDebug(true);
    debugLog('FLYOUT_CONTENT', 'attached', { panelId: 'a' });
    debugWarn('FLYOUT_CONTENT', 'detached');
    expect(logSpy).toHaveBeenCalledWith('[FLYOUT_CONTENT]', 'attached', { panelId: 'a' });
    expect(warnSpy).toHaveBeenCalledWith('[FLYOUT_CONTENT]', 'detached');
  });

  it('always emits errors regardless of flag', () => {
    debugError('FLYOUT_CONTENT', 'oops');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('setDockManagerDebug toggles back off', () => {
    setDockManagerDebug(true);
    expect(isDockManagerDebugEnabled()).toBe(true);
    setDockManagerDebug(false);
    expect(isDockManagerDebugEnabled()).toBe(false);
  });
});
