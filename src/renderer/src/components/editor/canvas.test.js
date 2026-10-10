import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Windows의 checkout은 줄 끝이 CRLF일 수 있다.
const scss = readFileSync(join(__dirname, 'canvas.scss'), 'utf8').replace(/\r\n/g, '\n')

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

const stroke = text => text.match(/(?:^|\s)stroke: ([^;]+);/)?.[1]

describe('the signal on a path with a terminal session', () => {
  const idle = block(scss, '  .connection')
  const states = { live: block(scss, '  .is-live .connection'), connecting: block(scss, '  .is-connecting .connection') }

  // 신호가 선과 같은 색이면 흘러가도 보이지 않는다 (연결 중의 노란 선 위의 노란 신호가 그랬다).
  it.each(Object.keys(states))('has another color than its line while %s', state => {
    const line = stroke(block(states[state], '.main-path'))
    const signal = stroke(block(states[state], '.flow-path')) || stroke(block(idle, '.flow-path'))

    expect(line).toMatch(/^var\(--js-[\w-]+\)$/)
    expect(signal).toMatch(/^var\(--js-[\w-]+\)$/)
    expect(signal).not.toBe(line)
  })

  it.each(Object.keys(states))('is shown and moves while %s', state => {
    expect(block(states[state], '.flow-path')).toMatch(/display: inline;/)
    expect(block(idle, '.flow-path')).toMatch(/display: none;/)
    expect(block(idle, '.flow-path')).toMatch(/animation: connection-flow [\d.]+s linear infinite;/)
    expect(block(states[state], '.flow-path')).not.toMatch(/animation: none/)
  })
})
