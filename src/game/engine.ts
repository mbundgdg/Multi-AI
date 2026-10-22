import {
  getRotatedMatrix,
  type TetrominoType,
} from './tetrominoes';

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 24;
export const HIDDEN_ROWS = 4;

export type Cell = TetrominoType | null;
export type GameStatus = 'ready' | 'playing' | 'paused' | 'gameover';

export interface ActivePiece {
  type: TetrominoType;
  rotation: 0 | 1 | 2 | 3;
  x: number;
  y: number;
}

export interface GameSnapshot {
  board: readonly (readonly Cell[])[];
  active: Readonly<ActivePiece> | null;
  ghostY: number | null;
  next: TetrominoType;
  hold: TetrominoType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  status: GameStatus;
}

export interface TetrisGame {
  snapshot(): GameSnapshot;
  start(): void;
  tick(deltaMs: number): void;
  move(dx: -1 | 1): void;
  rotate(direction: 1 | -1): void;
  softDrop(): void;
  hardDrop(): void;
  hold(): void;
  togglePause(): void;
  restart(): void;
}

const LINE_SCORES = [0, 100, 300, 500, 800] as const;

const WALL_KICKS = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [-2, 0],
  [2, 0],
  [0, -1],
] as const;

export function createBoard(): Cell[][] {
  return Array.from({ length: BOARD_HEIGHT }, () =>
    Array<Cell>(BOARD_WIDTH).fill(null),
  );
}

export function collides(
  board: readonly (readonly Cell[])[],
  piece: ActivePiece,
): boolean {
  const matrix = getRotatedMatrix(piece.type, piece.rotation);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      if (matrix[row]![column] === 0) {
        continue;
      }
      const boardX = piece.x + column;
      const boardY = piece.y + row;
      if (boardX < 0 || boardX >= BOARD_WIDTH || boardY >= BOARD_HEIGHT) {
        return true;
      }
      if (boardY >= 0 && board[boardY]?.[boardX]) {
        return true;
      }
    }
  }
  return false;
}

export function clearLines(board: Cell[][]): { board: Cell[][]; cleared: number } {
  const remaining: Cell[][] = [];
  for (const row of board) {
    if (!row.every((cell) => cell !== null)) {
      remaining.push([...row]);
    }
  }
  const cleared = board.length - remaining.length;
  const emptyRows: Cell[][] = Array.from({ length: cleared }, () =>
    Array<Cell>(BOARD_WIDTH).fill(null),
  );
  return { board: [...emptyRows, ...remaining], cleared };
}

export function calculateLineScore(cleared: number, level: number): number {
  return (LINE_SCORES[cleared] ?? 0) * level;
}

export function levelForLines(lines: number): number {
  return Math.min(15, Math.floor(lines / 10) + 1);
}

export function gravityInterval(level: number): number {
  return Math.max(100, 800 - (level - 1) * 70);
}

export function dropDistance(
  board: readonly (readonly Cell[])[],
  piece: ActivePiece,
): number {
  let distance = 0;
  while (!collides(board, { ...piece, y: piece.y + distance + 1 })) {
    distance += 1;
  }
  return distance;
}

export function tryRotate(
  board: readonly (readonly Cell[])[],
  piece: ActivePiece,
  direction: 1 | -1,
): ActivePiece | null {
  const rotation = (((piece.rotation + direction) % 4) + 4) % 4;
  for (const [offsetX, offsetY] of WALL_KICKS) {
    const candidate: ActivePiece = {
      ...piece,
      rotation: rotation as ActivePiece['rotation'],
      x: piece.x + offsetX,
      y: piece.y + offsetY,
    };
    if (!collides(board, candidate)) {
      return candidate;
    }
  }
  return null;
}
