import { describe, expect, it } from 'vitest';
import {
  calculateLineScore,
  clearLines,
  collides,
  createBoard,
  dropDistance,
  gravityInterval,
  levelForLines,
  tryRotate,
  type ActivePiece,
} from './engine';

const piece = (overrides: Partial<ActivePiece> = {}): ActivePiece => ({
  type: 'O',
  rotation: 0,
  x: 3,
  y: 0,
  ...overrides,
});

describe('createBoard', () => {
  it('creates a 24 by 10 empty board', () => {
    const board = createBoard();
    expect(board).toHaveLength(24);
    expect(board.every((row) => row.length === 10)).toBe(true);
    expect(board.flat().every((cell) => cell === null)).toBe(true);
  });

  it('does not share row references', () => {
    const board = createBoard();
    board[0]![0] = 'I';
    expect(board[1]![0]).toBeNull();
  });
});

describe('collides', () => {
  it('detects floor collisions', () => {
    expect(collides(createBoard(), piece({ x: 3, y: 22 }))).toBe(true);
  });

  it('detects left and right wall collisions', () => {
    const board = createBoard();
    expect(collides(board, piece({ type: 'I', x: -1, y: 0 }))).toBe(true);
    expect(collides(board, piece({ type: 'I', x: 7, y: 0 }))).toBe(true);
  });

  it('detects collisions with locked cells', () => {
    const board = createBoard();
    board[23]![4] = 'T';
    expect(collides(board, piece({ x: 3, y: 21 }))).toBe(true);
  });

  it('accepts a piece inside the board', () => {
    expect(collides(createBoard(), piece({ x: 3, y: 0 }))).toBe(false);
  });
});

describe('clearLines', () => {
  it('clears one completed row and keeps remaining cells', () => {
    const board = createBoard();
    board[23] = Array(10).fill('I');
    board[22]![4] = 'T';
    const result = clearLines(board);
    expect(result.cleared).toBe(1);
    expect(result.board[23]![4]).toBe('T');
    expect(result.board[0]!.every((cell) => cell === null)).toBe(true);
  });

  it('clears two adjacent rows and shifts upper rows down', () => {
    const board = createBoard();
    board[23] = Array(10).fill('I');
    board[22] = Array(10).fill('O');
    board[21]![2] = 'T';
    const result = clearLines(board);
    expect(result.cleared).toBe(2);
    expect(result.board[23]![2]).toBe('T');
    expect(result.board[21]!.every((cell) => cell === null)).toBe(true);
  });

  it('does not mutate the input board', () => {
    const board = createBoard();
    board[23] = Array(10).fill('I');
    clearLines(board);
    expect(board[23]!.every((cell) => cell === 'I')).toBe(true);
  });

  it('reports zero when no rows are complete', () => {
    const board = createBoard();
    expect(clearLines(board).cleared).toBe(0);
  });
});

describe('scoring and speed helpers', () => {
  it('scores line clears by level', () => {
    expect(calculateLineScore(0, 1)).toBe(0);
    expect(calculateLineScore(1, 1)).toBe(100);
    expect(calculateLineScore(2, 1)).toBe(300);
    expect(calculateLineScore(3, 1)).toBe(500);
    expect(calculateLineScore(4, 1)).toBe(800);
    expect(calculateLineScore(4, 3)).toBe(2400);
  });

  it('calculates level and gravity boundaries', () => {
    expect(levelForLines(0)).toBe(1);
    expect(levelForLines(9)).toBe(1);
    expect(levelForLines(10)).toBe(2);
    expect(levelForLines(90)).toBe(10);
    expect(levelForLines(999)).toBe(15);
    expect(gravityInterval(1)).toBe(800);
    expect(gravityInterval(2)).toBe(730);
    expect(gravityInterval(15)).toBe(100);
    expect(gravityInterval(20)).toBe(100);
  });
});

describe('dropDistance', () => {
  it('drops to the floor on an empty board', () => {
    expect(dropDistance(createBoard(), piece({ x: 3, y: 0 }))).toBe(21);
  });

  it('stops above locked cells', () => {
    const board = createBoard();
    board[23]![4] = 'T';
    expect(dropDistance(board, piece({ x: 3, y: 0 }))).toBe(20);
  });
});

describe('tryRotate', () => {
  it('rotates in place when there is room', () => {
    const rotated = tryRotate(createBoard(), piece({ type: 'T', x: 3, y: 0 }), 1);
    expect(rotated).not.toBeNull();
    expect(rotated?.rotation).toBe(1);
    expect(rotated?.x).toBe(3);
  });

  it('applies the first wall kick offset to the left', () => {
    const vertical: ActivePiece = { type: 'I', rotation: 1, x: 7, y: 0 };
    const rotated = tryRotate(createBoard(), vertical, 1);
    expect(rotated).toEqual({ type: 'I', rotation: 2, x: 6, y: 0 });
  });

  it('wraps rotation counter-clockwise', () => {
    const rotated = tryRotate(createBoard(), piece({ type: 'T', x: 3, y: 0 }), -1);
    expect(rotated?.rotation).toBe(3);
  });
});
