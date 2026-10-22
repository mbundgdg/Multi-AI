import {
  createBag,
  createSeededRandom,
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

interface InternalState {
  board: Cell[][];
  active: ActivePiece | null;
  next: TetrominoType;
  hold: TetrominoType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  status: GameStatus;
  gravityAccumulator: number;
  random: () => number;
  queue: TetrominoType[];
  seed: number;
}

export function createGame(seed: number = Date.now()): TetrisGame {
  const state: InternalState = {
    board: createBoard(),
    active: null,
    next: 'I',
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: 1,
    status: 'ready',
    gravityAccumulator: 0,
    random: createSeededRandom(seed),
    queue: [],
    seed,
  };

  function refillQueue(): void {
    while (state.queue.length < 2) {
      state.queue.push(...createBag(state.random));
    }
  }

  function spawn(type: TetrominoType): void {
    const active: ActivePiece = { type, rotation: 0, x: 3, y: 0 };
    if (collides(state.board, active)) {
      state.active = null;
      state.status = 'gameover';
      return;
    }
    state.active = active;
  }

  function spawnNext(): void {
    refillQueue();
    const type = state.queue.shift();
    if (type === undefined) {
      state.status = 'gameover';
      state.active = null;
      return;
    }
    state.next = state.queue[0] ?? type;
    spawn(type);
  }

  function lockPiece(): void {
    const active = state.active;
    if (active === null) {
      return;
    }
    const matrix = getRotatedMatrix(active.type, active.rotation);
    let lockedInHiddenRows = false;
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        if (matrix[row]![column] === 0) {
          continue;
        }
        const boardX = active.x + column;
        const boardY = active.y + row;
        if (boardY < HIDDEN_ROWS) {
          lockedInHiddenRows = true;
        }
        if (boardY >= 0 && boardY < BOARD_HEIGHT) {
          state.board[boardY]![boardX] = active.type;
        }
      }
    }
    state.active = null;
    if (lockedInHiddenRows) {
      state.status = 'gameover';
      return;
    }
    const result = clearLines(state.board);
    state.board = result.board;
    if (result.cleared > 0) {
      state.score += calculateLineScore(result.cleared, state.level);
      state.lines += result.cleared;
      state.level = levelForLines(state.lines);
    }
    state.canHold = true;
    spawnNext();
  }

  function move(dx: -1 | 1): void {
    if (state.status !== 'playing' || state.active === null) {
      return;
    }
    const candidate: ActivePiece = { ...state.active, x: state.active.x + dx };
    if (!collides(state.board, candidate)) {
      state.active = candidate;
    }
  }

  function rotate(direction: 1 | -1): void {
    if (state.status !== 'playing' || state.active === null) {
      return;
    }
    const rotated = tryRotate(state.board, state.active, direction);
    if (rotated !== null) {
      state.active = rotated;
    }
  }

  function softDrop(): void {
    if (state.status !== 'playing' || state.active === null) {
      return;
    }
    const candidate: ActivePiece = { ...state.active, y: state.active.y + 1 };
    if (collides(state.board, candidate)) {
      lockPiece();
      return;
    }
    state.active = candidate;
    state.score += 1;
  }

  function hardDrop(): void {
    if (state.status !== 'playing' || state.active === null) {
      return;
    }
    const distance = dropDistance(state.board, state.active);
    state.active = { ...state.active, y: state.active.y + distance };
    state.score += distance * 2;
    lockPiece();
  }

  function hold(): void {
    if (state.status !== 'playing' || state.active === null || !state.canHold) {
      return;
    }
    const currentType = state.active.type;
    const heldType = state.hold;
    state.canHold = false;
    state.hold = currentType;
    if (heldType === null) {
      spawnNext();
    } else {
      spawn(heldType);
    }
  }

  function togglePause(): void {
    if (state.status === 'playing') {
      state.status = 'paused';
    } else if (state.status === 'paused') {
      state.status = 'playing';
    }
  }

  function restart(): void {
    state.board = createBoard();
    state.active = null;
    state.hold = null;
    state.canHold = true;
    state.score = 0;
    state.lines = 0;
    state.level = 1;
    state.gravityAccumulator = 0;
    state.random = createSeededRandom(state.seed);
    state.queue = [];
    state.status = 'playing';
    refillQueue();
    spawnNext();
  }

  function start(): void {
    if (state.status === 'ready') {
      state.status = 'playing';
    }
  }

  function tick(deltaMs: number): void {
    if (state.status !== 'playing') {
      return;
    }
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      return;
    }
    state.gravityAccumulator += Math.min(deltaMs, 1000);
    let guard = 0;
    while (state.status === 'playing' && guard < 64) {
      const interval = gravityInterval(state.level);
      if (state.gravityAccumulator < interval) {
        break;
      }
      state.gravityAccumulator -= interval;
      guard += 1;
      if (state.active === null) {
        break;
      }
      const candidate: ActivePiece = { ...state.active, y: state.active.y + 1 };
      if (collides(state.board, candidate)) {
        lockPiece();
      } else {
        state.active = candidate;
      }
    }
  }

  function snapshot(): GameSnapshot {
    const active = state.active === null ? null : { ...state.active };
    return {
      board: state.board.map((row) => [...row]),
      active,
      ghostY:
        state.active === null
          ? null
          : state.active.y + dropDistance(state.board, state.active),
      next: state.next,
      hold: state.hold,
      canHold: state.canHold,
      score: state.score,
      lines: state.lines,
      level: state.level,
      status: state.status,
    };
  }

  refillQueue();
  spawnNext();
  state.status = 'ready';

  return {
    snapshot,
    start,
    tick,
    move,
    rotate,
    softDrop,
    hardDrop,
    hold,
    togglePause,
    restart,
  };
}
