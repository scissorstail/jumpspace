import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Windows의 checkout은 줄 끝이 CRLF일 수 있다.
const read = (...parts) => readFileSync(join(__dirname, ...parts), 'utf8').replace(/\r\n/g, '\n')
const scss = read('canvas.scss')
const theme = read('..', '..', 'assets', 'theme.scss')

// 선택자로 시작하는 블록의 내용 (중괄호 짝을 맞춰 자른다)
function block(source, selector) {
  const start = source.indexOf(`${selector} {`)
  if (start < 0) return ''
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}' && --depth === 0) return source.slice(source.indexOf('{', start) + 1, i)
  }
  return ''
}

// 움직이는 신호와 깜박이는 점은 없다 (owner, 2026-10: 애니메이션을 모두 껐다. src/renderer/src/motion.test.js).
// 그래서 경로의 상태는 가만히 있는 모양만으로 구분되어야 한다: 선의 색과 굵기, 화살표의 색, 노드의 점.
describe('the states of a path with a terminal session', () => {
  const plain = scss.replace(/^\s*\/\/.*$/gm, '')
  const lines = {
    idle: block(scss, '  .connection'),
    connecting: block(scss, '  .is-connecting .connection'),
    live: block(scss, '  .is-live .connection'),
    failed: block(scss, '  .is-failed .connection')
  }
  const value = (text, property) => text.match(new RegExp(`(?:^|\\s)${property}: ([^;]+);`))?.[1]
  const line = state => block(lines[state], '.main-path')
  const width = state => Number(value(line(state), 'stroke-width')?.replace('px', ''))

  // 점의 색: 그 상태의 선택자가 든 규칙 가운데 뒤에 오는 것이 이긴다
  const dot = state =>
    [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectors]) => selectors.split(',').some(x => x.trim() === `.is-${state} .node.site::after`))
      .map(([, , body]) => value(body, 'background'))
      .filter(Boolean)
      .pop()

  // 색 묶음마다 변수의 값이 다르다. 이름이 달라도 값이 같으면(예: 해의 색과 연결 중의 노랑) 구분되지 않는다.
  const shared = Object.fromEntries([...block(theme, '\n:root').matchAll(/(--js-[a-z0-9-]+): (#[0-9a-f]{6});/g)].map(([, key, hex]) => [key, hex]))
  const palettes = [...theme.matchAll(/:root\[data-theme='([a-z-]+)'\] \{\n([^}]+)\}/g)].map(([, name, body]) => ({
    name,
    colors: { ...shared, ...Object.fromEntries([...body.matchAll(/(--js-[a-z0-9-]+): (#[0-9a-f]{6});/g)].map(([, key, hex]) => [key, hex])) }
  }))
  const color = (palette, text) => palette.colors[text?.match(/^var\((--js-[\w-]+)\)$/)?.[1]]

  it('reads the three palettes and the colors they share', () => {
    expect(palettes.map(p => p.name)).toEqual(['neon-night', 'sunset-drive', 'vapor-blue'])
    expect(shared['--js-live']).toMatch(/^#[0-9a-f]{6}$/)
    expect(shared['--js-connecting']).toMatch(/^#[0-9a-f]{6}$/)
  })

  it.each(['connecting', 'live'])('a path that is %s differs from an idle one by the color and the width of its line and by its arrow', state => {
    expect(width('idle')).toBe(3)
    expect(width(state)).toBe(4)

    for (const palette of palettes) {
      const [stroke, idleStroke] = [state, 'idle'].map(x => color(palette, value(line(x), 'stroke')))
      const [arrow, idleArrow] = [state, 'idle'].map(x => color(palette, value(block(lines[x], '.marker'), 'fill')))

      expect(stroke, palette.name).toMatch(/^#[0-9a-f]{6}$/)
      expect(arrow, palette.name).toMatch(/^#[0-9a-f]{6}$/)
      expect(stroke, palette.name).not.toBe(idleStroke)
      expect(arrow, palette.name).not.toBe(idleArrow)
    }
  })

  it('connecting and connected differ by the color of the line and of the dot on the nodes', () => {
    for (const palette of palettes) {
      expect(color(palette, value(line('connecting'), 'stroke')), palette.name).not.toBe(color(palette, value(line('live'), 'stroke')))
      expect(color(palette, dot('connecting')), palette.name).toMatch(/^#[0-9a-f]{6}$/)
      expect(color(palette, dot('live')), palette.name).toMatch(/^#[0-9a-f]{6}$/)
      expect(color(palette, dot('connecting')), palette.name).not.toBe(color(palette, dot('live')))
    }
  })

  // 실패의 빨강은 주색(분홍)과 가깝다. 실패한 선만 점선이고, 점의 색도 따로 있다.
  it('a failed path is the only dashed one and has a dot of its own color', () => {
    expect(value(line('failed'), 'stroke-dasharray')).toMatch(/^\d+ \d+$/)
    for (const state of ['idle', 'connecting', 'live']) expect(value(line(state), 'stroke-dasharray'), state).toBeUndefined()

    for (const palette of palettes) {
      const failed = color(palette, dot('failed'))

      expect(failed, palette.name).toMatch(/^#[0-9a-f]{6}$/)
      expect([color(palette, dot('connecting')), color(palette, dot('live'))], palette.name).not.toContain(failed)
    }
  })
})

// 고른 터미널 탭을 연 노드는 선택한 노드처럼 보인다. 모양을 두 군데에 적으면 어긋나므로 한 규칙을 함께 쓴다.
describe('the node of the selected terminal tab', () => {
  const plain = scss.replace(/^\s*\/\/.*$/gm, '')
  const [, selectors = '', body = ''] = plain.match(/([^{}]*\.is-active-terminal \.node\.site[^{}]*) \{([^{}]*)\}/) || []

  it('has a pink frame and a sun shadow', () => {
    expect(selectors.split(',').map(x => x.trim())).toEqual(['.is-active-terminal .node.site'])
    expect(body).toMatch(/outline-color: var\(--js-primary\);/)
    expect(body).toMatch(/box-shadow: 6px 6px 0 var\(--js-sun\);/)
  })

  // 편집 중에 누른 노드(Rete의 .selected)에는 모양이 없다 (owner, 2026-10-11): 선택해도 할 수 있는 일이 없다.
  it('is the only marked node: a node that was clicked gets no look', () => {
    expect(plain).not.toMatch(/\.selected/)
  })

  // 올렸을 때의 색(:hover)과 선택자의 무게가 같아서 뒤에 오는 쪽이 이긴다.
  it('keeps its frame while the mouse is over the node', () => {
    const hover = scss.indexOf('&:hover {\n      outline-color:')

    expect(hover).toBeGreaterThan(-1)
    expect(scss.indexOf('.is-active-terminal .node.site {')).toBeGreaterThan(hover)
  })

  // 노드에 올리면 색만 바뀐다 (owner, 2026-10-11): 움직이거나 그림자가 커지지 않는다.
  it('changes only colors under the mouse and does not move', () => {
    const hover = scss.match(/\.node\.site \{[\s\S]*?&:hover \{\n([\s\S]*?)\n {4}\}/)?.[1] ?? ''

    expect(hover.split('\n').map(x => x.trim().split(':')[0])).toEqual(['outline-color', 'background'])
    expect(scss).not.toContain('translate(')
  })
})

// 잠긴 노드는 단추 말고는 마우스에 반응하지 않는다 (owner, 2026-10-15). 누름은 utils/locked-press.js가 캔버스로 넘기고,
// 글자의 툴팁은 남는다 (owner, 같은 날 뒤에: "툴팁은 나오지만 드래그만 안되게"). 단추를 띄우는 :hover는 component.vue에 있고 그대로다.
describe('a locked node', () => {
  const value = (text, property) => text.match(new RegExp(`(?:^|\\s)${property}: ([^;]+);`))?.[1]
  // 블록 바로 안의 선언만 (안에 든 블록은 뺀다)
  const own = text => {
    let rest = text
    while (/\{[^{}]*\}/.test(rest)) rest = rest.replace(/[^{};]*\{[^{}]*\}/g, '')
    return rest
  }
  const resting = own(block(scss, '  .node.site'))
  const restingTab = own(block(scss, '  .is-active-terminal .node.site'))
  const locked = block(scss, '  &.locked')
  const node = block(locked, '.node.site')
  const hover = block(node, '&:hover')
  const tabHover = block(locked, '.is-active-terminal .node.site:hover')

  it('looks the same with the mouse over it as without', () => {
    expect(value(resting, 'outline')).toMatch(/ var\(--js-[\w-]+\)$/)
    expect(value(hover, 'outline-color')).toBe(value(resting, 'outline').split(' ').pop())
    expect(value(hover, 'background')).toBe(value(resting, 'background'))
    // 잠그지 않은 노드는 올리면 색이 바뀐다
    expect(value(block(block(scss, '  .node.site'), '&:hover'), 'outline-color')).not.toBe(value(hover, 'outline-color'))
  })

  it('keeps the look of the node of the selected terminal tab with the mouse over it', () => {
    expect(value(tabHover, 'outline-color')).toBe(value(restingTab, 'outline-color'))
    expect(value(tabHover, 'background')).toBe(value(restingTab, 'background'))
    expect(own(tabHover).split('\n').map(x => x.trim().split(':')[0]).filter(Boolean)).toEqual(['outline-color', 'background'])
  })

  it('shows the arrow of the canvas over the node and its sockets, not the hand of something to press', () => {
    expect(value(own(node), 'cursor')).toBe('default')
    expect(value(own(block(node, '.socket')), 'cursor')).toBe('default')
  })

  it('keeps its sockets in the dim color of the lines', () => {
    const socket = block(node, '.socket')

    expect(socket).toMatch(/&\.input,\n\s*&\.output \{\n\s*border-color: var\(--js-line\);/)
    expect(socket).toMatch(/\n\s*&\.output \{\n\s*background: var\(--js-line\);/)
  })
})

// 출력이 오가는 세션의 노드에서 초록 점이 깜박인다 (owner, 2026-10-15: "작업중에 노드에 초록색 불이 깜빡이게").
// 앱에서 저절로 움직이는 둘째 것이다 (motion.test.js가 그 두 줄만 받는다). 노란 점과 빨간 점, 다른 무엇도 깜박이지 않는다.
describe('the dot of a busy node', () => {
  const plain = scss.replace(/^\s*\/\/.*$/gm, '')
  const rules = [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({ selectors: selectors.split(',').map(x => x.trim()), body }))
  const animated = rules.filter(rule => /(?:^|\s)animation:/.test(rule.body))
  const frames = block(scss, '@keyframes js-node-busy')

  it('blinks only on a node with a logged-in session that is busy', () => {
    expect(animated.map(rule => rule.selectors)).toEqual([['.is-live.is-busy .node.site::after']])
  })

  it('switches at once, twice a second, as long as the node is busy', () => {
    expect(animated[0].body.match(/animation: ([^;]+);/)[1]).toBe('js-node-busy 0.5s steps(1, end) infinite')
  })

  it('dims the dot half of the time instead of hiding it, and keeps its color', () => {
    const opacity = Number(frames.match(/50% \{\s*opacity: ([\d.]+);\s*\}/)?.[1])

    expect(opacity).toBeGreaterThan(0)
    expect(opacity).toBeLessThan(1)
    expect(frames).not.toMatch(/background|color|visibility|display/)
    expect(animated[0].body).not.toMatch(/background/)
  })
})
