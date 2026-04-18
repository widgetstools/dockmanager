export interface PopoutWindowOptions {
  windowName: string;
  title: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  onDidClose?: (windowName: string) => void;
  onDidResize?: (windowName: string, x: number, y: number, width: number, height: number) => void;
}

export interface PopoutWindowHandle {
  windowName: string;
  window: Window;
  container: HTMLElement;
  close(): void;
}

export class PopoutWindowManager {
  private windows = new Map<string, PopoutWindowHandle>();
  private pollIntervals = new Map<string, number>();

  open(options: PopoutWindowOptions): PopoutWindowHandle | null {
    const { windowName, title, x = 100, y = 100, width = 400, height = 300, onDidClose, onDidResize } = options;

    const existing = this.windows.get(windowName);
    if (existing && !existing.window.closed) { existing.window.focus(); return existing; }

    const features = `left=${x},top=${y},width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no`;
    const popoutWindow = window.open('about:blank', windowName, features);
    if (!popoutWindow) { console.warn('PopoutWindowManager: failed to open window (popup blocked?)'); return null; }

    popoutWindow.document.title = title;
    this.copyStylesheets(popoutWindow);

    const container = popoutWindow.document.createElement('div');
    container.id = 'popout-root';
    container.style.cssText = 'width:100%;height:100%;overflow:hidden;';
    Object.assign(popoutWindow.document.body.style, { margin: '0', padding: '0', overflow: 'hidden' });
    popoutWindow.document.body.appendChild(container);

    const handle: PopoutWindowHandle = { windowName, window: popoutWindow, container, close: () => popoutWindow.close() };
    this.windows.set(windowName, handle);

    const pollId = window.setInterval(() => {
      if (popoutWindow.closed) { this.cleanupWindow(windowName); onDidClose?.(windowName); return; }
      if (onDidResize) {
        onDidResize(windowName, popoutWindow.screenX ?? popoutWindow.screenLeft,
          popoutWindow.screenY ?? popoutWindow.screenTop, popoutWindow.outerWidth, popoutWindow.outerHeight);
      }
    }, 500);
    this.pollIntervals.set(windowName, pollId);
    popoutWindow.addEventListener('beforeunload', () => {});
    return handle;
  }

  get(windowName: string): PopoutWindowHandle | null {
    const handle = this.windows.get(windowName);
    return handle && !handle.window.closed ? handle : null;
  }

  close(windowName: string): void {
    const handle = this.windows.get(windowName);
    if (handle && !handle.window.closed) handle.window.close();
    this.cleanupWindow(windowName);
  }

  dispose(): void {
    for (const [name] of this.windows) this.close(name);
    this.windows.clear();
    this.pollIntervals.clear();
  }

  getOpenWindowNames(): string[] {
    return Array.from(this.windows.entries())
      .filter(([, h]) => !h.window.closed)
      .map(([name]) => name);
  }

  private cleanupWindow(windowName: string): void {
    const pollId = this.pollIntervals.get(windowName);
    if (pollId !== undefined) { window.clearInterval(pollId); this.pollIntervals.delete(windowName); }
    this.windows.delete(windowName);
  }

  private copyStylesheets(targetWindow: Window): void {
    const targetDoc = targetWindow.document;
    document.querySelectorAll('style').forEach((style) => {
      const s = targetDoc.createElement('style');
      s.textContent = style.textContent;
      targetDoc.head.appendChild(s);
    });
    document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const l = targetDoc.createElement('link');
      l.rel = 'stylesheet';
      l.href = (link as HTMLLinkElement).href;
      if ((link as HTMLLinkElement).crossOrigin) l.crossOrigin = (link as HTMLLinkElement).crossOrigin;
      targetDoc.head.appendChild(l);
    });
    targetDoc.documentElement.className = document.documentElement.className;
  }
}
