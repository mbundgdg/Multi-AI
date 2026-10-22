import { describe, expect, it } from 'vitest';
import {
  calculateLineScore,
  clearLines,
  collides,
  createBoard,
  createGame,
  dropDistance,
  gravityInterval,
  levelForLines,
  tryRotate,
  type ActivePiece,
  type Cell,
  type GameSnapshot,
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

describe('createGame', () => {
  it('starts in ready state with a spawned piece and a deterministic next', () => {
    const game = createGame(1);
    const snapshot = game.snapshot();
    expect(snapshot.status).toBe('ready');
    expect(snapshot.active?.type).toBe('O');
    expect(snapshot.next).toBe('J');
    expect(snapshot.hold).toBeNull();
    expect(snapshot.score).toBe(0);
    expect(snapshot.lines).toBe(0);
    expect(snapshot.level).toBe(1);
  });

  it('does not fall before start', () => {
    const game = createGame(1);
    const before = game.snapshot().active?.y;
    game.tick(5000);
    expect(game.snapshot().active?.y).toBe(before);
  });

  it('moves to playing on start', () => {
    const game = createGame(1);
    game.start();
    expect(game.snapshot().status).toBe('playing');
  });

  it('moves horizontally only while playing', () => {
    const game = createGame(1);
    const startX = game.snapshot().active!.x;
    game.move(-1);
    expect(game.snapshot().active!.x).toBe(startX);
    game.start();
    game.move(-1);
    expect(game.snapshot().active!.x).toBe(startX - 1);
    game.move(1);
    expect(game.snapshot().active!.x).toBe(startX);
  });

  it('rotates the active piece', () => {
    const game = createGame(1);
    game.start();
    game.rotate(1);
    expect(game.snapshot().active?.rotation).toBe(1);
    game.rotate(-1);
    expect(game.snapshot().active?.rotation).toBe(0);
  });

  it('advances gravity by accumulated ticks', () => {
    const game = createGame(1);
    game.start();
    game.tick(799);
    expect(game.snapshot().active?.y).toBe(0);
    game.tick(1);
    expect(game.snapshot().active?.y).toBe(1);
    game.tick(Number.NaN);
    game.tick(-100);
    expect(game.snapshot().active?.y).toBe(1);
  });

  it('ignores every command while paused', () => {
    const game = createGame(1);
    game.start();
    game.togglePause();
    const paused = game.snapshot();
    expect(paused.status).toBe('paused');
    game.move(-1);
    game.move(1);
    game.rotate(1);
    game.rotate(-1);
    game.softDrop();
    game.hardDrop();
    game.hold();
    game.tick(5000);
    expect(game.snapshot()).toEqual(paused);
    game.togglePause();
    expect(game.snapshot().status).toBe('playing');
  });

  it('stores the first held piece and advances the queue', () => {
    const game = createGame(1);
    game.start();
    game.hold();
    const snapshot = game.snapshot();
    expect(snapshot.hold).toBe('O');
    expect(snapshot.active?.type).toBe('J');
    expect(snapshot.next).toBe('L');
    expect(snapshot.canHold).toBe(false);
  });

  it('ignores a second hold before locking', () => {
    const game = createGame(1);
    game.start();
    game.hold();
    const afterFirst = game.snapshot();
    game.hold();
    expect(game.snapshot()).toEqual(afterFirst);
  });

  it('allows hold again after locking', () => {
    const game = createGame(1);
    game.start();
    game.hold();
    game.hardDrop();
    const snapshot = game.snapshot();
    expect(snapshot.canHold).toBe(true);
    expect(snapshot.hold).toBe('O');
    game.hold();
    expect(game.snapshot().active?.type).toBe('O');
    expect(game.snapshot().hold).toBe('L');
  });

  it('adds one point per soft-drop row', () => {
    const game = createGame(1);
    game.start();
    game.softDrop();
    expect(game.snapshot().active?.y).toBe(1);
    expect(game.snapshot().score).toBe(1);
    game.softDrop();
    expect(game.snapshot().score).toBe(2);
  });

  it('adds two points per hard-drop row and locks immediately', () => {
    const game = createGame(1);
    game.start();
    const before = game.snapshot();
    const distance = before.ghostY! - before.active!.y;
    game.hardDrop();
    const after = game.snapshot();
    expect(after.score).toBe(distance * 2);
    expect(after.active?.type).toBe('J');
    expect(after.board[23]![4]).toBe('O');
    expect(after.board[23]![5]).toBe('O');
  });

  it('clears a completed line and scores it by level', () => {
    const game = createGame(1);
    game.start();
    for (let step = 0; step < 4; step += 1) {
      game.move(-1);
    }
    game.hardDrop();
    game.move(-1);
    game.hardDrop();
    for (let step = 0; step < 4; step += 1) {
      game.move(1);
    }
    game.hardDrop();
    for (let step = 0; step < 2; step += 1) {
      game.move(1);
    }
    game.hardDrop();
    const snapshot = game.snapshot();
    expect(snapshot.lines).toBe(1);
    expect(snapshot.level).toBe(1);
    expect(snapshot.score).toBe(268);
    expect(snapshot.board[23]!.some((cell) => cell === null)).toBe(true);
  });

  it('returns snapshot copies that cannot mutate internal state', () => {
    const game = createGame(1);
    game.start();
    const snapshot = game.snapshot() as GameSnapshot;
    (snapshot.board[23] as Cell[])[0] = 'I';
    (snapshot.active as ActivePiece).x = 99;
    const fresh = game.snapshot();
    expect(fresh.board[23]![0]).toBeNull();
    expect(fresh.active?.x).toBe(3);
  });

  it('reaches game over through repeated hard drops and restarts cleanly', () => {
    const game = createGame(1);
    game.start();
    game.hardDrop();
    game.hold();
    let guard = 0;
    while (game.snapshot().status === 'playing' && guard < 200) {
      game.hardDrop();
      guard += 1;
    }
    expect(game.snapshot().status).toBe('gameover');
    expect(game.snapshot().active).toBeNull();
    game.restart();
    const snapshot = game.snapshot();
    expect(snapshot.status).toBe('playing');
    expect(snapshot.score).toBe(0);
    expect(snapshot.lines).toBe(0);
    expect(snapshot.level).toBe(1);
    expect(snapshot.hold).toBeNull();
    expect(snapshot.active).not.toBeNull();
    expect(snapshot.board.flat().every((cell) => cell === null)).toBe(true);
  });
});
