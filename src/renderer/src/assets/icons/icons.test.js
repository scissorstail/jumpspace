import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 아이콘은 index.js에 하나씩 등록한 것만 그려진다. 빠지면 단추가 아무 표시 없이 빈 채로 나온다.
const root = join(__dirname, '..', '..')
const registered = readFileSync(join(__dirname, 'index.js'), 'utf8')

function vueFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? vueFiles(path) : path.endsWith('.vue') ? [path] : []
  })
}

// icon="name" 과 :icon="cond ? 'a' : 'b'" 의 이름들
function usedIcons(source) {
  const names = new Set()
  for (const [, name] of source.matchAll(/\sicon="([a-z0-9-]+)"/g)) names.add(name)
  for (const [, expr] of source.matchAll(/\s:icon="([^"]+)"/g)) {
    for (const [, name] of expr.matchAll(/'([a-z0-9-]+)'/g)) names.add(name)
  }
  return [...names]
}

const componentName = icon => 'BIcon' + icon.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('')

describe('icons', () => {
  it('finds plain and conditional icon names', () => {
    expect(usedIcons('<b-icon icon="x" /> <b-icon :icon="open ? \'eye-slash\' : \'eye\'" />').sort()).toEqual(['eye', 'eye-slash', 'x'])
    expect(componentName('arrow-clockwise')).toBe('BIconArrowClockwise')
    expect(componentName('link45deg')).toBe('BIconLink45deg')
  })

  it('registers every icon the components use', () => {
    const missing = []
    for (const file of vueFiles(root)) {
      for (const icon of usedIcons(readFileSync(file, 'utf8'))) {
        if (!registered.includes(`Vue.component('${componentName(icon)}'`)) missing.push(`${icon} (${file.slice(root.length + 1)})`)
      }
    }
    expect(missing).toEqual([])
  })
})
