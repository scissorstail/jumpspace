import { describe, expect, it } from 'vitest'
import { hasSavedPassword, matchesKeyword } from './project'

const item = connection => ({ name: 'a', data: { nodes: { 1: { data: { connection } } } } })

describe('hasSavedPassword', () => {
  it('detects saved passwords', () => {
    expect(hasSavedPassword([item({ password: 'x' })])).toBe(true)
    expect(hasSavedPassword([item({ password: '' }), item({ password: 'x' })])).toBe(true)
  })

  it('ignores items without passwords or with odd shapes', () => {
    expect(hasSavedPassword([])).toBe(false)
    expect(hasSavedPassword([item({ password: '' }), item({}), { name: 'b', data: {} }, null])).toBe(false)
  })
})

describe('matchesKeyword', () => {
  it('ignores case and surrounding spaces', () => {
    expect(matchesKeyword('Production DB', 'production')).toBe(true)
    expect(matchesKeyword('production db', 'PROD')).toBe(true)
    expect(matchesKeyword('Production DB', '  db ')).toBe(true)
  })

  it('matches everything for an empty search, even unnamed items', () => {
    expect(matchesKeyword('', '')).toBe(true)
    expect(matchesKeyword('abc', '   ')).toBe(true)
    expect(matchesKeyword('abc', undefined)).toBe(true)
    expect(matchesKeyword(undefined, null)).toBe(true)
  })

  it('does not match other names, and takes the search literally', () => {
    expect(matchesKeyword('staging', 'prod')).toBe(false)
    expect(matchesKeyword('', 'prod')).toBe(false)
    expect(matchesKeyword('axb', 'a.b')).toBe(false)
    expect(matchesKeyword('a.b', 'a.b')).toBe(true)
  })

  it('works with Korean names', () => {
    expect(matchesKeyword('운영 서버', '서버')).toBe(true)
    expect(matchesKeyword('운영 서버', '개발')).toBe(false)
  })
})
