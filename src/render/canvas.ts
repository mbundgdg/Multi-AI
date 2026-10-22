import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  HIDDEN_ROWS,
  type GameSnapshot,
} from '../game/engine';
import {
  TETROMINO_COLORS,
  getRotatedMatrix,
  type TetrominoMatrix,
} from '../game/tetrominoes';

export interface TetrisRenderer {
  render(snapshot: GameSnapshot): void;
}

const BOARD_PIXEL_WIDTH = 300;
const BOARD_PIXEL_HEIGHT = 600;
const CELL_SIZE = 30;
const PREVIEW_SIZE = 80;
const PREVIEW_CELL = 16;
const LCD_BACKGROUND = '#a9b689';
const GRID_LINE = 'rgba(38, 53, 38, 0.14)';
const BLOCK_BORDER = 'rgba(38, 53, 38, 0.9)';
const BLOCK_HIGHLIGHT = 'rgba(244, 248, 226, 0.32)';
const GHOST_STROKE = 'rgba(38, 53, 38, 0.55)';
const GHOST_FILL = 'rgba(38, 53, 38, 0.08)';

interface CanvasSurface {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
}

function createSurface(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasSurface {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('浏览器不支持 Canvas 2D 上下文');
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width, height };
}

function drawBlock(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  context.fillStyle = color;
  context.fillRect(x, y, size, size);
  context.lineWidth = 2;
  context.strokeStyle = BLOCK_BORDER;
  context.strokeRect(x + 1, y + 1, size - 2, size - 2);
  context.strokeStyle = BLOCK_HIGHLIGHT;
  context.strokeRect(x + 5, y + 5, size - 10, size - 10);
}

function drawGhost(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  context.fillStyle = GHOST_FILL;
  context.fillRect(x, y, size, size);
  context.lineWidth = 2;
  context.strokeStyle = GHOST_STROKE;
  context.strokeRect(x + 3, y + 3, size - 6, size - 6);
}

function forEachFilledCell(
  matrix: TetrominoMatrix,
  visit: (row: number, column: number) => void,
): void {
  for (let row = 0; row < matrix.length; row += 1) {
    const matrixRow = matrix[row];
    if (matrixRow === undefined) {
      continue;
    }
    for (let column = 0; column < matrixRow.length; column += 1) {
      if (matrixRow[column] !== 0) {
        visit(row, column);
      }
    }
  }
}

function clearSurface(surface: CanvasSurface): void {
  surface.context.fillStyle = LCD_BACKGROUND;
  surface.context.fillRect(0, 0, surface.width, surface.height);
}

function drawPreview(
  surface: CanvasSurface,
  matrix: TetrominoMatrix,
  color: string,
): void {
  clearSurface(surface);
  let minRow = 4;
  let maxRow = -1;
  let minColumn = 4;
  let maxColumn = -1;
  forEachFilledCell(matrix, (row, column) => {
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
    minColumn = Math.min(minColumn, column);
    maxColumn = Math.max(maxColumn, column);
  });
  if (maxRow < 0 || maxColumn < 0) {
    return;
  }
  const shapeWidth = (maxColumn - minColumn + 1) * PREVIEW_CELL;
  const shapeHeight = (maxRow - minRow + 1) * PREVIEW_CELL;
  const offsetX = (surface.width - shapeWidth) / 2;
  const offsetY = (surface.height - shapeHeight) / 2;
  forEachFilledCell(matrix, (row, column) => {
    drawBlock(
      surface.context,
      offsetX + (column - minColumn) * PREVIEW_CELL,
      offsetY + (row - minRow) * PREVIEW_CELL,
      PREVIEW_CELL,
      color,
    );
  });
}

export function createRenderer(
  boardCanvas: HTMLCanvasElement,
  holdCanvas: HTMLCanvasElement,
  nextCanvas: HTMLCanvasElement,
): TetrisRenderer {
  const board = createSurface(
    boardCanvas,
    BOARD_PIXEL_WIDTH,
    BOARD_PIXEL_HEIGHT,
  );
  const hold = createSurface(holdCanvas, PREVIEW_SIZE, PREVIEW_SIZE);
  const next = createSurface(nextCanvas, PREVIEW_SIZE, PREVIEW_SIZE);

  function renderBoard(snapshot: GameSnapshot): void {
    const { context } = board;
    clearSurface(board);

    context.strokeStyle = GRID_LINE;
    context.lineWidth = 1;
    for (let column = 1; column < BOARD_WIDTH; column += 1) {
      const x = column * CELL_SIZE + 0.5;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, BOARD_PIXEL_HEIGHT);
      context.stroke();
    }
    for (let row = 1; row < BOARD_HEIGHT - HIDDEN_ROWS; row += 1) {
      const y = row * CELL_SIZE + 0.5;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(BOARD_PIXEL_WIDTH, y);
      context.stroke();
    }

    for (let row = HIDDEN_ROWS; row < BOARD_HEIGHT; row += 1) {
      const boardRow = snapshot.board[row];
      if (boardRow === undefined) {
        continue;
      }
      for (let column = 0; column < BOARD_WIDTH; column += 1) {
        const cell = boardRow[column];
        if (cell) {
          drawBlock(
            context,
            column * CELL_SIZE,
            (row - HIDDEN_ROWS) * CELL_SIZE,
            CELL_SIZE,
            TETROMINO_COLORS[cell],
          );
        }
      }
    }

    const active = snapshot.active;
    const ghostY = snapshot.ghostY;
    if (active !== null && ghostY !== null) {
      const ghostMatrix = getRotatedMatrix(active.type, active.rotation);
      forEachFilledCell(ghostMatrix, (row, column) => {
        const boardY = ghostY + row;
        if (boardY < HIDDEN_ROWS || boardY >= BOARD_HEIGHT) {
          return;
        }
        const boardX = active.x + column;
        if (boardX < 0 || boardX >= BOARD_WIDTH) {
          return;
        }
        drawGhost(
          context,
          boardX * CELL_SIZE,
          (boardY - HIDDEN_ROWS) * CELL_SIZE,
          CELL_SIZE,
        );
      });
    }

    if (active !== null) {
      const matrix = getRotatedMatrix(active.type, active.rotation);
      forEachFilledCell(matrix, (row, column) => {
        const boardY = active.y + row;
        if (boardY < HIDDEN_ROWS || boardY >= BOARD_HEIGHT) {
          return;
        }
        const boardX = active.x + column;
        if (boardX < 0 || boardX >= BOARD_WIDTH) {
          return;
        }
        drawBlock(
          context,
          boardX * CELL_SIZE,
          (boardY - HIDDEN_ROWS) * CELL_SIZE,
          CELL_SIZE,
          TETROMINO_COLORS[active.type],
        );
      });
    }
  }

  return {
    render(snapshot: GameSnapshot): void {
      renderBoard(snapshot);
      if (snapshot.hold === null) {
        clearSurface(hold);
      } else {
        drawPreview(
          hold,
          getRotatedMatrix(snapshot.hold, 0),
          TETROMINO_COLORS[snapshot.hold],
        );
      }
      drawPreview(
        next,
        getRotatedMatrix(snapshot.next, 0),
        TETROMINO_COLORS[snapshot.next],
      );
    },
  };
}
