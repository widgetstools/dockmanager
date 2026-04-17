/**
 * Thin Angular wrapper around the core DockviewComponent.
 *
 * All DOM rendering, event handling, and layout logic lives in core.
 * Angular only provides panel content via dynamic component creation.
 *
 * Zoneless: Uses ChangeDetectorRef.markForCheck() instead of NgZone.
 * Compatible with both zone.js and zoneless (provideZonelessChangeDetection).
 */
import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ApplicationRef,
  EnvironmentInjector,
  Type,
  createComponent,
} from '@angular/core';
import type {
  DockManagerState,
  DockPosition,
  PreventableDockEvent,
  DockviewComponentOptions,
  IDisposable,
  DockTheme,
} from '@widgetstools/dock-manager-core';
import {
  DockviewComponent,
  DockviewApi,
  PanelApi,
} from '@widgetstools/dock-manager-core';
import type { DockAction } from '@widgetstools/dock-manager-core';

/**
 * Content renderer function type.
 * Called by the core when a panel needs content.
 * @param api - PanelApi instance for widget-to-header communication.
 * Returns a dispose function to clean up when the panel is hidden/removed.
 */
export type ContentRenderer = (panelId: string, container: HTMLElement, api: PanelApi) => IDisposable;
export type TabRenderer = (panelId: string, container: HTMLElement, isActive: boolean) => IDisposable;
export type HeaderActionsRenderer = (slot: 'left' | 'right' | 'prefix', tabGroupId: string, container: HTMLElement) => IDisposable;
export type WatermarkRenderer = (container: HTMLElement) => IDisposable;

@Component({
  selector: 'dock-manager-core',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #container style="width:100%;height:100%"></div>`,
  styles: [`:host { display: block; width: 100%; height: 100%; overflow: hidden; }`],
})
export class DockManagerCoreComponent implements AfterViewInit, OnDestroy, OnChanges {
  /** Initial state for the dock manager */
  @Input() initialState!: DockManagerState;

  /**
   * Widget registry: maps panel.widgetType strings to Angular component classes.
   * When provided, panels are automatically rendered using createComponent().
   * Each widget component should accept `api` and `panel` inputs.
   */
  @Input() widgets?: Record<string, Type<any>>;

  /** Content renderer — called when a panel needs content mounted into a container.
   *  Used as fallback when `widgets` registry doesn't match the panel's widgetType. */
  @Input() createContent?: ContentRenderer;

  /** Optional custom tab renderer */
  @Input() createTab?: TabRenderer;

  /** Optional header actions renderer */
  @Input() createHeaderActions?: HeaderActionsRenderer;

  /** Optional watermark renderer for empty tab groups */
  @Input() createWatermark?: WatermarkRenderer;

  /** Theme: 'light', 'dark', or a DockTheme object */
  @Input() theme: 'light' | 'dark' | DockTheme = 'light';

  /** Whether to show edge dock indicators. Defaults to true. */
  @Input() allowRootDock?: boolean;

  /** Emits when the dock manager is initialized with the DockviewApi for programmatic control */
  @Output() ready = new EventEmitter<DockviewApi>();

  /** Emits when state changes */
  @Output() stateChange = new EventEmitter<DockManagerState>();

  /** Emits before a panel close (preventable) */
  @Output() willClose = new EventEmitter<{ event: PreventableDockEvent; panelId: string }>();

  /** Emits before a drop (preventable) */
  @Output() willDrop = new EventEmitter<{
    event: PreventableDockEvent;
    sourceId: string;
    targetId: string;
    position: DockPosition;
  }>();

