import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 저장하는 동안 머리글에서 흐린 고리가 돈다 (owner, 2026-10-11: 처음의 글자 "Saving"은 눈에 거슬렸다).
// 소스에서 읽는다: DOM 없이 도는 테스트라서.
const layout = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Layout.vue'), 'utf8').replace(/\r\n/g, '\n')
const save = layout.match(/\n {4}async saveProject\(\) \{\n([\s\S]*?)\n {4}\},/)?.[1] ?? ''
const mark = layout.match(/<span class="save-state">\n([\s\S]*?)\n\s+<\/span>/)?.[1] ?? ''
const place = layout.match(/\n\.save-state \{\n([^}]*)\}/)?.[1] ?? ''

describe('the saving mark in the header', () => {
  // 고리는 저장하는 동안에만 있다: 저장하지 않을 때는 도는 것이 없다. 화면 읽기에는 이름이 있다.
  it('is a ring that is there only while a save has not ended', () => {
    expect(mark).toMatch(/^\s+<b-spinner\n\s+v-if="savingCount > 0"\n\s+small\n\s+label="Saving"\n\s+\/>$/)
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

  // 고리가 생겼다 없어져도 단추가 밀리지 않게, 고리가 들어가는 자리는 늘 있고 고리(small: 1rem)만 한 크기다.
  it('keeps its place so the header buttons do not move', () => {
    expect(mark).not.toBe('')
    expect(layout).not.toMatch(/<span[^>]*class="save-state"[^>]*v-(?:if|show)/)
    expect(place).toMatch(/^ {2}width: 1rem;$/m)
    expect(place).toMatch(/^ {2}height: 1rem;$/m)
  })

  // 눈에 잘 띄지 않아야 한다: 옅은 글자색을 반 넘게 비치게.
  it('is faint', () => {
    expect(place).toMatch(/^ {2}color: var\(--js-text-muted\);$/m)
    expect(Number(place.match(/^ {2}opacity: ([\d.]+);$/m)?.[1])).toBeGreaterThan(0)
    expect(Number(place.match(/^ {2}opacity: ([\d.]+);$/m)?.[1])).toBeLessThan(0.5)
  })
})
