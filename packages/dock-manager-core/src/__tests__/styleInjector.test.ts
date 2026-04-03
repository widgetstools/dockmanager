// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { DOCK_CSS, ensureStyles, releaseStyles } from '../dom/styleInjector';

describe('styleInjector', () => {
  beforeEach(() => {
    // Reset ref count by releasing until it bottoms out at 0
    for (let i = 0; i < 20; i++) {
      releaseStyles();
    }

    // Remove any injected style tag
    const existing = document.getElementById('dock-manager-styles');
    if (existing) existing.remove();
  });

  it('DOCK_CSS is the placeholder value in tests', () => {
    expect(DOCK_CSS).toBe('__DOCK_CSS_PLACEHOLDER__');
  });

  it('ensureStyles() does nothing when DOCK_CSS is placeholder', () => {
    ensureStyles();

    const styleTag = document.getElementById('dock-manager-styles');
    expect(styleTag).toBeNull();
  });

  it('releaseStyles() does not go below 0', () => {
    // Call release many times without any prior ensure
    releaseStyles();
    releaseStyles();
    releaseStyles();

    // Should not throw and calling ensure once after should work fine
    expect(() => ensureStyles()).not.toThrow();
  });

  it('multiple ensureStyles/releaseStyles cycles work (ref counting)', () => {
    // Simulate 3 components mounting
    ensureStyles();
    ensureStyles();
    ensureStyles();

    // Simulate 3 components unmounting
    releaseStyles();
    releaseStyles();
    releaseStyles();

    // Start a new cycle - should not throw
    ensureStyles();
    releaseStyles();

    expect(() => ensureStyles()).not.toThrow();
  });

  it('ensureStyles can be called after full release cycle', () => {
    ensureStyles();
    releaseStyles();

    // Second full cycle
    ensureStyles();
    releaseStyles();

    // No style tag since CSS is placeholder
    const styleTag = document.getElementById('dock-manager-styles');
    expect(styleTag).toBeNull();
  });
});
