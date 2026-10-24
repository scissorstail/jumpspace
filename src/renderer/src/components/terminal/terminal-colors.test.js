import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { XTERM_COLORS } from '../../utils/terminal-view'

// 터미널 색의 단계(설정 > Terminal colors)가 터미널까지 이어지는지. 소스에서 읽는다: DOM 없이 도는 테스트라서.
// (색 자체는 utils/terminal-view.test.js가 본다)
const here = dirname(fileURLToPath(import.meta.url))
const panel = readFileSync(join(here, 'terminal-panel.vue'), 'utf8').replace(/\r\n/g, '\n')
// 이름이 같은 computed와 watch의 본문 (computed가 먼저다)
const [shown, changed] = [...panel.matchAll(/\n {4}colorSetting\(\) \{\n([\s\S]*?)\n {4}\}/g)].map(match => match[1])
const colors = panel.match(/\n {4}colors\(\) \{\n([\s\S]*?)\n {4}\}/)?.[1] ?? ''
const style = panel.slice(panel.indexOf('<style'))
const body = style.match(/\n\.terminal-body \{\n([^}]*)\}/)?.[1] ?? ''

describe('the colors of the app terminal', () => {
  // 색 묶음과 상관없이 xterm의 기본 색이다 (#289): 페이지의 CSS 변수를 읽지 않는다.
  it('come from the level of the setting only, not from the palette on the page', () => {
    expect(colors).toContain('return terminalTheme(this.$store.getters.setting.terminalColors)')
    expect(panel).toMatch(/new Terminal\(\{[^}]*\n {8}theme: this\.colors\(\)\n/)
    expect(panel).not.toMatch(/getComputedStyle|getPropertyValue/)
  })

  // 설정을 저장하면 열린 터미널도 바로 바뀐다. 색 묶음을 바꿀 때는 바꿀 것이 없다.
  it('change in the open terminals when the level changes', () => {
    expect(shown).toMatch(/^\s+return this\.\$store\.getters\.setting\.terminalColors$/)
    expect(changed).toMatch(/this\.\$nextTick\(\(\) => \{\n\s+for \(const \[, entry\] of this\.terms\) entry\.term\.options\.theme = this\.colors\(\)\n\s+\}\)/)
  })

  // 화면의 둘레(xterm 화면 바깥의 여백)는 터미널의 바탕색이다: 그것이 색 묶음의 바탕이면 검은 화면에 색 테가 둘린다.
  it('has the background of the terminal around the screen', () => {
    expect(body).toMatch(/\n {2}background: (#[0-9a-f]{6});\n/i)
    expect(body.match(/background: (#[0-9a-f]{6})/i)[1].toLowerCase()).toBe(XTERM_COLORS.background)
  })
})
