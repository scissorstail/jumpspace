import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// 앱 안에서는 아무것도 저절로 움직이지 않고, 모양은 한 번에 바뀐다 (owner, 2026-10-11: "애니메이션을 전부 끄세요").
// 실제 창에서 캔버스가 다시 그려지지 않는 것처럼 보였고, 그 원인을 찾는 대신 움직이는 것을 모두 뺐다:
// 연결선 위의 신호, 깜박이는 점, 우클릭 메뉴가 커지며 나오는 것, CRT 배경의 내려가는 띠, 탭을 끌 때 비켜 주는 움직임,
// 그리고 색이나 투명도가 서서히 바뀌는 transition. 다시 생기면 여기서 걸린다.
// (Bootstrap이 가져온 것은 여기서 보지 않는다. 우리가 쓴 스타일과 화면 코드만 본다.)
const root = __dirname

const sources = dir =>
  readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(scss|css|vue|js)$/.test(entry) && !/\.test\.js$/.test(entry) ? [path] : []
  })

// 주석에는 뺀 것의 이름이 남아 있을 수 있다
const code = text =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')

const motion = [
  ['an animation', /\banimation(?:-[a-z-]+)?\s*[:=]/],
  ['keyframes', /@keyframes\b/],
  ['a transition', /\btransition(?:-[a-z-]+)?\s*:(?!\s*none\b)/],
  ['a Vue transition', /<transition(?:-group)?\b/],
  ['a blinking terminal cursor', /\bcursorBlink\s*:\s*true\b/]
]

const found = pattern =>
  sources(root).flatMap(path =>
    code(readFileSync(path, 'utf8'))
      .split(/\r?\n/)
      .filter(line => pattern.test(line))
      .map(line => `${relative(root, path).replace(/\\/g, '/')}: ${line.trim()}`)
  )

describe('nothing in the app moves by itself', () => {
  it('looks at the styles and the components', () => {
    const files = sources(root).map(path => relative(root, path).replace(/\\/g, '/'))

    expect(files).toContain('components/editor/canvas.scss')
    expect(files).toContain('components/editor/context-menu.scss')
    expect(files).toContain('components/layout/scene-backdrop.vue')
    expect(files).toContain('components/terminal/terminal-tabs.vue')
    expect(files).toContain('components/terminal/terminal-panel.vue')
    expect(files).toContain('assets/theme.scss')
  })

  it.each(motion)('no file has %s', (name, pattern) => {
    expect(found(pattern)).toEqual([])
  })

  // 끄는 것(transition: none)은 움직임이 아니다. 주석에 남은 이름도 세지 않는다.
  it('does not take switching a transition off, or a comment, for motion', () => {
    const hit = (name, line) => motion.find(x => x[0] === name)[1].test(code(line))

    expect(hit('a transition', '  transition: none !important;')).toBe(false)
    expect(hit('a transition', '  transition: opacity 0.15s;')).toBe(true)
    expect(hit('a transition', '  transition-duration: 0.3s;')).toBe(true)
    expect(hit('an animation', '  // animation: blink 1s infinite;')).toBe(false)
    expect(hit('an animation', '  animation: blink 1s infinite;')).toBe(true)
    expect(hit('an animation', '  animation-duration: 0.6s;')).toBe(true)
    expect(hit('an animation', '      :animation="120"')).toBe(true)
    expect(hit('an animation', '  return typeof requestAnimationFrame === \'function\'')).toBe(false)
  })
})
