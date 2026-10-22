import { describe, expect, it } from 'vitest';
import { keyToAction, type GameAction } from './controls';

const expectations: Array<[string, GameAction]> = [
  ['ArrowLeft', 'left'],
  ['a', 'left'],
  ['A', 'left'],
  ['ArrowRight', 'right'],
  ['d', 'right'],
  ['D', 'right'],
  ['ArrowDown', 'soft-drop'],
  ['s', 'soft-drop'],
  ['S', 'soft-drop'],
  ['ArrowUp', 'rotate-cw'],
  ['x', 'rotate-cw'],
  ['X', 'rotate-cw'],
  ['w', 'rotate-cw'],
  ['W', 'rotate-cw'],
  ['z', 'rotate-ccw'],
  ['Z', 'rotate-ccw'],
  [' ', 'hard-drop'],
  ['Space', 'hard-drop'],
  ['c', 'hold'],
  ['C', 'hold'],
  ['Shift', 'hold'],
  ['ShiftLeft', 'hold'],
  ['p', 'pause'],
  ['P', 'pause'],
  ['Escape', 'pause'],
  ['r', 'restart'],
  ['R', 'restart'],
];

describe('keyToAction', () => {
  it.each(expectations)('maps %s to %s', (key, action) => {
    expect(keyToAction(key)).toBe(action);
  });

  it('returns null for unknown keys', () => {
    expect(keyToAction('Enter')).toBeNull();
    expect(keyToAction('q')).toBeNull();
    expect(keyToAction('F1')).toBeNull();
  });
});
