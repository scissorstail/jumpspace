import { describe, expect, it } from 'vitest'
import { arrangeLayout, boxOf, ARRANGE_GAP } from './arrange'

const node = (id, x = 0, y = 0, width = 100, height = 60) => ({ id, x, y, width, height })
const placed = (nodes, positions) => nodes.map(n => ({ ...n, x: positions.get(n.id)[0], y: positions.get(n.id)[1] }))
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe('arrangeLayout', () => {
  it('puts a chain on one row, left to right, in link order', () => {
    const nodes = [node(3, 0, 0), node(1, 500, 300), node(2, 40, 900)]
    const p = arrangeLayout(nodes, [[1, 2], [2, 3]])
    expect(p.get(1)[1]).toBe(p.get(2)[1])
    expect(p.get(2)[1]).toBe(p.get(3)[1])
    expect(p.get(2)[0] - p.get(1)[0]).toBe(100 + ARRANGE_GAP.x)
    expect(p.get(3)[0] - p.get(2)[0]).toBe(100 + ARRANGE_GAP.x)
  })

  it('centers the whole group on (0, 0)', () => {
    const nodes = [node(1), node(2, 0, 100), node(3, 0, 200, 140, 90)]
    const box = boxOf(placed(nodes, arrangeLayout(nodes, [[1, 3]])))
    expect((box.left + box.right) / 2).toBeCloseTo(0)
    expect((box.top + box.bottom) / 2).toBeCloseTo(0)
  })

  it('keeps separate chains on their own rows, in their current top-to-bottom order', () => {
    // a1 -> a2 -> a3 (lower on the canvas), b1 -> b2 (higher)
    const nodes = [node('a1', 0, 400), node('a2', 200, 400), node('a3', 400, 400), node('b1', 0, 0), node('b2', 200, 0)]
    const p = arrangeLayout(nodes, [['a1', 'a2'], ['a2', 'a3'], ['b1', 'b2']])
    expect(p.get('b1')[1]).toBeLessThan(p.get('a1')[1])
    expect(p.get('b2')[1]).toBe(p.get('b1')[1])
    expect(p.get('a2')[1]).toBe(p.get('a1')[1])
    expect(p.get('a3')[1]).toBe(p.get('a1')[1])
    expect(p.get('a1')[1] - p.get('b1')[1]).toBe(60 + ARRANGE_GAP.y)
  })

  it('gives a node after several jump hosts its own column and no overlaps', () => {
    const nodes = [node(1), node(2, 0, 100), node(3, 300, 0), node(4, 300, 100), node(5, 600, 0, 180, 120), node(6, 0, 500)]
    const links = [[1, 3], [2, 3], [1, 4], [3, 5], [4, 5]]
    const p = arrangeLayout(nodes, links)
    for (const [from, to] of links) {
      expect(p.get(to)[0]).toBeGreaterThan(p.get(from)[0])
    }
    const all = placed(nodes, p)
    for (const a of all) {
      for (const b of all) {
        if (a !== b) expect(overlaps(a, b)).toBe(false)
      }
    }
  })

  it('stacks the nodes behind one jump host under each other (fan-out)', () => {
    const nodes = [node('jump'), node('a', 0, 100), node('b', 0, 200), node('c', 0, 300)]
    const p = arrangeLayout(nodes, [['jump', 'a'], ['jump', 'b'], ['jump', 'c']])
    expect(p.get('a')[0]).toBe(p.get('b')[0])
    expect(new Set(['a', 'b', 'c'].map(id => p.get(id)[1])).size).toBe(3)
    expect(p.get('a')[1]).toBe(p.get('jump')[1])
    expect(p.get('b')[1]).toBeLessThan(p.get('c')[1])
  })

  it('stops on a cycle and ignores links to unknown nodes or to itself', () => {
    const nodes = [node(1), node(2, 100), node(3, 200)]
    const p = arrangeLayout(nodes, [[1, 2], [2, 3], [3, 2], [3, 3], [3, 99]])
    expect([...p.keys()].sort()).toEqual([1, 2, 3])
    for (const [x, y] of p.values()) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
    }
    expect(p.get(2)[0]).toBeGreaterThan(p.get(1)[0])
  })

  it('places a single node with its center on (0, 0)', () => {
    expect(arrangeLayout([node('only', 900, 900, 100, 60)], []).get('only')).toEqual([-50, -30])
  })
})
