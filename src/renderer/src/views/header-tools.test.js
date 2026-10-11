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
    else buttons.push({ label: attribute(tag, 'aria-label'), when: [...conditions, attribute(tag, 'v-if')].filter(Boolean) })
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
      'Reset view',
      'Arrange nodes',
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

  it('show the lock button whenever a diagram is on screen, locked or not', () => {
    expect(named('Lock editor').when).toEqual(['editorData && !isTerminalMaximized'])
  })

  it('show the buttons that change the diagram only while it is unlocked', () => {
    expect(named('Arrange nodes').when).toEqual(['editorData && !isTerminalMaximized', '!isEditorLocked'])
  })
})
