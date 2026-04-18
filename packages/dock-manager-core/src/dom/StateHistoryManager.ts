import type { DockManagerState } from '../types/dock';

const DEFAULT_MAX_HISTORY = 20;

export class StateHistoryManager {
  private undoStack: DockManagerState[] = [];
  private redoStack: DockManagerState[] = [];
  private maxHistory: number;

  constructor(maxHistory: number = DEFAULT_MAX_HISTORY) { this.maxHistory = maxHistory; }

  push(state: DockManagerState): void {
    this.undoStack.push(state);
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack = [];
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  undo(currentState: DockManagerState): DockManagerState | null {
    if (this.undoStack.length === 0) return null;
    this.redoStack.push(currentState);
    return this.undoStack.pop()!;
  }

  redo(currentState: DockManagerState): DockManagerState | null {
    if (this.redoStack.length === 0) return null;
    this.undoStack.push(currentState);
    return this.redoStack.pop()!;
  }

  clear(): void { this.undoStack = []; this.redoStack = []; }
}
