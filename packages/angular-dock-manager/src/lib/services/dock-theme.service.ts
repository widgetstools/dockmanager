import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type ThemeMode = 'light' | 'dark' | 'system';

@Injectable({
  providedIn: 'root',
})
export class DockThemeService {
  private themeModeSubject = new BehaviorSubject<ThemeMode>('light');
  private mediaQueryList: MediaQueryList | null = null;
  private mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;

  themeMode$: Observable<ThemeMode> = this.themeModeSubject.asObservable();

  constructor() {
    this.initializeSystemModeListener();
  }

  setThemeMode(mode: ThemeMode): void {
    this.themeModeSubject.next(mode);
    this.applyTheme(mode);
  }

  getThemeMode(): ThemeMode {
    return this.themeModeSubject.getValue();
  }

  private applyTheme(mode: ThemeMode): void {
    const root = document.documentElement;
    const isDark = mode === 'dark' || (mode === 'system' && this.isSystemDark());

    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }

  private isSystemDark(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private initializeSystemModeListener(): void {
    if (typeof window === 'undefined') return;

    try {
      this.mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaQueryListener = (e) => {
        const currentMode = this.themeModeSubject.getValue();
        if (currentMode === 'system') {
          this.applyTheme('system');
        }
      };
      this.mediaQueryList.addEventListener('change', this.mediaQueryListener);
    } catch (e) {
      console.warn('System theme detection not supported', e);
    }
  }

  ngOnDestroy(): void {
    if (this.mediaQueryList && this.mediaQueryListener) {
      this.mediaQueryList.removeEventListener('change', this.mediaQueryListener);
    }
  }
}
