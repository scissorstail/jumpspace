import { describe, expect, it } from 'vitest'
import { MASK, maskText } from './mask'

describe('maskText', () => {
  it('hides a plain value behind a mask of a fixed length', () => {
    expect(maskText('root')).toBe('***')
    expect(maskText('a')).toBe(MASK)
    expect(maskText('22')).toBe('***')
    expect(maskText(22)).toBe('***')
  })

  it('masks each part of a dotted address or name and keeps the dots', () => {
    expect(maskText('10.0.0.12')).toBe('***.***.***.***')
    expect(maskText('192.168.100.200')).toBe('***.***.***.***')
    expect(maskText('db.example.com')).toBe('***.***.***')
  })

  it('never shows a character of the value', () => {
    expect(maskText('fe80::1')).toBe('***')
    expect(maskText('host-name_1')).toBe('***')
    expect(maskText('a..b')).toBe('***.***.***')
  })

  it('keeps an empty value empty, so an unset field shows nothing', () => {
    expect(maskText('')).toBe('')
    expect(maskText(null)).toBe('')
    expect(maskText(undefined)).toBe('')
  })
})
