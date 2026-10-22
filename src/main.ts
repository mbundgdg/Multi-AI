import './styles.css';
import { createGame, type GameSnapshot } from './game/engine';
import { bindControls, type GameAction } from './input/controls';
import { createRenderer } from './render/canvas';

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`缺少必需的页面元素：${selector}`);
  }
  return element;
}

const boardCanvas = requireElement<HTMLCanvasElement>('#board-canvas');
const holdCanvas = requireElement<HTMLCanvasElement>('#hold-canvas');
const nextCanvas = requireElement<HTMLCanvasElement>('#next-canvas');
const scoreValue = requireElement<HTMLElement>('#score-value');
const linesValue = requireElement<HTMLElement>('#lines-value');
const levelValue = requireElement<HTMLElement>('#level-value');
const pauseButton = requireElement<HTMLButtonElement>('#pause-button');
const overlay = requireElement<HTMLElement>('#game-overlay');
const overlayTitle = requireElement<HTMLElement>('#overlay-title');
const overlayMessage = requireElement<HTMLElement>('#overlay-message');
const overlayAction = requireElement<HTMLButtonElement>('#overlay-action');
const touchControls = requireElement<HTMLElement>('#touch-controls');
const lcd = requireElement<HTMLElement>('#lcd');

const game = createGame();
const renderer = createRenderer(boardCanvas, holdCanvas, nextCanvas);

interface OverlayContent {
  title: string;
  message: string;
  action: string;
}

function overlayContentFor(snapshot: GameSnapshot): OverlayContent {
  switch (snapshot.status) {
    case 'ready':
      return {
        title: '口袋俄罗斯方块',
        message: '方向键移动，上键旋转，空格硬降。\n手机可使用下方触控键。',
        action: '开始游戏',
      };
    case 'paused':
      return {
        title: '已暂停',
        message: '按 P 或点击按钮继续游戏。',
        action: '继续游戏',
      };
    case 'gameover':
      return {
        title: '游戏结束',
        message: `最终分数 ${snapshot.score} 分\n消除 ${snapshot.lines} 行`,
        action: '重新开始',
      };
    default:
      return { title: '', message: '', action: '' };
  }
}

let lastOverlayKey = '';
let lastScore: number | null = null;
let lastLines: number | null = null;
let lastLevel: number | null = null;
let lastPauseLabel = '';
let flashTimer: number | null = null;
let previousTime = performance.now();
let frameId = 0;

function flashLineClear(): void {
  if (flashTimer !== null) {
    window.clearTimeout(flashTimer);
  }
  lcd.classList.remove('is-clearing');
  void lcd.offsetWidth;
  lcd.classList.add('is-clearing');
  flashTimer = window.setTimeout(() => {
    lcd.classList.remove('is-clearing');
    flashTimer = null;
  }, 280);
}

function syncDom(snapshot: GameSnapshot): void {
  if (snapshot.score !== lastScore) {
    scoreValue.textContent = String(snapshot.score);
    lastScore = snapshot.score;
  }
  if (snapshot.lines !== lastLines) {
    if (lastLines !== null && snapshot.lines > lastLines) {
      flashLineClear();
    }
    linesValue.textContent = String(snapshot.lines);
    lastLines = snapshot.lines;
  }
  if (snapshot.level !== lastLevel) {
    levelValue.textContent = String(snapshot.level);
    lastLevel = snapshot.level;
  }

  const pauseLabel = snapshot.status === 'paused' ? '继续' : '暂停';
  if (pauseLabel !== lastPauseLabel) {
    pauseButton.textContent = pauseLabel;
    lastPauseLabel = pauseLabel;
  }

  const overlayHidden = snapshot.status === 'playing';
  if (overlay.hidden !== overlayHidden) {
    overlay.hidden = overlayHidden;
  }
  if (snapshot.status !== 'playing') {
    const overlayKey = `${snapshot.status}:${snapshot.score}:${snapshot.lines}`;
    if (overlayKey !== lastOverlayKey) {
      const content = overlayContentFor(snapshot);
      overlayTitle.textContent = content.title;
      overlayMessage.textContent = content.message;
      overlayAction.textContent = content.action;
      lastOverlayKey = overlayKey;
    }
  }
}

function paint(): GameSnapshot {
  const snapshot = game.snapshot();
  renderer.render(snapshot);
  syncDom(snapshot);
  return snapshot;
}

function dispatch(action: GameAction): void {
  const snapshot = game.snapshot();
  if (action === 'pause') {
    if (snapshot.status === 'playing' || snapshot.status === 'paused') {
      game.togglePause();
      paint();
    }
    return;
  }
  if (action === 'restart') {
    game.restart();
    boardCanvas.focus();
    paint();
    return;
  }
  if (snapshot.status !== 'playing') {
    return;
  }
  switch (action) {
    case 'left':
      game.move(-1);
      break;
    case 'right':
      game.move(1);
      break;
    case 'soft-drop':
      game.softDrop();
      break;
    case 'rotate-cw':
      game.rotate(1);
      break;
    case 'rotate-ccw':
      game.rotate(-1);
      break;
    case 'hard-drop':
      game.hardDrop();
      break;
    case 'hold':
      game.hold();
      break;
    default:
      return;
  }
  paint();
}

const cleanupControls = bindControls({
  touchRoot: touchControls,
  pauseButton,
  dispatch,
});

function handleOverlayAction(): void {
  const status = game.snapshot().status;
  if (status === 'ready') {
    game.start();
  } else if (status === 'paused') {
    game.togglePause();
  } else if (status === 'gameover') {
    game.restart();
  }
  boardCanvas.focus();
  paint();
}

function handlePauseFocus(): void {
  boardCanvas.focus();
}

overlayAction.addEventListener('click', handleOverlayAction);
pauseButton.addEventListener('click', handlePauseFocus);

function frame(now: number): void {
  const delta = now - previousTime;
  previousTime = now;
  game.tick(delta);
  paint();
  frameId = window.requestAnimationFrame(frame);
}

function handleBeforeUnload(): void {
  window.cancelAnimationFrame(frameId);
  if (flashTimer !== null) {
    window.clearTimeout(flashTimer);
  }
  cleanupControls();
  overlayAction.removeEventListener('click', handleOverlayAction);
  pauseButton.removeEventListener('click', handlePauseFocus);
  window.removeEventListener('beforeunload', handleBeforeUnload);
}

window.addEventListener('beforeunload', handleBeforeUnload);

paint();
if (game.snapshot().status === 'ready') {
  overlayAction.focus();
}
frameId = window.requestAnimationFrame(frame);
