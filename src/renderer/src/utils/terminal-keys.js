// 앱 안의 터미널에서 쓰는 키와 마우스: Info 창이 그대로 보여 준다 (README에만 적혀 있었다).
//   keys: 보여 줄 키들 (하나를 누르면 된다). does: 그 키가 하는 일.
//   presses: terminalShortcut에 넣어 볼 keydown들과 그 답(shortcut). 테스트가 목록과 실제 규칙을 맞춰 본다:
//   키를 바꾸거나 더하면 여기도 바꿔야 한다. 키보드 규칙 밖의 것(오른쪽 클릭, Enter, 가운데 클릭, Ctrl+클릭)은 presses가 없다.
const ctrl = (code, key, more = {}) => ({ type: 'keydown', ctrlKey: true, code, key, ...more })

export const TERMINAL_KEYS = [
  {
    keys: ['Ctrl+Shift+C', 'Ctrl+Insert', 'Ctrl+C'],
    does: 'Copy. Ctrl+C only with a selection.',
    shortcut: 'copy',
    presses: [ctrl('KeyC', 'C', { shiftKey: true }), ctrl('Insert', 'Insert'), ctrl('KeyC', 'c', { hasSelection: true })]
  },
  {
    keys: ['Ctrl+V', 'Ctrl+Shift+V', 'Shift+Insert'],
    does: 'Paste.',
    shortcut: 'paste',
    presses: [ctrl('KeyV', 'v'), ctrl('KeyV', 'V', { shiftKey: true })]
  },
  {
    keys: ['Right click'],
    does: 'Copy the selection, else paste.'
  },
  {
    keys: ['Ctrl+Shift+F'],
    does: 'Find in the output that scrolled by.',
    shortcut: 'find',
    presses: [ctrl('KeyF', 'F', { shiftKey: true })]
  },
  {
    keys: ['Ctrl +'],
    does: 'Bigger text in all terminals.',
    shortcut: 'font-up',
    presses: [ctrl('Equal', '='), ctrl('Equal', '+', { shiftKey: true }), ctrl('NumpadAdd', '+')]
  },
  {
    keys: ['Ctrl -'],
    does: 'Smaller text.',
    shortcut: 'font-down',
    presses: [ctrl('Minus', '-'), ctrl('NumpadSubtract', '-')]
  },
  {
    keys: ['Ctrl+0'],
    does: 'Text back to its first size.',
    shortcut: 'font-reset',
    presses: [ctrl('Digit0', '0'), ctrl('Numpad0', '0')]
  },
  {
    keys: ['Enter'],
    does: 'In an ended tab: connect again.'
  },
  {
    keys: ['Middle click'],
    does: 'On a tab: close it.'
  },
  {
    keys: ['Ctrl+click'],
    does: 'On a tab: open the same connection again.'
  }
]
