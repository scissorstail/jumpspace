import { describe, expect, it } from 'vitest'
import { APP_URL, isAppUrl } from './trust.js'

describe('isAppUrl', () => {
  it('accepts the packaged app page and its files', () => {
    expect(isAppUrl(APP_URL)).toBe(true)
    expect(isAppUrl('app://./assets/index-abc.js')).toBe(true)
    expect(isAppUrl('app://./')).toBe(true)
  })

  it('rejects other hosts and schemes that only start the same way', () => {
    expect(isAppUrl('app://.evil/index.html')).toBe(false)
    expect(isAppUrl('app://example.com/index.html')).toBe(false)
    expect(isAppUrl('https://example.com/app://./index.html')).toBe(false)
    expect(isAppUrl('file:///C:/app/index.html')).toBe(false)
  })

  it('accepts the dev server only by its exact origin', () => {
    const dev = 'http://localhost:5173'
    expect(isAppUrl('http://localhost:5173/', dev)).toBe(true)
    expect(isAppUrl('http://localhost:5173/#/item', dev)).toBe(true)
    expect(isAppUrl('http://localhost:51730/', dev)).toBe(false)
    expect(isAppUrl('http://localhost:5173.evil.com/', dev)).toBe(false)
    expect(isAppUrl('https://localhost:5173/', dev)).toBe(false)
    // 개발 서버가 없으면 http 주소는 모두 거절한다.
    expect(isAppUrl('http://localhost:5173/')).toBe(false)
  })

  it('rejects empty and broken values', () => {
    for (const url of ['', null, undefined, 'not a url', 'about:blank', 42]) {
      expect(isAppUrl(url)).toBe(false)
      expect(isAppUrl(url, 'http://localhost:5173')).toBe(false)
    }
    expect(isAppUrl('about:blank', 'not a url')).toBe(false)
  })
})
