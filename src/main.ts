import './styles.css';

const REQUIRED_SELECTORS = [
  '#board-canvas',
  '#hold-canvas',
  '#next-canvas',
  '#score-value',
  '#lines-value',
  '#level-value',
  '#pause-button',
  '#game-overlay',
  '#overlay-title',
  '#overlay-message',
  '#overlay-action',
  '#touch-controls',
  '#lcd',
] as const;

for (const selector of REQUIRED_SELECTORS) {
  if (document.querySelector(selector) === null) {
    throw new Error(`缺少必需的页面元素：${selector}`);
  }
}
