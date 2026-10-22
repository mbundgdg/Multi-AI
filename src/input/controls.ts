export type GameAction =
  | 'left'
  | 'right'
  | 'soft-drop'
  | 'rotate-cw'
  | 'rotate-ccw'
  | 'hard-drop'
  | 'hold'
  | 'pause'
  | 'restart';

const KEY_ACTIONS: Readonly<Record<string, GameAction>> = {
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
  ArrowDown: 'soft-drop',
  s: 'soft-drop',
  S: 'soft-drop',
  ArrowUp: 'rotate-cw',
  x: 'rotate-cw',
  X: 'rotate-cw',
  w: 'rotate-cw',
  W: 'rotate-cw',
  z: 'rotate-ccw',
  Z: 'rotate-ccw',
  ' ': 'hard-drop',
  Space: 'hard-drop',
  c: 'hold',
  C: 'hold',
  Shift: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
  p: 'pause',
  P: 'pause',
  Escape: 'pause',
  r: 'restart',
  R: 'restart',
};

const GAME_ACTIONS: readonly GameAction[] = [
  'left',
  'right',
  'soft-drop',
  'rotate-cw',
  'rotate-ccw',
  'hard-drop',
  'hold',
  'pause',
  'restart',
];

const REPEATABLE_ACTIONS: ReadonlySet<GameAction> = new Set([
  'left',
  'right',
  'soft-drop',
]);

const REPEAT_DELAY_MS = 250;
const REPEAT_INTERVAL_MS = 110;

export function keyToAction(key: string): GameAction | null {
  return KEY_ACTIONS[key] ?? null;
}

function isGameAction(value: string): value is GameAction {
  return (GAME_ACTIONS as readonly string[]).includes(value);
}

interface RepeatState {
  delayTimer: number | null;
  intervalTimer: number | null;
}

export function bindControls(options: {
  touchRoot: HTMLElement;
  pauseButton: HTMLButtonElement;
  dispatch: (action: GameAction) => void;
}): () => void {
  const { touchRoot, pauseButton, dispatch } = options;
  const listeners: Array<{
    target: EventTarget;
    type: string;
    handler: EventListener;
  }> = [];
  const repeats = new Map<HTMLElement, RepeatState>();

  function listen(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    listeners.push({ target, type, handler });
  }

  function clearRepeat(button: HTMLElement): void {
    const state = repeats.get(button);
    if (state === undefined) {
      return;
    }
    if (state.delayTimer !== null) {
      window.clearTimeout(state.delayTimer);
    }
    if (state.intervalTimer !== null) {
      window.clearInterval(state.intervalTimer);
    }
    repeats.delete(button);
  }

  function clearAllRepeats(): void {
    for (const button of [...repeats.keys()]) {
      clearRepeat(button);
    }
  }

  const onKeyDown: EventListener = (event) => {
    const keyboardEvent = event as KeyboardEvent;
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLButtonElement ||
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement
    ) {
      return;
    }
    const action = keyToAction(keyboardEvent.key);
    if (action === null) {
      return;
    }
    keyboardEvent.preventDefault();
    if (
      keyboardEvent.repeat &&
      (action === 'pause' ||
        action === 'hold' ||
        action === 'restart' ||
        action === 'hard-drop')
    ) {
      return;
    }
    dispatch(action);
  };
  listen(window, 'keydown', onKeyDown);

  const onPauseClick: EventListener = () => {
    dispatch('pause');
  };
  listen(pauseButton, 'click', onPauseClick);

  const buttons = Array.from(
    touchRoot.querySelectorAll<HTMLElement>('[data-action]'),
  );
  for (const button of buttons) {
    const rawAction = button.getAttribute('data-action');
    if (rawAction === null || !isGameAction(rawAction)) {
      continue;
    }
    const action = rawAction;

    const onPointerDown: EventListener = (event) => {
      event.preventDefault();
      dispatch(action);
      if (!REPEATABLE_ACTIONS.has(action)) {
        return;
      }
      clearRepeat(button);
      const delayTimer = window.setTimeout(() => {
        const intervalTimer = window.setInterval(() => {
          dispatch(action);
        }, REPEAT_INTERVAL_MS);
        repeats.set(button, { delayTimer: null, intervalTimer });
      }, REPEAT_DELAY_MS);
      repeats.set(button, { delayTimer, intervalTimer: null });
    };
    const onPointerEnd: EventListener = () => {
      clearRepeat(button);
    };

    listen(button, 'pointerdown', onPointerDown);
    listen(button, 'pointerup', onPointerEnd);
    listen(button, 'pointercancel', onPointerEnd);
    listen(button, 'pointerleave', onPointerEnd);
  }

  return () => {
    clearAllRepeats();
    for (const { target, type, handler } of listeners) {
      target.removeEventListener(type, handler);
    }
    listeners.length = 0;
  };
}
