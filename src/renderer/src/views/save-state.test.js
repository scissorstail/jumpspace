import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 저장하는 동안 머리글에 Saving을 보여준다 (owner, 2026-10-11). 소스에서 읽는다: DOM 없이 도는 테스트라서.
const layout = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Layout.vue'), 'utf8').replace(/\r\n/g, '\n')
const save = layout.match(/\n {4}async saveProject\(\) \{\n([\s\S]*?)\n {4}\},/)?.[1] ?? ''

describe('the saving mark in the header', () => {
  it('is shown while a save has not ended', () => {
    expect(layout).toMatch(/class="save-state"\n\s+:class="\{ 'is-saving': savingCount > 0 \}"/)
    expect(layout).toMatch(/\.save-state \{[^}]*visibility: hidden;[\s\S]*?&\.is-saving \{\n\s+visibility: visible;/)
  })

  // 저장은 여러 곳에서 서로 기다리지 않고 시작된다: 겹친 저장이 모두 끝나야 사라진다. 실패해도 남지 않는다.
  it('counts every save up before it starts and down when it ends, also when it fails', () => {
    expect(save).toMatch(/this\.savingCount \+= 1\n\s+try \{\n\s+await window\.preload\.saveProjects\(/)
    expect(save).toMatch(/\} finally \{\n\s+this\.savingCount -= 1\n\s+\}/)
  })

  it('is not counted when nothing is saved because loading failed', () => {
    expect(save.indexOf('if (this.isProjectLoadFailed)')).toBeLessThan(save.indexOf('this.savingCount += 1'))
    expect(save.indexOf('if (this.isProjectLoadFailed)')).toBeGreaterThan(-1)
  })

  // 보였다 숨어도 단추가 밀리지 않게 자리는 늘 차지한다 (display가 아니라 visibility).
  it('keeps its place so the header buttons do not move', () => {
    const tag = layout.match(/<span\n\s+class="save-state"[\s\S]*?>Saving<\/span>/)?.[0] ?? ''

    expect(tag).not.toBe('')
    expect(tag).not.toMatch(/v-if|v-show/)
  })
})
