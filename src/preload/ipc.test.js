import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 화면과 main 사이의 길은 이름(채널)으로만 이어져 있다: 한쪽에서 이름이 바뀌면 그 기능은 아무 말 없이 멈춘다
// (받는 쪽이 없는 send는 버려지고, invoke는 화면에서 거부될 뿐이다). 세 곳의 소스를 읽어서 맞춰 본다.
const here = dirname(fileURLToPath(import.meta.url))
const read = (...path) => readFileSync(join(here, '..', ...path), 'utf8').replace(/\r\n/g, '\n')
const preload = read('preload', 'index.js')
const main = read('main', 'index.js')
const terminal = read('main', 'terminal.js')

const sorted = list => [...new Set(list)].sort()
const names = (source, pattern) => sorted([...source.matchAll(pattern)].map(match => match[1]))

// main의 handle(`ssh:${kind}`, ...)는 종류마다 하나씩이다
const sshKinds = [...(main.match(/for \(const kind of \[([^\]]+)\]\) \{\n\s+handle\(`ssh:\$\{kind\}`/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(match => `ssh:${match[1]}`)

describe('the channels between the page and main', () => {
  it('main answers every request the page can make, and nothing else', () => {
    const asked = names(preload, /ipcRenderer\.invoke\('([^']+)'/g)
    const answered = sorted([...names(main, /\n {2}handle\('([^']+)'/g), ...sshKinds])

    expect(sshKinds).toEqual(['ssh:connect', 'ssh:forward', 'ssh:proxyJump'])
    expect(asked.length).toBeGreaterThan(10)
    expect(answered).toEqual(asked)
  })

  it('main listens to every message the page can send, and to nothing else', () => {
    const sent = names(preload, /ipcRenderer\.send\('([^']+)'/g)
    const heard = names(main, /\n {2}on\('([^']+)'/g)

    expect(sent.length).toBeGreaterThan(5)
    expect(heard).toEqual(sent)
  })

  it('the page listens to everything main sends to it', () => {
    const awaited = names(preload, /subscribe\('([^']+)'/g)
    const pushed = names(terminal, /\bsend\(owner, '([^']+)'/g)

    expect(pushed).toEqual(['terminal:data', 'terminal:exit'])
    expect(awaited).toEqual(pushed)
  })

  // 신뢰하는 화면에서 온 것만 처리하는 on / handle을 거치지 않는 길이 생기면 안 된다
  it('main takes requests only through the two wrappers that check the sender', () => {
    expect(main.match(/ipcMain\.(?:on|handle|once|handleOnce)\(/g)).toEqual(['ipcMain.on(', 'ipcMain.handle('])
    expect(main).toMatch(/ipcMain\.on\(channel, \(event, \.\.\.args\) => \{\n\s+if \(isTrusted\(event\)\) handler\(event, \.\.\.args\)/)
    expect(main).toMatch(/ipcMain\.handle\(channel, async \(event, \.\.\.args\) => \{\n\s+if \(!isTrusted\(event\)\) throw new Error\('Untrusted sender'\)/)
  })
})

describe('what the page calls on window.preload', () => {
  // preload가 내놓는 이름들: 'setSetting', 'ssh.connect', 'terminal.onData', ...
  const body = preload.match(/exposeInMainWorld\('preload', \{\n([\s\S]*?)\n\}\)/)?.[1] ?? ''
  const offered = []
  let group = ''
  for (const line of body.split('\n')) {
    const opened = line.match(/^ {2}(\w+): \{$/)
    const entry = line.match(/^ {2,4}(\w+): (?:\(|\w+ =>)/)
    if (opened) group = `${opened[1]}.`
    else if (/^ {2}\}/.test(line)) group = ''
    else if (entry) offered.push(`${line.startsWith('    ') ? group : ''}${entry[1]}`)
  }

  const files = dir =>
    readdirSync(dir).flatMap(entry => {
      const path = join(dir, entry)
      return statSync(path).isDirectory() ? files(path) : /\.(vue|js)$/.test(entry) && !entry.endsWith('.test.js') ? [path] : []
    })
  const used = sorted(files(join(here, '..', 'renderer', 'src')).flatMap(path => [...readFileSync(path, 'utf8').matchAll(/window\.preload\.([\w.]+)/g)].map(match => match[1])))

  it('is all there', () => {
    expect(offered).toContain('terminal.onData')
    expect(offered.length).toBeGreaterThan(15)
    // ssh는 종류를 이름으로 고른다: window.preload.ssh[kind]
    for (const name of used.filter(name => name !== 'ssh')) expect(offered, name).toContain(name)
  })

  // 화면이 종류로 고르는 ssh[kind]의 이름은 main이 받는 종류와 같다
  it('names the kinds of ssh as main does', () => {
    expect(used).toContain('ssh')
    for (const channel of sshKinds) expect(offered, channel).toContain(channel.replace(':', '.'))
  })

  it('offers nothing the page does not use', () => {
    const dynamic = sshKinds.map(channel => channel.replace(':', '.'))

    expect(offered.filter(name => !used.includes(name) && !dynamic.includes(name))).toEqual([])
  })
})
