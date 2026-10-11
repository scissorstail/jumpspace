import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 탭 줄이 번호를 어디에 쓰는지. 소스에서 읽는다: DOM 없이 도는 테스트라서.
const here = dirname(fileURLToPath(import.meta.url))
const tabs = readFileSync(join(here, 'terminal-tabs.vue'), 'utf8').replace(/\r\n/g, '\n')
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
