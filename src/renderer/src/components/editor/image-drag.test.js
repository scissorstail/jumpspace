import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// 캔버스 안의 그림은 브라우저가 따로 끌 수 있다. 그러면 노드 대신 그림의 잔상이 끌려 다닌다.
// 그래서 편집기 안의 <img>는 모두 draggable="false"이고, 노드 아이콘은 마우스를 노드로 보낸다(pointer-events: none).
function vueFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? vueFiles(path) : path.endsWith('.vue') ? [path] : []
  })
}

describe('images in the editor', () => {
  it('are never dragged by the browser', () => {
    const offenders = vueFiles(__dirname).flatMap(file => [...readFileSync(file, 'utf8').matchAll(/<img\b[^>]*>/g)]
      .filter(([tag]) => !/\sdraggable="false"/.test(tag))
      .map(() => relative(__dirname, file)))
    expect(offenders).toEqual([])
  })

  it('pass the mouse through the node icon to the node', () => {
    const source = readFileSync(join(__dirname, 'nodes/site-node/controls/connection-control/component.vue'), 'utf8')
    const rule = source.match(/&-diagram \{[^}]*\}/)?.[0] || ''
    expect(rule).toMatch(/pointer-events: none;/)
  })
})
