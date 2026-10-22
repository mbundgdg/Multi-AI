import { describe, expect, it } from 'vitest';
import {
  TETROMINO_COLORS,
  TETROMINO_TYPES,
  TETROMINOES,
  createBag,
  createSeededRandom,
  getRotatedMatrix,
  rotateMatrix,
} from './tetrominoes';

describe('createBag', () => {
  it('contains each tetromino exactly once', () => {
    const bag = createBag(() => 0.5);
    expect([...bag].sort()).toEqual([...TETROMINO_TYPES].sort());
  });

  it('is deterministic for a fixed seed', () => {
    expect(createBag(createSeededRandom(42))).toEqual(
      createBag(createSeededRandom(42)),
    );
  });

  it('produces different order for different seeds', () => {
    expect(createBag(createSeededRandom(1))).not.toEqual(
      createBag(createSeededRandom(2)),
    );
  });
});

describe('TETROMINOES', () => {
  it('defines a 4x4 matrix and a color for every type', () => {
    for (const type of TETROMINO_TYPES) {
      expect(TETROMINOES[type]).toHaveLength(4);
      expect(TETROMINOES[type].every((row) => row.length === 4)).toBe(true);
      expect(TETROMINO_COLORS[type]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('keeps O unchanged through a full turn', () => {
    expect(getRotatedMatrix('O', 1)).toEqual(TETROMINOES.O);
  });
});

describe('rotateMatrix', () => {
  it('rotates clockwise', () => {
    expect(rotateMatrix([[1, 2], [3, 4]], 1)).toEqual([[3, 1], [4, 2]]);
  });

  it('rotates counter-clockwise', () => {
    expect(rotateMatrix([[1, 2], [3, 4]], -1)).toEqual([[2, 4], [1, 3]]);
  });

  it('returns a new matrix without mutating the source', () => {
    const source = [
      [1, 2],
      [3, 4],
    ];
    rotateMatrix(source, 1);
    expect(source).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe('getRotatedMatrix', () => {
  it('applies four clockwise turns back to the original', () => {
    expect(getRotatedMatrix('T', 4)).toEqual(TETROMINOES.T);
  });
});
