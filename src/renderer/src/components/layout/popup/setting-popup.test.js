import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BACKDROPS, DEFAULT_SETTING, TERMINAL_COLORS, THEMES } from '../../../../../shared/setting.js'

// 설정 창의 단추 묶음과 저장하는 값. 소스에서 읽는다: DOM 없이 도는 테스트라서.
const here = dirname(fileURLToPath(import.meta.url))
const popup = readFileSync(join(here, 'setting-popup.vue'), 'utf8').replace(/\r\n/g, '\n')
const method = name => popup.match(new RegExp(`\\n {4}(?:async )?${name}\\(\\) \\{\\n([\\s\\S]*?)\\n {4}\\}`))?.[1] ?? ''
// data의 "<name>Options: [ ... ]"에 적힌 value들
const optionValues = name => [...(popup.match(new RegExp(`\\n {6}${name}Options: \\[\\n([\\s\\S]*?)\\n {6}\\]`))?.[1] ?? '').matchAll(/value: '([^']*)'/g)].map(match => match[1])

describe('the settings window', () => {
  // 목록에 없는 값은 저장할 때 기본값이 되고 (normalizeSetting), 단추가 없는 값은 고를 수 없다.
  it.each([
    ['theme', THEMES],
    ['backdrop', BACKDROPS],
    ['terminalColors', TERMINAL_COLORS]
  ])('offers exactly the values of %s that the setting accepts', (name, accepted) => {
    expect(optionValues(name)).toEqual(accepted)
    expect(popup).toMatch(new RegExp(`<b-form-radio-group\\n\\s+v-model="${name}"\\n\\s+:options="${name}Options"\\n`))
  })

  it('shows the saved terminal colors and saves the chosen ones', () => {
    expect(popup).toMatch(/label="Terminal colors"/)
    expect(method('init')).toContain('this.terminalColors = this.setting.terminalColors')
    expect(method('saveSetting')).toContain('terminalColors: this.terminalColors')
  })

  // 이 창에 줄이 없는 설정(머리글의 눈 단추)은 저장할 때 지금 값 그대로다.
  it('reads and saves every setting that has a row, and keeps the others', () => {
    const rows = Object.keys(DEFAULT_SETTING).filter(key => key !== 'hideNodeInfo')

    for (const key of rows) {
      expect(method('init'), key).toContain(`this.${key} = this.setting.${key}`)
      expect(method('saveSetting'), key).toContain(`${key}: this.${key}`)
    }
    expect(method('saveSetting')).toMatch(/await this\.settingSave\(\{\n\s+\.\.\.this\.setting,\n/)
  })
})
