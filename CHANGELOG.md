# Changelog

All notable changes to the `@widgetstools/dock-manager` packages will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Auto-inject CSS** — dock manager styles are automatically injected into `<head>` on first mount; no manual CSS import required for React or Angular consumers
- Unit tests for StateHistoryManager (undo/redo) — 15 test cases
- Unit tests for serialization round-trips — 28 test cases
- Regression test for maximize/restore content preservation

### Fixed
- **Maximize/restore content loss** — panel content was lost after maximize then restore due to stale content slot not being reparented back
- **E2e test suite** — fixed port conflict causing all 38 Playwright tests to fail
- Increased icon opacity on panel headers, tab headers, and floating pane headers for better visibility

### Changed
- Default theme changed to Slate Dark in both React and Angular demo apps

## [0.1.4] - 2025-05-20

### Fixed
- Remove `@layer utilities` and inline core CSS for consumer compatibility
- Fix dependency and CSS packaging for React and Angular wrappers
- Fix Angular demo CSS import to use package name instead of relative path

## [0.1.3] - 2025-05-18

### Fixed
- Fix dependency and CSS packaging for wrapper packages

## [0.1.2] - 2025-05-16

### Fixed
- Fix pinned panel remaining in unpinned strip after re-pinning (core bug)
- Fix truncated tab headers for dynamically added panels in Angular demo
- Fix truncated custom tab renderer for dynamically added panels

### Added
- E2e tests for pin/unpin and add-panel scenarios

### Changed
- Replace `lucide-angular` with `@fortawesome/angular-fontawesome` in Angular demo
- Pin Tailwind CSS to 3.4.12 and Vite to 6.0.7 across monorepo

## [0.1.1] - 2025-05-14

### Changed
- Simplify API surface and unify icon system
- Pin Angular packages to published 21.0.0
- Make build scripts cross-platform (Windows compatible)
- Add `npm run setup` script to install dependencies and build all packages

### Fixed
- Fix build warnings in angular-demo and trading-app

## [0.1.0] - 2025-05-12

### Added
- Initial release of `@widgetstools/dock-manager-core`
- Initial release of `@widgetstools/react-dock-manager`
- Initial release of `@widgetstools/angular-dock-manager`
- Tabbed panel layout with drag-and-drop reordering
- Split panes (horizontal and vertical) with resizable splitters
- Floating windows with drag, resize, and dock-back
- Maximize/restore panels
- Pin/unpin (auto-hide) panels with edge strips and flyouts
- 14 built-in themes (7 light, 7 dark)
- Keyboard shortcuts (F11 maximize, Escape restore, arrow navigation)
- Undo/redo state history
- State serialization (JSON, localStorage, URL, file export/import)
- Context menu on tabs (Close, Close Others, Float, Auto Hide, Maximize)
- Custom tab renderers and header action slots
- Panel API (setTitle, setIcon, setBadge, setAttention, setHidden, updateProps)
- ARIA accessibility attributes (roles, labels, keyboard navigation)
- CI pipeline with unit tests (Vitest) and e2e tests (Playwright)
- React demo app and Angular demo app
- Trading app demo with real-world layout