  /** Emits when the user explicitly saves the layout via context menu */
  @Output() saveLayout = new EventEmitter<DockManagerState>();

  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  private dock: DockviewComponent | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private appRef: ApplicationRef,
    private envInjector: EnvironmentInjector,
  ) {}

  ngAfterViewInit(): void {
    const options: DockviewComponentOptions = {
      initialState: this.initialState,
      theme: this.theme,
      allowRootDock: this.allowRootDock,

      createContent: (panelId: string, container: HTMLElement, api: PanelApi): IDisposable => {
        // Try widget registry first
        // Note: this.dock may be null during initial construction, so fall back to initialState
        const state = this.dock?.getState() ?? this.initialState;
        const panel = state?.panels[panelId];
        const widgetType = panel?.widgetType || '';
        const WidgetClass = this.widgets?.[widgetType];

        if (WidgetClass) {
          return this.mountComponent(WidgetClass, container, api, panel);
        }

        // Fall back to createContent callback
        if (this.createContent) {
          const disposable = this.createContent(panelId, container, api);
          this.cdr.markForCheck();
          return disposable;
        }

        // Nothing to render
        return { dispose: () => {} };
      },

      createTab: this.createTab
        ? (panelId: string, container: HTMLElement, isActive: boolean): IDisposable => {
            const disposable = this.createTab!(panelId, container, isActive);
            this.cdr.markForCheck();
            return disposable;
          }
        : undefined,

      createHeaderActions: this.createHeaderActions
        ? (slot, tabGroupId, container): IDisposable => {
            const disposable = this.createHeaderActions!(slot, tabGroupId, container);
            this.cdr.markForCheck();
            return disposable;
          }
        : undefined,

      createWatermark: this.createWatermark
        ? (container): IDisposable => {
            const disposable = this.createWatermark!(container);
            this.cdr.markForCheck();
            return disposable;
          }
        : undefined,

      onStateChange: (state: DockManagerState) => {
        this.stateChange.emit(state);
        this.cdr.markForCheck();
      },

      onWillClose: (event: PreventableDockEvent, panelId: string) => {
        this.willClose.emit({ event, panelId });
        this.cdr.markForCheck();
      },

      onWillDrop: (event, sourceId, targetId, position) => {
        this.willDrop.emit({ event, sourceId, targetId, position });
        this.cdr.markForCheck();
      },

      onSaveLayout: (state: DockManagerState) => {
        this.saveLayout.emit(state);
        this.cdr.markForCheck();
      },
    };

    this.dock = new DockviewComponent(this.containerRef.nativeElement, options);

    // Emit the API for easy programmatic access
    this.ready.emit(this.dock.api);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.dock) return;
    const updates: Partial<DockviewComponentOptions> = {};
    if (changes['theme'] && !changes['theme'].firstChange) updates.theme = this.theme;
    if (changes['allowRootDock'] && !changes['allowRootDock'].firstChange) updates.allowRootDock = this.allowRootDock;
    if (Object.keys(updates).length > 0) this.dock.updateOptions(updates);
  }

  ngOnDestroy(): void {
    this.dock?.dispose();
    this.dock = null;
  }

  /** Dispatch an action to the dock manager */
  dispatch(action: DockAction): void {
    this.dock?.dispatch(action);
  }

  /** Get current state */
  getState(): DockManagerState | null {
    return this.dock?.getState() ?? null;
  }

  /** Get the underlying DockviewComponent instance */
  getInstance(): DockviewComponent | null {
    return this.dock;
  }

  /** Get the DockviewApi for programmatic control */
  getApi(): DockviewApi | null {
    return this.dock?.api ?? null;
  }

  /** Mount an Angular component into a container element */
  private mountComponent(componentClass: Type<any>, container: HTMLElement, api: PanelApi, panel: any): IDisposable {
    const hostEl = document.createElement('div');
    hostEl.style.cssText = 'width:100%;height:100%;color:inherit';
    container.appendChild(hostEl);

    const ref = createComponent(componentClass, {
      hostElement: hostEl,
      environmentInjector: this.envInjector,
    });

    ref.setInput('api', api);
    ref.setInput('panel', panel);

    this.appRef.attachView(ref.hostView);
    queueMicrotask(() => ref.changeDetectorRef.detectChanges());

    return {
      dispose: () => {
        this.appRef.detachView(ref.hostView);
        ref.destroy();
        container.innerHTML = '';
      },
    };
  }
}
