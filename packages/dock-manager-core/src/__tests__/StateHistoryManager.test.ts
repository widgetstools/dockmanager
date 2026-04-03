import { describe, it, expect } from 'vitest';
import { StateHistoryManager } from '../dom/StateHistoryManager';
import type { DockManagerState } from '../types/dock';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeState(label: string): DockManagerState {
  return {
    layout: { type: 'tabgroup', id: 'tg1', panels: [label], activePanel: label },
    panels: { [label]: { id: label, title: label, closable: true } },
    floatingPanels: [],
    popoutPanels: [],
    unpinnedPanels: [],
    nextZIndex: 1000,
    activePaneId: label,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('StateHistoryManager', () => {
  describe('basic undo/redo', () => {
    it('canUndo and canRedo are false initially', () => {
      const manager = new StateHistoryManager();
      expect(manager.canUndo).toBe(false);
      expect(manager.canRedo).toBe(false);
    });

    it('push makes canUndo true', () => {
      const manager = new StateHistoryManager();
      manager.push(makeState('A'));
      expect(manager.canUndo).toBe(true);
      expect(manager.canRedo).toBe(false);
    });

    it('undo returns the pushed state and makes canRedo true', () => {
      const manager = new StateHistoryManager();
      const stateA = makeState('A');
      const current = makeState('B');
      manager.push(stateA);

      const result = manager.undo(current);
      expect(result).toBe(stateA);
      expect(manager.canUndo).toBe(false);
      expect(manager.canRedo).toBe(true);
    });

    it('redo returns to the state before undo', () => {
      const manager = new StateHistoryManager();
      const stateA = makeState('A');
      const current = makeState('B');
      manager.push(stateA);

      const undone = manager.undo(current);
      expect(undone).toBe(stateA);

      const redone = manager.redo(stateA);
      expect(redone).toBe(current);
    });

    it('undo when empty returns null', () => {
      const manager = new StateHistoryManager();
      expect(manager.undo(makeState('X'))).toBeNull();
    });

    it('redo when empty returns null', () => {
      const manager = new StateHistoryManager();
      expect(manager.redo(makeState('X'))).toBeNull();
    });
  });

  describe('multiple states', () => {
    it('push 3 states, undo 3 times gets them back in reverse order', () => {
      const manager = new StateHistoryManager();
      const stateA = makeState('A');
      const stateB = makeState('B');
      const stateC = makeState('C');
      const current = makeState('D');

      manager.push(stateA);
      manager.push(stateB);
      manager.push(stateC);

      expect(manager.undo(current)).toBe(stateC);
      expect(manager.undo(stateC)).toBe(stateB);
      expect(manager.undo(stateB)).toBe(stateA);
      expect(manager.undo(stateA)).toBeNull();
    });

    it('undo then redo restores correctly', () => {
      const manager = new StateHistoryManager();
      const stateA = makeState('A');
      const stateB = makeState('B');
      const current = makeState('C');

      manager.push(stateA);
      manager.push(stateB);

      const afterUndo1 = manager.undo(current);
      expect(afterUndo1).toBe(stateB);

      const afterRedo1 = manager.redo(stateB);
      expect(afterRedo1).toBe(current);
    });

    it('partial undo then redo chain', () => {
      const manager = new StateHistoryManager();
      const stateA = makeState('A');
      const stateB = makeState('B');
      const stateC = makeState('C');
      const current = makeState('D');

      manager.push(stateA);
      manager.push(stateB);
      manager.push(stateC);

      expect(manager.undo(current)).toBe(stateC);
      expect(manager.undo(stateC)).toBe(stateB);

      expect(manager.redo(stateB)).toBe(stateC);
      expect(manager.redo(stateC)).toBe(current);
      expect(manager.redo(current)).toBeNull();
    });
  });

  describe('push clears redo stack', () => {
    it('push after undo clears redo so canRedo is false', () => {
      const manager = new StateHistoryManager();
      const stateA = makeState('A');
      const stateB = makeState('B');
      const current = makeState('C');

      manager.push(stateA);
      manager.push(stateB);

      manager.undo(current);

      manager.push(makeState('D'));

      expect(manager.canRedo).toBe(false);
      expect(manager.redo(makeState('X'))).toBeNull();
    });
  });

  describe('max history', () => {
    it('constructor with maxHistory=3, push 5 states, only last 3 are undoable', () => {
      const manager = new StateHistoryManager(3);
      const states = [makeState('A'), makeState('B'), makeState('C'), makeState('D'), makeState('E')];

      for (const s of states) {
        manager.push(s);
      }

      const current = makeState('F');

      expect(manager.undo(current)).toBe(states[4]);
      expect(manager.undo(states[4])).toBe(states[3]);
      expect(manager.undo(states[3])).toBe(states[2]);
      expect(manager.undo(states[2])).toBeNull();
    });

    it('default max history is 20', () => {
      const manager = new StateHistoryManager();
      const states: DockManagerState[] = [];

      for (let i = 0; i < 25; i++) {
        const s = makeState(`s${i}`);
        states.push(s);
        manager.push(s);
      }

      let undoCount = 0;
      let current = makeState('final');
      while (manager.canUndo) {
        current = manager.undo(current)!;
        undoCount++;
      }

      expect(undoCount).toBe(20);
    });
  });

  describe('clear', () => {
    it('push states, clear, canUndo and canRedo are both false', () => {
      const manager = new StateHistoryManager();
      manager.push(makeState('A'));
      manager.push(makeState('B'));

      const current = makeState('C');
      manager.undo(current);

      expect(manager.canUndo).toBe(true);
      expect(manager.canRedo).toBe(true);

      manager.clear();

      expect(manager.canUndo).toBe(false);
      expect(manager.canRedo).toBe(false);
    });
  });

  describe('state integrity', () => {
    it('undo returns the exact same state object that was pushed (reference equality)', () => {
      const manager = new StateHistoryManager();
      const stateA = makeState('A');
      const current = makeState('B');

      manager.push(stateA);
      const result = manager.undo(current);

      expect(result).toBe(stateA);
    });

    it('redo returns the exact same currentState that was passed to undo', () => {
      const manager = new StateHistoryManager();
      const stateA = makeState('A');
      const current = makeState('B');

      manager.push(stateA);
      manager.undo(current);

      const result = manager.redo(stateA);
      expect(result).toBe(current);
    });
  });
});
