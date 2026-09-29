import { describe, expect, it } from 'vitest'
import { hasSavedPassword } from './project'

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
