import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PanelApi } from '../api/PanelApi';
import type { PanelConfig } from '../types/dock';

describe('PanelApi', () => {
  let api: PanelApi;
  let mockConfig: PanelConfig;
  let updateHandler: ReturnType<typeof vi.fn>;
  let attentionHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockConfig = {
      id: 'test-panel',
      title: 'Test Panel',
      icon: '📄',
      widgetType: 'chart',
      widgetProps: { symbol: 'AAPL' },
    };

    updateHandler = vi.fn();
    attentionHandler = vi.fn();

    api = new PanelApi('test-panel');
    api._setConfigAccessor(() => mockConfig);
    api._setUpdateHandler(updateHandler);
    api._setAttentionHandler(attentionHandler);
  });

  describe('identity', () => {
    it('exposes panelId', () => {
      expect(api.panelId).toBe('test-panel');
    });

    it('exposes widgetType from config', () => {
      expect(api.widgetType).toBe('chart');
    });

    it('exposes widgetProps from config', () => {
      expect(api.widgetProps).toEqual({ symbol: 'AAPL' });
    });

    it('returns empty string/object when config is undefined', () => {
      api._setConfigAccessor(() => undefined);
      expect(api.widgetType).toBe('');
      expect(api.widgetProps).toEqual({});
    });
  });

  describe('setTitle', () => {
    it('dispatches UPDATE_PANEL_CONFIG with new title', () => {
      api.setTitle('New Title');
      expect(updateHandler).toHaveBeenCalledWith('test-panel', { title: 'New Title' });
    });
  });

  describe('setIcon', () => {
    it('dispatches with icon string', () => {
      api.setIcon('🔥');
      expect(updateHandler).toHaveBeenCalledWith('test-panel', { icon: '🔥' });
    });

    it('dispatches with undefined when null is passed', () => {
      api.setIcon(null);
      expect(updateHandler).toHaveBeenCalledWith('test-panel', { icon: undefined });
    });
  });

  describe('setBadge', () => {
    it('dispatches with badge text', () => {
      api.setBadge('3');
      expect(updateHandler).toHaveBeenCalledWith('test-panel', { badge: '3' });
    });

    it('dispatches with null to clear badge', () => {
      api.setBadge(null);
      expect(updateHandler).toHaveBeenCalledWith('test-panel', { badge: null });
    });
  });

  describe('setAttention', () => {
    it('calls attention handler with true', () => {
      api.setAttention(true);
      expect(attentionHandler).toHaveBeenCalledWith('test-panel', true);
    });

    it('calls attention handler with false', () => {
      api.setAttention(false);
      expect(attentionHandler).toHaveBeenCalledWith('test-panel', false);
    });
  });

  describe('setHidden', () => {
    it('dispatches with hidden=true', () => {
      api.setHidden(true);
      expect(updateHandler).toHaveBeenCalledWith('test-panel', { hidden: true });
    });

    it('dispatches with hidden=false', () => {
      api.setHidden(false);
      expect(updateHandler).toHaveBeenCalledWith('test-panel', { hidden: false });
    });

    it('reflects isHidden from config', () => {
      expect(api.isHidden).toBe(false);
      mockConfig.hidden = true;
      expect(api.isHidden).toBe(true);
    });
  });

  describe('updateProps', () => {
    it('merges new props with existing widgetProps', () => {
      api.updateProps({ timeframe: '1D' });
      expect(updateHandler).toHaveBeenCalledWith('test-panel', {
        widgetProps: { symbol: 'AAPL', timeframe: '1D' },
      });
    });

    it('overwrites existing props', () => {
      api.updateProps({ symbol: 'GOOG' });
      expect(updateHandler).toHaveBeenCalledWith('test-panel', {
        widgetProps: { symbol: 'GOOG' },
      });
    });
  });

  describe('getTitle', () => {
    it('returns current title from config', () => {
      expect(api.getTitle()).toBe('Test Panel');
    });

    it('returns empty string when config is undefined', () => {
      api._setConfigAccessor(() => undefined);
      expect(api.getTitle()).toBe('');
    });
  });

  describe('lifecycle', () => {
    it('calls onDidDispose callbacks when disposed', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      api.onDidDispose(cb1);
      api.onDidDispose(cb2);

      api._dispose();

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('calls onDidDispose immediately if already disposed', () => {
      api._dispose();
      const cb = vi.fn();
      api.onDidDispose(cb);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('does not dispatch after dispose', () => {
      api._dispose();
      api.setTitle('After Dispose');
      expect(updateHandler).not.toHaveBeenCalled();
    });

    it('handles errors in dispose callbacks gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      api.onDidDispose(() => { throw new Error('test error'); });
      api._dispose(); // Should not throw
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('visibility', () => {
    it('starts visible', () => {
      expect(api.isVisible).toBe(true);
    });

    it('notifies visibility change callbacks', () => {
      const cb = vi.fn();
      api.onDidChangeVisibility(cb);

      api._setVisible(false);
      expect(cb).toHaveBeenCalledWith(false);

      api._setVisible(true);
      expect(cb).toHaveBeenCalledWith(true);
    });

    it('does not notify when visibility unchanged', () => {
      const cb = vi.fn();
      api.onDidChangeVisibility(cb);

      api._setVisible(true); // Already true
      expect(cb).not.toHaveBeenCalled();
    });

    it('handles errors in visibility callbacks gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      api.onDidChangeVisibility(() => { throw new Error('vis error'); });
      api._setVisible(false); // Should not throw
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('double dispose', () => {
    it('is safe to call dispose twice', () => {
      const cb = vi.fn();
      api.onDidDispose(cb);
      api._dispose();
      api._dispose(); // Should not throw or call cb again
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });
});
