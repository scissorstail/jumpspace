import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 노드 이미지 목록의 키와 포커스. 소스에서 읽는다: DOM 없이 도는 테스트라서.
const here = dirname(fileURLToPath(import.meta.url))
const picker = readFileSync(join(here, 'icon-picker.vue'), 'utf8').replace(/\r\n/g, '\n')
const onKeydown = picker.match(/\n {4}onKeydown\(event\) \{\n([\s\S]*?)\n {4}\}\n {2}\}/)?.[1] ?? ''

describe('the icon picker', () => {
  it('is one radio group whose first item is "no icon"', () => {
    expect(picker).toMatch(/role="radiogroup"\n\s+aria-label="Node icon"/)
    expect(picker).toMatch(/options\(\) \{\n\s+return \[null, \.\.\.this\.icons\]\n/)
    expect(picker).toMatch(/return index === 0 \? 'No icon' : `Icon \$\{index\}`/)
  })

  // 고른 것 하나만 Tab으로 닿고, 나머지는 방향키로 간다.
  it('keeps only the chosen item in the Tab order', () => {
    expect(picker).toMatch(/:aria-checked="icon === selected \? 'true' : 'false'"/)
    expect(picker).toMatch(/:tabindex="icon === selected \? 0 : -1"/)
  })

  // 목록에 없는 값(지워진 이미지 파일)은 "이미지 없음"으로 본다. 아니면 Tab으로 닿는 칸이 하나도 없다.
  it('shows a value that is not in the list as "no icon"', () => {
    expect(picker).toMatch(/selected\(\) \{\n\s+return this\.options\.includes\(this\.value\) \? this\.value : null\n/)
  })

  it('moves the choice with the arrow keys, Home and End', () => {
    expect(onKeydown).toContain('const steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }')
    expect(onKeydown).toContain('next = cycle(this.options, this.selected, steps[event.key])')
    expect(onKeydown).toMatch(/event\.key === 'Home'\) \{\n\s+next = this\.options\[0\]\n/)
    expect(onKeydown).toMatch(/event\.key === 'End'\) \{\n\s+next = this\.options\[this\.options\.length - 1\]\n/)
  })

  // 다른 키(Tab, Escape, 글자)는 그대로 둔다. 목록의 키는 잠긴 동안에도 창을 스크롤하지 않고, 고르지도 않는다.
  it('leaves other keys alone, and chooses nothing while it is disabled', () => {
    expect(onKeydown).toMatch(/\} else \{\n\s+return\n\s+\}\n\n\s+event\.preventDefault\(\)\n\s+if \(this\.disabled\) return\n\n\s+this\.\$emit\('input', next\)\n/)
  })

  it('moves the focus to the item it chose', () => {
    expect(onKeydown).toMatch(/this\.\$nextTick\(\(\) => \{\n\s+const button = this\.\$el\.querySelector\('\[aria-checked="true"\]'\)\n\s+if \(button\) \{\n\s+button\.focus\(\)\n/)
  })
})
