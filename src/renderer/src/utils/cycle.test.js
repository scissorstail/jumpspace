import { describe, expect, it } from 'vitest'
import { cycle } from './cycle'

const list = ['a', 'b', 'c']

describe('cycle', () => {
  it('moves to the next and previous item', () => {
    expect(cycle(list, 'a', 1)).toBe('b')
    expect(cycle(list, 'b', 1)).toBe('c')
    expect(cycle(list, 'c', -1)).toBe('b')
    expect(cycle(list, 'b', -1)).toBe('a')
  })

  it('wraps around at both ends', () => {
    expect(cycle(list, 'c', 1)).toBe('a')
    expect(cycle(list, 'a', -1)).toBe('c')
  })

  // 회귀: 예전 "이전" 버튼은 첫 항목(index 0)으로 돌아갈 수 없었다.
  it('can reach the first item going backwards', () => {
    expect(cycle(list, 'b', -1)).toBe('a')
  })

  it('starts from the first item when the current one is not in the list', () => {
    expect(cycle(list, 'zzz', 1)).toBe('a')
    expect(cycle(list, null, -1)).toBe('a')
    expect(cycle(list, undefined)).toBe('a')
  })

  it('handles single item and empty lists', () => {
    expect(cycle(['only'], 'only', 1)).toBe('only')
    expect(cycle(['only'], 'only', -1)).toBe('only')
    expect(cycle([], 'a')).toBeNull()
    expect(cycle(undefined, 'a')).toBeNull()
  })
})
