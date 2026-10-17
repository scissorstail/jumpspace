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
    expect(tabs).toMatch(/:title="`\$\{label\(session\)\}: \$\{statusText\(session\)\}\$\{routeText\(session\)\}`"/)
    expect(tabs).toMatch(/:aria-label="`Close \$\{label\(session\)\}`"/)
  })
})

// 글꼴 크기는 설정에 있고 (Ctrl +/-/0), 화면마다 보일 때 맞춘다: 숨은 화면은 잴 수 없다.
describe('the font size of the terminals', () => {
  // 보이는 화면에만 맞추는 일(fit)과 키가 바꾸는 값(changeFontSize)은 terminal-panel-methods.test.js가 돌려 본다.
  it('comes from the settings, for a new terminal and when the setting changes', () => {
    expect(panel).toMatch(/fontSize\(\) \{\n\s+return this\.\$store\.getters\.setting\.terminalFontSize\n/)
    expect(panel).toMatch(/\n\s+fontSize: this\.fontSize,\n/)
    expect(panel).toMatch(/\n {4}fontSize\(\) \{\n\s+this\.fitActive\(\)\n/)
  })

  it('is changed by the keys', () => {
    expect(panel).toMatch(/if \(shortcut\.startsWith\('font-'\)\) \{?\n?\s*this\.changeFontSize\(shortcut\)/)
  })
})

// 굵은 글꼴을 터미널보다 늦게 읽으면 굵은 글자가 두 글꼴로 섞여 보인다 (#154)
describe('the font of the terminals', () => {
  it('is loaded in both weights when the panel is made, before a terminal draws with it', () => {
    expect(panel).toMatch(/\n {4}this\.loadFonts\(\)\n {2}\},\n {2}beforeDestroy/)
    expect(panel).toMatch(/await Promise\.all\(\['400', '700'\]\.map\(weight => document\.fonts\.load\(`\$\{weight\} \$\{this\.fontSize\}px \$\{FONT\}`\)\)\)/)
    expect(panel).toMatch(/const FONT = '"JetBrains Mono"'\nconst FONT_FAMILY = `\$\{FONT\}, /)
    expect(panel).toMatch(/fontFamily: FONT_FAMILY,/)
  })

  it('is drawn again by the terminals that were there before it was loaded', () => {
    expect(panel).toMatch(/for \(const \[, entry\] of this\.terms\) entry\.webgl\?\.clearTextureAtlas\(\)/)
    expect(panel).toMatch(/entry\.term\.loadAddon\(webgl\)\n\s+entry\.webgl = webgl\n/)
    expect(panel).toMatch(/webgl\.dispose\(\)\n\s+entry\.webgl = null\n/)
  })
})

describe('closing a terminal tab', () => {
  // 브라우저의 탭처럼. mousedown을 막지 않으면 Windows에서 가운데 단추가 자동 스크롤을 시작한다.
  it('works with a middle click on the tab, like the close button', () => {
    expect(tabs).toMatch(/@mousedown\.middle\.prevent\n\s+@auxclick\.middle="\$emit\('close', session\)"/)
    expect(tabs).toMatch(/@click\.stop="\$emit\('close', session\)"/)
  })
})

// 탭 줄을 쓴 뒤 키보드는 터미널에 있다 (#266). 패널이 어느 터미널에 주는지는 terminal-panel-methods.test.js가 돌려 본다.
describe('the keyboard after a use of the tab row', () => {
  // Enter와 Space는 막는다: 키보드가 그 터미널로 옮겨 간 뒤 그 Enter가 터미널에 들어가 세션으로 갔다.
  it('is given back by the panel for a tab chosen with the mouse or the keys, and at the end of every drag', () => {
    expect(tabs).toMatch(/@click="clicked\(session, \$event\)"/)
    expect(tabs).toMatch(/@keydown\.enter\.self\.prevent="\$emit\('activate', session\.key\)"\n\s+@keydown\.space\.self\.prevent="\$emit\('activate', session\.key\)"/)
    expect(tabs).toMatch(/@input="dropped\(row, \$event\)"\n\s+@end="\$emit\('dragged'\)"/)
    expect(panel).toMatch(/@activate="selectTab"/)
    expect(panel).toMatch(/@dragged="dragged"/)
  })

  // 놓아서 순서가 바뀌면 화면들도 그 순서로 다시 놓이고, 옮겨진 화면에 있던 키보드는 빠진다 (#266, 확인 폴더의
  // lists/focus-move-probe.cjs). 패널은 끌기가 끝났다는 알림을 받자마자 키보드를 주므로, 그 알림은 다시 그린 뒤에 와야 한다:
  // vuedraggable은 Sortable의 이벤트마다 목록을 먼저 바꾸고(input) 그 이벤트는 $nextTick에 보낸다. 앱에 들어가는 것은
  // package.json의 module이다. 이것이 바뀌면 패널의 dragged()가 다시 그리기를 기다려야 한다.
  it('hears of the end of a drag from vuedraggable only after the new order has been drawn', () => {
    const lib = join(here, '..', '..', '..', '..', '..', 'node_modules', 'vuedraggable')
    const entry = JSON.parse(readFileSync(join(lib, 'package.json'), 'utf8')).module
    const code = readFileSync(join(lib, entry), 'utf8').replace(/\r\n/g, '\n')

    expect(code).toMatch(/function emit\(evtName, evtData\) \{\n\s+var _this = this;\n\n\s+this\.\$nextTick\(function \(\) \{\n\s+return _this\.\$emit\(evtName\.toLowerCase\(\), evtData\);\n/)
    expect(code).toMatch(/_this2\["onDrag" \+ evtName\]\(evtData\);\n\s+\}\n\n\s+emit\.call\(_this2, evtName, evtData\);/)
    expect(code).toMatch(/var eventsListened = \[[^\]]*"End"[^\]]*\];/)
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
    expect(tabs).toMatch(/<div\n\s+class="terminal-tabs"\n\s+:class="\{ 'is-minimized': isMinimized, 'is-split': rows\.length > 1 \}"\n/)
    expect(tabs).toMatch(/&\.is-minimized \{\n\s+border-bottom-color: transparent;\n/)
  })

  it('comes back when it is maximized from the tab row', () => {
    expect(panel).toMatch(/@maximize="maximize"/)
    expect(panel).toMatch(/maximize\(isMaximized\) \{\n\s+this\.\$store\.commit\('terminalMaximize', isMaximized\)\n\s+this\.\$store\.commit\('terminalPanel', true\)\n/)
  })
})
