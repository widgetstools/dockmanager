/**
 * StateHistoryManager — Maintains an undo/redo stack for dock manager state.
 *
 * Keeps the last N states (default 20) and provides undo/redo operations.
 * Used by DockviewComponent to enable Ctrl+Z / Ctrl+Shift+Z support.
 */

import type { DockManagerState } from '../types/dock';

const DEFAULT_MAX_HISTORY = 20;

export class StateHistoryManager {
  private undoStack: DockManagerState[] = [];
  private redoStack: DockManagerState[] = [];
  private maxHistory: number;

  constructor(maxHistory: number = DEFAULT_MAX_HISTORY) {
    this.maxHistory = maxHistory;
  }

  /**
   * Push a state onto the undo stack. Clears the redo stack.
   * Call this BEFORE applying a mutation so the previous state can be restored.
   */
  push(state: DockManagerState): void {
    this.undoStack.push(state);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    // Any new mutation invalidates the redo stack
    this.redoStack = [];
  }

  /** Whether there are states to undo to. */
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Whether there are states to redo to. */
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Undo: pop from undo stack, push current state to redo stack.
   * @param currentState - The current state before undoing (will be pushed to redo stack).
   * @returns The previous state to restore, or null if nothing to undo.
   */
  undo(currentState: DockManagerState): DockManagerState | null {
    if (this.undoStack.length === 0) return null;
    this.redoStack.push(currentState);
    return this.undoStack.pop()!;
  }

  /**
   * Redo: pop from redo stack, push current state to undo stack.
   * @param currentState - The current state before redoing (will be pushed to undo stack).
   * @returns The next state to restore, or null if nothing to redo.
   */
  redo(currentState: DockManagerState): DockManagerState | null {
    if (this.redoStack.length === 0) return null;
    this.undoStack.push(currentState);
    return this.redoStack.pop()!;
  }

  /** Clear all history. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
