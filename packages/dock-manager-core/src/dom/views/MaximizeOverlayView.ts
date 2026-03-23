import type { PanelConfig } from '../../types/dock';
import { iconRestore } from '../icons';

// ─── Interfaces ──────────────────────────────────────────────────────

export interface IDisposable {
  dispose(): void;
}

export interface MaximizeOverlayViewCallbacks {
  onRestorePanel: (panelId: string) => void;
  createContent: (panelId: string, container: HTMLElement) => IDisposable;
}

// ─── MaximizeOverlayView ─────────────────────────────────────────────

/**
 * Full-screen overlay shown when a panel is maximized.
 * Contains a title bar with restore button and a content area.
 */
export class MaximizeOverlayView {
  readonly element: HTMLDivElement;

  private panelId: string;
  private panel: PanelConfig;
  private callbacks: MaximizeOverlayViewCallbacks;

  // Content management
  private contentDisposable: IDisposable | null = null;

  constructor(
    panelId: string,
    panel: PanelConfig,
    callbacks: MaximizeOverlayViewCallbacks,
  ) {
    this.panelId = panelId;
    this.panel = panel;
    this.callbacks = callbacks;

    // Root overlay
    this.element = document.createElement('div');
    this.element.style.cssText =
      'position:absolute;inset:0;z-index:9000;display:flex;flex-direction:column;background:hsl(var(--dock-surface));';

    // Title bar
    const headerEl = document.createElement('div');
    headerEl.className = 'dock-panel-header';
    headerEl.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;min-height:32px;padding:0 12px;flex-shrink:0;border-bottom:1px solid hsl(var(--dock-border));background:hsl(var(--dock-panel-header));';

    const titleSpan = document.createElement('span');
    titleSpan.style.cssText = 'font-size:12px;font-weight:500;color:hsl(var(--dock-text));user-select:none;';
    if (panel.icon) {
      const iconSpan = document.createElement('span');
      iconSpan.style.marginRight = '4px';
      iconSpan.textContent = panel.icon;
      titleSpan.appendChild(iconSpan);
    }
    const textNode = document.createTextNode(panel.title);
    titleSpan.appendChild(textNode);
    headerEl.appendChild(titleSpan);

    // Restore button
    const restoreBtn = document.createElement('button');
    restoreBtn.setAttribute('data-action', 'restore');
    restoreBtn.setAttribute('data-panel-id', panelId);
    restoreBtn.style.cssText =
      'padding:4px;color:hsl(var(--dock-text-muted));cursor:pointer;background:none;border:none;display:flex;align-items:center;transition:color 0.15s;';
    restoreBtn.title = 'Restore';
    restoreBtn.innerHTML = iconRestore();
    restoreBtn.addEventListener('mouseenter', () => { restoreBtn.style.color = 'hsl(var(--dock-text))'; });
    restoreBtn.addEventListener('mouseleave', () => { restoreBtn.style.color = 'hsl(var(--dock-text-muted))'; });
    headerEl.appendChild(restoreBtn);

    this.element.appendChild(headerEl);

    // Content area
    const contentEl = document.createElement('div');
    contentEl.style.cssText = 'flex:1;position:relative;overflow:hidden;';
    this.element.appendChild(contentEl);

    // Mount content
    this.contentDisposable = this.callbacks.createContent(panelId, contentEl);
  }

  dispose(): void {
    if (this.contentDisposable) {
      this.contentDisposable.dispose();
      this.contentDisposable = null;
    }
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
