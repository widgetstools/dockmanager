import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from '../dom/EventEmitter';

describe('EventEmitter', () => {
  let emitter: EventEmitter<string>;

  beforeEach(() => {
    emitter = new EventEmitter<string>();
  });

  it('on() registers a listener that receives emitted values', () => {
    const received: string[] = [];
    emitter.on((v) => received.push(v));

    emitter.emit('hello');

    expect(received).toEqual(['hello']);
  });

  it('on() returns an unsubscribe function that removes the listener', () => {
    const received: string[] = [];
    const unsub = emitter.on((v) => received.push(v));

    emitter.emit('first');
    unsub();
    emitter.emit('second');

    expect(received).toEqual(['first']);
  });

  it('emit() calls all registered listeners with the value', () => {
    const a: string[] = [];
    const b: string[] = [];
    emitter.on((v) => a.push(v));
    emitter.on((v) => b.push(v));

    emitter.emit('event');

    expect(a).toEqual(['event']);
    expect(b).toEqual(['event']);
  });

  it('emit() with no listeners does not throw', () => {
    expect(() => emitter.emit('lonely')).not.toThrow();
  });

  it('multiple listeners receive the same event', () => {
    const results: string[] = [];
    emitter.on((v) => results.push(`L1:${v}`));
    emitter.on((v) => results.push(`L2:${v}`));
    emitter.on((v) => results.push(`L3:${v}`));

    emitter.emit('ping');

    expect(results).toEqual(['L1:ping', 'L2:ping', 'L3:ping']);
  });

  it('unsubscribing one listener does not affect others', () => {
    const a: string[] = [];
    const b: string[] = [];
    const unsubA = emitter.on((v) => a.push(v));
    emitter.on((v) => b.push(v));

    emitter.emit('before');
    unsubA();
    emitter.emit('after');

    expect(a).toEqual(['before']);
    expect(b).toEqual(['before', 'after']);
  });

  it('dispose() removes all listeners', () => {
    const received: string[] = [];
    emitter.on((v) => received.push(v));
    emitter.on((v) => received.push(v + '!'));

    emitter.dispose();
    emitter.emit('gone');

    expect(received).toEqual([]);
  });

  it('after dispose(), emit() does not call old listeners', () => {
    const received: string[] = [];
    emitter.on((v) => received.push(v));

    emitter.emit('alive');
    emitter.dispose();
    emitter.emit('dead');

    expect(received).toEqual(['alive']);
  });

  it('adding the same listener twice only calls it once (Set behavior)', () => {
    const received: string[] = [];
    const listener = (v: string) => received.push(v);

    emitter.on(listener);
    emitter.on(listener);

    emitter.emit('dedup');

    expect(received).toEqual(['dedup']);
  });

  it('works with void type parameter', () => {
    const voidEmitter = new EventEmitter<void>();
    let called = 0;
    voidEmitter.on(() => called++);

    voidEmitter.emit();

    expect(called).toBe(1);
  });
});
