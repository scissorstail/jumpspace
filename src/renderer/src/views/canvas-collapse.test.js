import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 터미널을 최대화한 동안 캔버스 영역은 높이 없이 접혀 있다. display: none으로 없애면 그동안 연 다이어그램의
// 연결선이 노드의 왼쪽 위에서 시작한다: Rete가 소켓의 위치를 offset으로 재는데, display: none 안에서는 모두 0이다.
describe('the canvas while the terminal panel is maximized', () => {
  const source = readFileSync(join(__dirname, 'Layout.vue'), 'utf8')
  const rule = source.match(/#workspace\.terminal-maximized > #editor-area \{[^}]*\}/)?.[0] || ''

  it('is collapsed and out of sight and focus, never taken out of the layout', () => {
    expect(rule).toMatch(/flex: 0 0 0px;/)
    expect(rule).toMatch(/visibility: hidden;/)
    expect(rule).not.toMatch(/display:/)
  })
})
