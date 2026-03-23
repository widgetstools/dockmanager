/**
 * PanelApi — Per-panel API for widget-to-header communication.
 *
 * Each panel receives a PanelApi instance via the `createContent` callback.
 * Widgets use this API to manipulate their own pane header at runtime
 * (change title, add icons, show badges, request attention).
 *
 * All changes are reflected in the state (PanelConfig) so they persist
 * across serialization/deserialization.
 */

import type { PanelConfig } from '../types/dock';

// ─── Callback types ──────────────────────────────────────────────────

type DisposeCallback = () => void;
type VisibilityCallback = (visible: boolean) => void;

// ─── PanelApi ────────────────────────────────────────────────────────

export class PanelApi {
  /** Panel identity (read-only) */
  readonly panelId: string;

  // Internal state
  private _disposed = false;
  private _visible = true;
  private _disposeCallbacks: DisposeCallback[] = [];
  private _visibilityCallbacks: VisibilityCallback[] = [];

  // External hooks (set by DockviewComponent)
  private _onUpdateConfig: ((panelId: string, updates: Partial<PanelConfig>) => void) | null = null;
  private _onRequestAttention: ((panelId: string, attention: boolean) => void) | null = null;
  private _getConfig: (() => PanelConfig | undefined) | null = null;

  constructor(panelId: string) {
    this.panelId = panelId;
  }

  // ── Configuration accessors ────────────────────────────────────────

  /** Get the widget type string */
  get widgetType(): string {
    return this._getConfig?.()?.widgetType || '';
  }

  /** Get the widget props */
  get widgetProps(): Record<string, unknown> {
    return this._getConfig?.()?.widgetProps || {};
  }

  // ── Header manipulation ────────────────────────────────────────────

  /** Get the current panel title */
  getTitle(): string {
    return this._getConfig?.()?.title || '';
  }

  /** Set the panel title (updates tab header text) */
  setTitle(title: string): void {
    this._updateConfig({ title });
  }

  /** Set the panel icon (prefix before title text) */
  setIcon(icon: string | null): void {
    this._updateConfig({ icon: icon || undefined });
  }

  /**
   * Set a badge on the panel tab (notification count, unsaved dot, etc.)
   * @param badge - Badge text (e.g. "3", "!", "●"), or null to clear
   */
  setBadge(badge: string | null): void {
    this._updateConfig({ badge });
  }

  /**
   * Request attention for this panel (triggers a CSS pulse animation on the tab).
   * Call with `false` to clear the attention state.
   */
  setAttention(attention: boolean): void {
    this._onRequestAttention?.(this.panelId, attention);
  }

  /** Set the hidden state (hide without removing from layout) */
  setHidden(hidden: boolean): void {
    this._updateConfig({ hidden });
  }

  /** Check if the panel is currently hidden */
  get isHidden(): boolean {
    return this._getConfig?.()?.hidden || false;
  }

  // ── Widget props ───────────────────────────────────────────────────

  /**
   * Update widget props (partial merge). Triggers state update + re-serialization.
   * @param props - Partial props to merge into existing widgetProps
   */
  updateProps(props: Partial<Record<string, unknown>>): void {
    const current = this._getConfig?.()?.widgetProps || {};
    this._updateConfig({ widgetProps: { ...current, ...props } });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  /** Register a callback to be called when the panel is closed/disposed */
  onDidDispose(callback: DisposeCallback): void {
    if (this._disposed) {
      callback(); // Already disposed — call immediately
      return;
    }
    this._disposeCallbacks.push(callback);
  }

  /** Register a callback for visibility changes (hidden/shown) */
  onDidChangeVisibility(callback: VisibilityCallback): void {
    this._visibilityCallbacks.push(callback);
  }

  /** Check if the panel content is currently visible */
  get isVisible(): boolean {
    return this._visible;
  }

  // ── Internal methods (called by DockviewComponent) ─────────────────

  /** @internal Set the config accessor */
  _setConfigAccessor(getConfig: () => PanelConfig | undefined): void {
    this._getConfig = getConfig;
  }

  /** @internal Set the update handler */
  _setUpdateHandler(handler: (panelId: string, updates: Partial<PanelConfig>) => void): void {
    this._onUpdateConfig = handler;
  }

  /** @internal Set the attention handler */
  _setAttentionHandler(handler: (panelId: string, attention: boolean) => void): void {
    this._onRequestAttention = handler;
  }

  /** @internal Notify visibility change */
  _setVisible(visible: boolean): void {
    if (this._visible === visible) return;
    this._visible = visible;
    this._visibilityCallbacks.forEach(cb => {
      try { cb(visible); } catch (e) { console.error('PanelApi visibility callback error:', e); }
    });
  }

  /** @internal Dispose this API (called when panel is closed) */
  _dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._disposeCallbacks.forEach(cb => {
      try { cb(); } catch (e) { console.error('PanelApi dispose callback error:', e); }
    });
    this._disposeCallbacks = [];
    this._visibilityCallbacks = [];
    this._onUpdateConfig = null;
    this._onRequestAttention = null;
    this._getConfig = null;
  }

  // ── Private ────────────────────────────────────────────────────────

  private _updateConfig(updates: Partial<PanelConfig>): void {
    if (this._disposed) return;
    this._onUpdateConfig?.(this.panelId, updates);
  }
}
