import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Windows의 checkout은 줄 끝이 CRLF일 수 있다.
const read = (...parts) => readFileSync(join(__dirname, ...parts), 'utf8').replace(/\r\n/g, '\n')
const layout = read('Layout.vue')
const header = read('..', 'components', 'layout', 'main-header.vue')

// 머리글 오른쪽의 단추들(Layout.vue가 MainHeader의 slot에 넣는다)을 순서대로, 각 단추를 감싼 v-if 조건과 함께 읽는다.
const TAG = /<template\b(?:[^>"]|"[^"]*")*>|<\/template>|<b-button\b(?:[^>"]|"[^"]*")*>/g
const attribute = (tag, name) => tag.match(new RegExp(`\\s:?${name}="([^"]*)"`))?.[1]

function headerButtons() {
  const start = layout.indexOf('<template #main-navigator-toolbar>')
  const slot = layout.slice(start, layout.indexOf('</MainHeader>', start))
  const conditions = []
  const buttons = []

  for (const [tag] of slot.matchAll(TAG)) {
    if (tag === '</template>') conditions.pop()
    else if (tag.startsWith('<template')) conditions.push(attribute(tag, 'v-if') || null)
    else buttons.push({ label: attribute(tag, 'aria-label'), when: [...conditions, attribute(tag, 'v-if')].filter(Boolean), classes: attribute(tag, 'class') })
  }

  return buttons
}

describe('the buttons at the right of the header', () => {
  const buttons = headerButtons()
  const named = text => buttons.find(x => x.label?.includes(text))

  it('are read from the layout', () => {
    expect(buttons.map(x => x.label?.match(/Show terminals|node details|Reset view|Arrange nodes|Lock editor/)?.[0])).toEqual([
      'Show terminals',
      'node details',
      'Arrange nodes',
      'Reset view',
      'Lock editor'
    ])
  })

  // 편집 모드를 바꾸는 단추는 늘 같은 자리에 있다: 설정(톱니) 단추의 바로 왼쪽 (owner, 2026-10).
  // 다른 단추는 그 왼쪽에 생기고 사라진다. 전에는 잠금을 풀면 그 오른쪽에 단추 둘이 생겨서 자물쇠가 밀려났다.
  it('end with the lock button, so that it is always the left neighbor of the gear', () => {
    expect(buttons[buttons.length - 1].label).toMatch(/Unlock editor.*Lock editor/)

    const tools = header.slice(header.indexOf('<div class="header-tools">'), header.indexOf('</template>'))
    const order = [...tools.matchAll(/<slot name="main-navigator-toolbar" \/>|<hr\b|<b-dropdown\b|<b-button\b|icon="gear"/g)].map(x => x[0])

    // slot(다이어그램 단추들), 구분선, 톱니 메뉴: 그 사이에 다른 단추는 없다
    expect(order).toEqual(['<slot name="main-navigator-toolbar" />', '<hr', '<b-dropdown', 'icon="gear"'])
  })

  // 숫자 배지가 있는 단추는 글자 줄에 놓으면 그림만 있는 단추보다 1px쯤 높다. 터미널 패널을 숨길 때마다 머리글이
  // 그만큼 높아져서 캔버스가 줄었고, 패널이 없을 때의 캔버스 높이가 패널을 숨겼을 때와 열었을 때 서로 달랐다.
  it('keep the button with the count as high as the others', () => {
    expect(named('Show terminals').classes).toBe('d-inline-flex align-items-center')
  })

  it('show the lock button whenever a diagram is on screen, locked or not', () => {
    expect(named('Lock editor').when).toEqual(['editorData && !isTerminalMaximized'])
  })

  it('show the button that changes the diagram only while it is unlocked', () => {
    expect(named('Arrange nodes').when).toEqual(['editorData && !isTerminalMaximized', '!isEditorLocked'])
  })

  // 보기를 처음으로 돌리는 것은 다이어그램을 바꾸지 않는다: 잠긴 동안에도 있다 (owner, 2026-10).
  // 자물쇠의 바로 왼쪽이라서, 잠금을 풀어 정렬 단추가 생겨도 제자리에 있다.
  it('show Reset view whenever a diagram is on screen, right before the lock', () => {
    expect(named('Reset view').when).toEqual(['editorData && !isTerminalMaximized'])
    expect(buttons[buttons.length - 2].label).toBe('Reset view')
  })
})
