import { describe, it, expect } from 'vitest';
import {
  iconClose,
  iconMaximize,
  iconRestore,
  iconFloat,
  iconDockBack,
  iconPin,
  iconUnpin,
  iconChevronDown,
  iconEllipsis,
  iconPlay,
} from '../dom/icons';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Assert the string is a valid SVG tag with the expected width/height. */
function expectSvg(result: string, width: number, height: number): void {
  expect(result).toContain('<svg');
  expect(result).toContain(`width="${width}"`);
  expect(result).toContain(`height="${height}"`);
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('iconClose', () => {
  it('returns an SVG string with default size 12', () => {
    expectSvg(iconClose(), 12, 12);
  });

  it('uses a custom size when provided', () => {
    expectSvg(iconClose(20), 20, 20);
  });

  it('contains a close path (X shape)', () => {
    expect(iconClose()).toContain('<path');
  });
});

describe('iconMaximize', () => {
  it('returns an SVG string with default size 14', () => {
    expectSvg(iconMaximize(), 14, 14);
  });
});

describe('iconRestore', () => {
  it('returns an SVG string with default size 14', () => {
    expectSvg(iconRestore(), 14, 14);
  });
});

describe('iconFloat', () => {
  it('returns an SVG string with default size 14', () => {
    expectSvg(iconFloat(), 14, 14);
  });

  it('contains a rect element', () => {
    expect(iconFloat()).toContain('<rect');
  });
});

describe('iconDockBack', () => {
  it('returns an SVG string with default size 14', () => {
    expectSvg(iconDockBack(), 14, 14);
  });
});

describe('iconPin', () => {
  it('returns an SVG string with default size 14', () => {
    expectSvg(iconPin(), 14, 14);
  });
});

describe('iconUnpin', () => {
  it('returns an SVG string with default size 14', () => {
    expectSvg(iconUnpin(), 14, 14);
  });
});

describe('iconChevronDown', () => {
  it('returns an SVG string with default size 14', () => {
    expectSvg(iconChevronDown(), 14, 14);
  });

  it('uses a custom size when provided', () => {
    expectSvg(iconChevronDown(10), 10, 10);
  });

  it('contains a polyline element', () => {
    expect(iconChevronDown()).toContain('<polyline');
  });
});

describe('iconEllipsis', () => {
  it('returns an SVG string with default size 14', () => {
    expectSvg(iconEllipsis(), 14, 14);
  });

  it('uses a custom size when provided', () => {
    expectSvg(iconEllipsis(18), 18, 18);
  });

  it('contains three circle elements', () => {
    const svg = iconEllipsis();
    const circleCount = (svg.match(/<circle/g) || []).length;
    expect(circleCount).toBe(3);
  });
});

describe('iconPlay', () => {
  it('returns an SVG string with default size 14', () => {
    expectSvg(iconPlay(), 14, 14);
  });

  it('contains a polygon element', () => {
    expect(iconPlay()).toContain('<polygon');
  });
});
