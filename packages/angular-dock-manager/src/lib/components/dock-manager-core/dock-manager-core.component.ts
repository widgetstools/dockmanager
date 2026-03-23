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

  /** Content renderer — called when a panel needs content mounted into a container */
  @Input() createContent!: ContentRenderer;

  /** Optional custom tab renderer */
  @Input() createTab?: TabRenderer;

  /** Optional header actions renderer */
  @Input() createHeaderActions?: HeaderActionsRenderer;

  /** Theme: 'light', 'dark', or a DockTheme object */
  @Input() theme: 'light' | 'dark' | DockTheme = 'light';

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

  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  private dock: DockviewComponent | null = null;

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    const options: DockviewComponentOptions = {
      initialState: this.initialState,
      theme: this.theme,

      createContent: (panelId: string, container: HTMLElement, api: PanelApi): IDisposable => {
        const disposable = this.createContent(panelId, container, api);
        this.cdr.markForCheck();
        return disposable;
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
    };

    this.dock = new DockviewComponent(this.containerRef.nativeElement, options);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['theme'] && !changes['theme'].firstChange && this.dock) {
      this.dock.updateOptions({ theme: this.theme });
    }
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
}
