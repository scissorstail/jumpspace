import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TERMINAL_KEYS } from './terminal-keys'
import { terminalShortcut } from './terminal-sessions'

const here = dirname(fileURLToPath(import.meta.url))
const read = path => readFileSync(join(here, path), 'utf8').replace(/\r\n/g, '\n')

// Info 창이 보여 주는 목록이 터미널의 실제 규칙과 같은지
describe('the list of terminal keys', () => {
  it('names keys that do what the list says', () => {
    for (const row of TERMINAL_KEYS.filter(row => row.presses)) {
      expect(row.presses.length).toBeGreaterThan(0)
      for (const { hasSelection, ...event } of row.presses) {
        expect(terminalShortcut(event, { hasSelection }), `${row.keys[0]}: ${event.code}`).toBe(row.shortcut)
      }
    }
  })

  // 새 단축키가 생기면 목록에도 있어야 한다
  it('has a row for everything the terminal takes from the keyboard', () => {
    const rule = read('terminal-sessions.js').match(/export function terminalShortcut[\s\S]*?\n}\n/)[0]
    const answers = [...new Set([...rule.matchAll(/'([a-z-]+)'(?= :| \?|\n| *$)/gm)].map(match => match[1]).filter(name => name !== 'keydown'))]
    expect(answers.sort()).toEqual(['copy', 'find', 'font-down', 'font-reset', 'font-up', 'paste'])
    expect(TERMINAL_KEYS.map(row => row.shortcut).filter(Boolean).sort()).toEqual(answers)
  })

  it('says what each key does, in a sentence, and no key twice', () => {
    const all = TERMINAL_KEYS.flatMap(row => row.keys)
    expect(new Set(all).size).toBe(all.length)
    for (const row of TERMINAL_KEYS) {
      expect(row.keys.length).toBeGreaterThan(0)
      expect(row.does).toMatch(/^[A-Z].*\.$/)
    }
  })

  // 키보드 규칙 밖의 세 가지는 그 일을 하는 코드가 있는지 본다
  it('lists the mouse and Enter only while the code still does them', () => {
    const without = TERMINAL_KEYS.filter(row => !row.presses).map(row => row.keys[0])
    expect(without).toEqual(['Right click', 'Enter', 'Middle click'])
    expect(read('../components/terminal/terminal-panel.vue')).toMatch(/if \(data === '\\r'\) this\.reconnect\(/)
    expect(read('../components/terminal/terminal-panel.vue')).toContain('rightClickAction(')
    expect(read('../components/terminal/terminal-tabs.vue')).toContain('@auxclick.middle="$emit(\'close\', session)"')
  })

  it('is what the Info window shows', () => {
    const popup = read('../components/layout/popup/info-popup.vue')
    expect(popup).toContain("import { TERMINAL_KEYS } from '@/utils/terminal-keys'")
    expect(popup).toMatch(/v-for="row in terminalKeys"/)
    expect(popup).toMatch(/v-for="key in row\.keys"/)
    expect(popup).toContain('{{ row.does }}')
  })
})
