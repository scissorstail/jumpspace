import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 터미널 색의 단계(설정 > Terminal colors)가 터미널까지 이어지는지. 소스에서 읽는다: DOM 없이 도는 테스트라서.
// (색 자체는 utils/terminal-view.test.js가 본다)
const here = dirname(fileURLToPath(import.meta.url))
const panel = readFileSync(join(here, 'terminal-panel.vue'), 'utf8').replace(/\r\n/g, '\n')
// 이름이 같은 computed와 watch의 본문 (computed가 먼저다)
const [shown, changed] = [...panel.matchAll(/\n {4}colorSetting\(\) \{\n([\s\S]*?)\n {4}\}/g)].map(match => match[1])
const colors = panel.match(/\n {4}colors\(\) \{\n([\s\S]*?)\n {4}\}/)?.[1] ?? ''

describe('the colors of the app terminal', () => {
  it('come from the palette on the page and the level of the setting', () => {
    expect(panel).toMatch(/function currentTerminalTheme\(level\) \{\n[^}]*terminalTheme\(name => style\.getPropertyValue\(name\)\.trim\(\), level\)\n\}/)
    expect(colors).toContain('return currentTerminalTheme(this.$store.getters.setting.terminalColors)')
    expect(panel).toMatch(/new Terminal\(\{[^}]*\n {8}theme: this\.colors\(\)\n/)
  })

  // 설정을 저장하면 열린 터미널도 바로 바뀐다: 색 묶음을 바꿀 때도, 단계를 바꿀 때도.
  it('change in the open terminals when the palette or the level changes', () => {
    expect(shown).toContain('const { theme, terminalColors } = this.$store.getters.setting')
    expect(shown).toMatch(/return `\$\{theme\} \$\{terminalColors\}`/)
    expect(changed).toMatch(/this\.\$nextTick\(\(\) => \{\n\s+for \(const \[, entry\] of this\.terms\) entry\.term\.options\.theme = this\.colors\(\)\n\s+\}\)/)
  })
})
