import type { PanelConfig } from '../types/dock';

type DisposeCallback = () => void;
type VisibilityCallback = (visible: boolean) => void;
type ActiveCallback = (active: boolean) => void;
export interface PanelDimensions { width: number; height: number; }
type DimensionsCallback = (dims: PanelDimensions) => void;

export class PanelApi {
  readonly panelId: string;
  private _disposed = false;
  private _visible = true;
  private _active = false;
  private _dimensions: PanelDimensions = { width: 0, height: 0 };
  private _disposeCallbacks: DisposeCallback[] = [];
  private _visibilityCallbacks: VisibilityCallback[] = [];
  private _activeCallbacks: ActiveCallback[] = [];
  private _dimensionsCallbacks: DimensionsCallback[] = [];
  private _onUpdateConfig: ((panelId: string, updates: Partial<PanelConfig>) => void) | null = null;
  private _onRequestAttention: ((panelId: string, attention: boolean) => void) | null = null;
  private _getConfig: (() => PanelConfig | undefined) | null = null;

  constructor(panelId: string) { this.panelId = panelId; }

  get widgetType(): string { return this._getConfig?.()?.widgetType || ''; }
  get widgetProps(): Record<string, unknown> { return this._getConfig?.()?.widgetProps || {}; }
  getTitle(): string { return this._getConfig?.()?.title || ''; }
  setTitle(title: string): void { this._updateConfig({ title }); }
  setIcon(icon: string | null): void { this._updateConfig({ icon: icon || undefined }); }
  setBadge(badge: string | null): void { this._updateConfig({ badge }); }
  setAttention(attention: boolean): void { this._onRequestAttention?.(this.panelId, attention); }
  setHidden(hidden: boolean): void { this._updateConfig({ hidden }); }
  get isHidden(): boolean { return this._getConfig?.()?.hidden || false; }

  updateProps(props: Partial<Record<string, unknown>>): void {
    const current = this._getConfig?.()?.widgetProps || {};
    this._updateConfig({ widgetProps: { ...current, ...props } });
  }

  onDidDispose(callback: DisposeCallback): void {
    if (this._disposed) { callback(); return; }
    this._disposeCallbacks.push(callback);
  }
  onDidChangeVisibility(callback: VisibilityCallback): void { this._visibilityCallbacks.push(callback); }
  get isVisible(): boolean { return this._visible; }
  onDidChangeActive(callback: ActiveCallback): void { this._activeCallbacks.push(callback); }
  get isActive(): boolean { return this._active; }
  onDidChangeDimensions(callback: DimensionsCallback): void { this._dimensionsCallbacks.push(callback); }
  get dimensions(): PanelDimensions { return this._dimensions; }

  _setConfigAccessor(getConfig: () => PanelConfig | undefined): void { this._getConfig = getConfig; }
  _setUpdateHandler(handler: (panelId: string, updates: Partial<PanelConfig>) => void): void { this._onUpdateConfig = handler; }
  _setAttentionHandler(handler: (panelId: string, attention: boolean) => void): void { this._onRequestAttention = handler; }

  private _notifyCallbacks<T>(callbacks: ((arg: T) => void)[], arg: T, label: string): void {
    callbacks.forEach(cb => { try { cb(arg); } catch (e) { console.error(`PanelApi ${label} callback error:`, e); } });
  }

  _setVisible(visible: boolean): void {
    if (this._visible === visible) return;
    this._visible = visible;
    this._notifyCallbacks(this._visibilityCallbacks, visible, 'visibility');
  }

  _setActive(active: boolean): void {
    if (this._active === active) return;
    this._active = active;
    this._notifyCallbacks(this._activeCallbacks, active, 'active');
  }

  _setDimensions(dims: PanelDimensions): void {
    if (this._dimensions.width === dims.width && this._dimensions.height === dims.height) return;
    this._dimensions = dims;
    this._notifyCallbacks(this._dimensionsCallbacks, dims, 'dimensions');
  }

  _dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._disposeCallbacks.forEach(cb => { try { cb(); } catch (e) { console.error('PanelApi dispose callback error:', e); } });
    this._disposeCallbacks = [];
    this._visibilityCallbacks = [];
    this._activeCallbacks = [];
    this._dimensionsCallbacks = [];
    this._onUpdateConfig = null;
    this._onRequestAttention = null;
    this._getConfig = null;
  }

  private _updateConfig(updates: Partial<PanelConfig>): void {
    if (this._disposed) return;
    this._onUpdateConfig?.(this.panelId, updates);
  }
}
