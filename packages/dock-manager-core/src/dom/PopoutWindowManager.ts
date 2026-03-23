/**
 * PopoutWindowManager manages browser popout windows for dock panels.
 * It handles opening new windows via window.open(), copying stylesheets,
 * and providing lifecycle callbacks for when windows are closed.
 */

export interface PopoutWindowOptions {
  /** Unique name for the window (used as window.name) */
  windowName: string;
  /** Window title */
  title: string;
  /** Initial x position */
  x?: number;
  /** Initial y position */
  y?: number;
  /** Initial width */
  width?: number;
  /** Initial height */
  height?: number;
  /** Called when the popout window is closed by the user */
  onDidClose?: (windowName: string) => void;
  /** Called when the window moves or resizes */
  onDidResize?: (windowName: string, x: number, y: number, width: number, height: number) => void;
}

export interface PopoutWindowHandle {
  /** The window name */
  windowName: string;
  /** The opened window reference */
  window: Window;
  /** The container element inside the popout window for rendering content */
  container: HTMLElement;
  /** Close the popout window programmatically */
  close(): void;
}

export class PopoutWindowManager {
  private windows = new Map<string, PopoutWindowHandle>();
  private pollIntervals = new Map<string, number>();

  /** Open a new popout window */
  open(options: PopoutWindowOptions): PopoutWindowHandle | null {
    const {
      windowName,
      title,
      x = 100,
      y = 100,
      width = 400,
      height = 300,
      onDidClose,
      onDidResize,
    } = options;

    // If already open, focus and return existing
    const existing = this.windows.get(windowName);
    if (existing && !existing.window.closed) {
      existing.window.focus();
      return existing;
    }

    const features = [
      `left=${x}`,
      `top=${y}`,
      `width=${width}`,
      `height=${height}`,
      'menubar=no',
      'toolbar=no',
      'location=no',
      'status=no',
      'resizable=yes',
      'scrollbars=no',
    ].join(',');

    const popoutWindow = window.open('about:blank', windowName, features);
    if (!popoutWindow) {
      console.warn('PopoutWindowManager: failed to open window (popup blocked?)');
      return null;
    }

    // Set up the document
    popoutWindow.document.title = title;

    // Copy stylesheets from the parent window
    this.copyStylesheets(popoutWindow);

    // Create a container div for React portal rendering
    const container = popoutWindow.document.createElement('div');
    container.id = 'popout-root';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.overflow = 'hidden';
    popoutWindow.document.body.style.margin = '0';
    popoutWindow.document.body.style.padding = '0';
    popoutWindow.document.body.style.overflow = 'hidden';
    popoutWindow.document.body.appendChild(container);

    const handle: PopoutWindowHandle = {
      windowName,
      window: popoutWindow,
      container,
      close: () => {
        popoutWindow.close();
      },
    };

    this.windows.set(windowName, handle);

    // Poll for window close and resize
    const pollId = window.setInterval(() => {
      if (popoutWindow.closed) {
        this.cleanupWindow(windowName);
        onDidClose?.(windowName);
        return;
      }
      // Check for resize/move
      if (onDidResize) {
        const screenX = popoutWindow.screenX ?? popoutWindow.screenLeft;
        const screenY = popoutWindow.screenY ?? popoutWindow.screenTop;
        const outerW = popoutWindow.outerWidth;
        const outerH = popoutWindow.outerHeight;
        onDidResize(windowName, screenX, screenY, outerW, outerH);
      }
    }, 500);

    this.pollIntervals.set(windowName, pollId);

    // Also handle beforeunload
    popoutWindow.addEventListener('beforeunload', () => {
      // Will be cleaned up by the poll interval
    });

    return handle;
  }

  /** Get an existing window handle */
  get(windowName: string): PopoutWindowHandle | null {
    const handle = this.windows.get(windowName);
    if (handle && !handle.window.closed) return handle;
    return null;
  }

  /** Close a specific popout window */
  close(windowName: string): void {
    const handle = this.windows.get(windowName);
    if (handle && !handle.window.closed) {
      handle.window.close();
    }
    this.cleanupWindow(windowName);
  }

  /** Close all popout windows and clean up */
  dispose(): void {
    for (const [name] of this.windows) {
      this.close(name);
    }
    this.windows.clear();
    this.pollIntervals.clear();
  }

  /** Get all open window names */
  getOpenWindowNames(): string[] {
    const names: string[] = [];
    for (const [name, handle] of this.windows) {
      if (!handle.window.closed) {
        names.push(name);
      }
    }
    return names;
  }

  private cleanupWindow(windowName: string): void {
    const pollId = this.pollIntervals.get(windowName);
    if (pollId !== undefined) {
      window.clearInterval(pollId);
      this.pollIntervals.delete(windowName);
    }
    this.windows.delete(windowName);
  }

  /** Copy all stylesheets from the parent window to the popout window */
  private copyStylesheets(targetWindow: Window): void {
    const parentDoc = document;
    const targetDoc = targetWindow.document;

    // Copy <style> elements
    const styles = parentDoc.querySelectorAll('style');
    styles.forEach((style) => {
      const newStyle = targetDoc.createElement('style');
      newStyle.textContent = style.textContent;
      targetDoc.head.appendChild(newStyle);
    });

    // Copy <link rel="stylesheet"> elements
    const links = parentDoc.querySelectorAll('link[rel="stylesheet"]');
    links.forEach((link) => {
      const newLink = targetDoc.createElement('link');
      newLink.rel = 'stylesheet';
      newLink.href = (link as HTMLLinkElement).href;
      if ((link as HTMLLinkElement).crossOrigin) {
        newLink.crossOrigin = (link as HTMLLinkElement).crossOrigin;
      }
      targetDoc.head.appendChild(newLink);
    });

    // Copy the class from <html> element (for dark mode etc.)
    targetDoc.documentElement.className = parentDoc.documentElement.className;
  }
}
