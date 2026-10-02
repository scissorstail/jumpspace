import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_URL, appFilePath, isAppUrl } from './trust.js'

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

describe('appFilePath', () => {
  const root = join(process.cwd(), 'out', 'renderer')

  it('maps app:// addresses to files of the page', () => {
    expect(appFilePath(root, APP_URL)).toBe(join(root, 'index.html'))
    expect(appFilePath(root, 'app://./')).toBe(join(root, 'index.html'))
    expect(appFilePath(root, 'app://./assets/index-abc.js?v=1#x')).toBe(join(root, 'assets', 'index-abc.js'))
    expect(appFilePath(root, 'app://./fonts/a%20b.woff2')).toBe(join(root, 'fonts', 'a b.woff2'))
    // 주소의 '..'는 URL이 먼저 정리하므로 화면 폴더 안에 남는다.
    expect(appFilePath(root, 'app://./../main/index.js')).toBe(join(root, 'main', 'index.js'))
  })

  it('never leaves the page folder, also with encoded separators', () => {
    for (const url of [
      'app://./..%2fmain%2findex.js',
      'app://./..%2f..%2f..%2fetc%2fpasswd',
      'app://./..%2frenderer',
      'app://./..%2frenderer-evil%2fx.js',
      'app://./%2e%2e%2f%2e%2e%2fsecret'
    ]) {
      expect(appFilePath(root, url), url).toBeNull()
    }
    // '\\'는 Windows에서만 경로 구분자다. 어느 쪽이든 화면 폴더 밖은 아니다.
    const backslash = appFilePath(root, 'app://./..%5c..%5csecret')
    expect(backslash === null || backslash.startsWith(root + sep)).toBe(true)
  })

  it('refuses addresses it cannot read', () => {
    expect(appFilePath(root, 'app://./%E0%A4%A')).toBeNull()
    expect(appFilePath(root, 'not a url')).toBeNull()
  })
})
