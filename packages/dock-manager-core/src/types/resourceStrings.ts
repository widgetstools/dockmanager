/**
 * Resource strings for localization of dock manager UI elements.
 *
 * Consumers can provide partial overrides via `DockviewComponentOptions.resourceStrings`.
 */

export interface DockResourceStrings {
  close: string;
  closeOthers: string;
  closeAll: string;
  float: string;
  pin: string;
  unpin: string;
  maximize: string;
  restore: string;
  dock: string;
}

export const defaultResourceStrings: DockResourceStrings = {
  close: 'Close',
  closeOthers: 'Close Others',
  closeAll: 'Close All',
  float: 'Float',
  pin: 'Pin',
  unpin: 'Unpin',
  maximize: 'Maximize',
  restore: 'Restore',
  dock: 'Dock',
};
