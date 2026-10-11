import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 탭 줄이 번호를 어디에 쓰는지, 최소화한 패널에 무엇이 남는지. 소스에서 읽는다: DOM 없이 도는 테스트라서.
const here = dirname(fileURLToPath(import.meta.url))
const read = name => readFileSync(join(here, name), 'utf8').replace(/\r\n/g, '\n')
const tabs = read('terminal-tabs.vue')
const panel = read('terminal-panel.vue')
const rule = selector => tabs.match(new RegExp(`\\n${selector.replace(/[.]/g, '\\.')} \\{\\n([\\s\\S]*?)\\n\\}`))?.[1] ?? ''

describe('the numbers of terminal tabs with the same name', () => {
  it('come from the tabs of the open diagram', () => {
    expect(tabs).toMatch(/numbers\(\) \{\n\s+return duplicateNumbers\(this\.sessions\)\n/)
    expect(tabs).toMatch(/label\(session\) \{\n\s+return numberedTitle\(session\.title, this\.numbers\.get\(session\.key\)\)\n/)
  })

  // 번호는 이름 뒤의 따로 된 칸이다: 이름이 잘려도 남는다.
  it('are shown after the name, in a part of the tab that is never cut off', () => {
    expect(tabs).toMatch(/<span class="terminal-tab-title">\{\{ session\.title \}\}<\/span>\n(?:\s+<!--.*-->\n)?\s+<span\n\s+v-if="numbers\.has\(session\.key\)"\n\s+class="terminal-tab-number"\n\s+>\(\{\{ numbers\.get\(session\.key\) \}\}\)<\/span>/)
    expect(rule('.terminal-tab-number')).toMatch(/flex: none;/)
    expect(rule('.terminal-tab-title')).toMatch(/text-overflow: ellipsis;/)
  })

  it('are part of the name in the tooltip and on the close button', () => {
    expect(tabs).toMatch(/:title="`\$\{label\(session\)\}: \$\{statusText\(session\)\}`"/)
    expect(tabs).toMatch(/:aria-label="`Close \$\{label\(session\)\}`"/)
  })
})

// 최소화하면 탭 줄만 창 아래쪽에 남는다 (owner, 2026-10-12). 전에는 패널이 통째로 사라지고 머리글에 단추가 생겼다.
describe('the minimized terminal panel', () => {
  it('stays as long as the diagram has terminals, without its screens and its resize edge', () => {
    expect(panel).toMatch(/<section\n\s+v-show="sessions\.length > 0"\n\s+class="terminal-panel"\n\s+:class="\{ 'is-maximized': isMaximized, 'is-minimized': !isOpen \}"/)
    expect(panel).toMatch(/<div\n\s+v-show="isOpen"\n\s+class="terminal-resize"/)
    expect(panel).toMatch(/<div\n\s+v-show="isOpen"\n\s+class="terminal-body"/)
  })

  // 정한 높이를 두면 탭 줄 아래에 빈 패널이 남는다
  it('is as high as its tab row', () => {
    expect(panel).toMatch(/:style="isMaximized \|\| !isOpen \? null : \{ height: `\$\{shownHeight\}px` \}"/)
  })

  it('turns the minimize button into the button that shows the terminals again', () => {
    expect(tabs).toMatch(/:aria-label="isMinimized \? 'Show terminals' : 'Minimize terminals'"/)
    expect(tabs).toMatch(/@click="\$emit\(isMinimized \? 'show' : 'hide'\)"/)
    expect(panel).toMatch(/:is-minimized="!isOpen"/)
    expect(panel).toMatch(/@hide="\$store\.commit\('terminalPanel', false\)"\n\s+@show="\$store\.commit\('terminalPanel', true\)"/)
  })

  // 보이는 터미널이 없으니 고른 탭도 없다. 탭을 누르면 그 터미널이 보인다 (terminalActivate가 패널을 연다).
  it('marks no tab as the selected one', () => {
    expect(tabs).toMatch(/active: session\.key === activeKey && !isMinimized,/)
    expect(tabs).toMatch(/:aria-selected="session\.key === activeKey && !isMinimized \? 'true' : 'false'"/)
  })

  // 탭 줄 아래의 줄은 탭과 터미널을 나누는 것이다. 터미널이 없으면 줄도 없다 (자리는 남는다: 높이가 그대로다).
  it('has no line under its tab row', () => {
    expect(tabs).toMatch(/<div\n\s+class="terminal-tabs"\n\s+:class="\{ 'is-minimized': isMinimized \}"\n/)
    expect(tabs).toMatch(/&\.is-minimized \{\n\s+border-bottom-color: transparent;\n/)
  })

  it('comes back when it is maximized from the tab row', () => {
    expect(panel).toMatch(/@maximize="maximize"/)
    expect(panel).toMatch(/maximize\(isMaximized\) \{\n\s+this\.\$store\.commit\('terminalMaximize', isMaximized\)\n\s+this\.\$store\.commit\('terminalPanel', true\)\n/)
  })
})
