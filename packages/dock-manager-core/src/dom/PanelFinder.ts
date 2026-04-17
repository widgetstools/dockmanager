/**
 * PanelFinder — Modal overlay with search input for finding and activating panels.
 *
 * Triggered by Ctrl+P. Lists all panels (docked, floating, unpinned) filtered
 * by title. Clicking an item activates that panel.
 */

import type { DockManagerState } from '../types/dock';

export interface PanelFinderOptions {
  /** The container element to append the overlay to. */
  containerElement: HTMLElement;
  /** Returns the current dock manager state. */
  getState: () => DockManagerState;
  /** Called when a panel is selected. */
  onActivatePanel: (panelId: string) => void;
}

export class PanelFinder {
  private options: PanelFinderOptions;
  private overlayEl: HTMLDivElement | null = null;
  private isOpen = false;

  constructor(options: PanelFinderOptions) {
    this.options = options;
  }

  /** Toggle the panel finder modal. */
  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /** Open the panel finder modal. */
  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    const overlay = document.createElement('div');
    overlay.className = 'dock-panel-finder-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;z-index:10020;display:flex;align-items:flex-start;justify-content:center;padding-top:60px;background:rgba(0,0,0,0.2);';

    const modal = document.createElement('div');
    modal.className = 'dock-panel-finder';
    modal.style.cssText = 'width:340px;max-height:400px;background:hsl(var(--dock-surface));border:1px solid hsl(var(--dock-border));border-radius:6px;box-shadow:0 8px 32px rgba(0,0,0,0.2);display:flex;flex-direction:column;overflow:hidden;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search panels...';
    input.style.cssText = 'padding:10px 12px;border:none;border-bottom:1px solid hsl(var(--dock-border));background:transparent;color:hsl(var(--dock-text));font-size:13px;outline:none;';
    modal.appendChild(input);

    const list = document.createElement('div');
    list.style.cssText = 'overflow-y:auto;max-height:320px;padding:4px 0;';
    modal.appendChild(list);

    overlay.appendChild(modal);
    this.options.containerElement.appendChild(overlay);
    this.overlayEl = overlay;

    // Populate list
    const renderList = (filter: string) => {
      list.innerHTML = '';
      const state = this.options.getState();
      const panelIds = Array.from(state.panels.keys());
      const lowerFilter = filter.toLowerCase();

      for (const pid of panelIds) {
        const panel = state.panels.get(pid);
        if (!panel) continue;
        if (lowerFilter && !panel.title.toLowerCase().includes(lowerFilter)) continue;

        const item = document.createElement('div');
        item.className = 'dock-panel-finder-item';
        item.style.cssText = 'padding:6px 12px;cursor:pointer;font-size:12px;color:hsl(var(--dock-text));transition:background 0.1s;';
        item.textContent = panel.title;
        item.setAttribute('data-panel-id', pid);

        // Indicate placement
        const placement = state.placements.get(pid);
        const isFloating = placement?.type === 'floating';
        const isUnpinned = placement?.type === 'unpinned';
        if (isFloating || isUnpinned) {
          const badge = document.createElement('span');
          badge.style.cssText = 'margin-left:8px;font-size:10px;opacity:0.6;';
          badge.textContent = isFloating ? '(floating)' : '(unpinned)';
          item.appendChild(badge);
        }

        item.addEventListener('mouseenter', () => {
          item.style.background = 'hsl(var(--dock-hover))';
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = '';
        });
        item.addEventListener('click', () => {
          this.options.onActivatePanel(pid);
          this.close();
        });

        list.appendChild(item);
      }
    };

    renderList('');
    input.addEventListener('input', () => renderList(input.value));

    // Close on overlay click
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.close();
    });

    // Close on escape
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    overlay.addEventListener('keydown', onKeyDown);

    // Focus input
    requestAnimationFrame(() => input.focus());
  }

  /** Close the panel finder modal. */
  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
  }

  dispose(): void {
    this.close();
  }
}
