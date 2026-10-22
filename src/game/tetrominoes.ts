export const TETROMINO_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;

export type TetrominoType = (typeof TETROMINO_TYPES)[number];

export type TetrominoMatrix = number[][];

export const TETROMINOES: Record<TetrominoType, TetrominoMatrix> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
  ],
  T: [
    [0, 0, 0, 0],
    [0, 1, 0, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
  ],
  S: [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [1, 1, 0, 0],
    [0, 0, 0, 0],
  ],
  Z: [
    [0, 0, 0, 0],
    [1, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [0, 0, 0, 0],
    [1, 0, 0, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
  ],
  L: [
    [0, 0, 0, 0],
    [0, 0, 1, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
  ],
};

export const TETROMINO_COLORS: Record<TetrominoType, string> = {
  I: '#7f9470',
  O: '#93a878',
  T: '#6f8663',
  S: '#859a6e',
  Z: '#647c59',
  J: '#788e6b',
  L: '#8ea27c',
};

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBag(random: () => number): TetrominoType[] {
  const bag = [...TETROMINO_TYPES];
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = bag[index]!;
    bag[index] = bag[swapIndex]!;
    bag[swapIndex] = current;
  }
  return bag;
}

export function rotateMatrix(
  matrix: TetrominoMatrix,
  direction: 1 | -1,
): TetrominoMatrix {
  const size = matrix.length;
  const rotated: TetrominoMatrix = Array.from({ length: size }, () =>
    Array<number>(size).fill(0),
  );
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const value =
        direction === 1
          ? matrix[size - 1 - column]![row]!
          : matrix[column]![size - 1 - row]!;
      rotated[row]![column] = value;
    }
  }
  return rotated;
}

export function getRotatedMatrix(
  type: TetrominoType,
  rotation: number,
): TetrominoMatrix {
  const turns = ((rotation % 4) + 4) % 4;
  let matrix = TETROMINOES[type];
  for (let turn = 0; turn < turns; turn += 1) {
    matrix = rotateMatrix(matrix, 1);
  }
  return matrix;
}
