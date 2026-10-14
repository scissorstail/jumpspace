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

// 화면이 넘기는 값은 무엇이든 될 수 있다 (틀린 호출, 언젠가의 실수). index.js는 Electron 없이는 불러올 수 없어서 소스를 읽는다:
// 값을 가리는 일은 테스트가 있는 함수가 하고, 여기서는 그 함수를 거치는지만 본다.
describe('what main does with the values of the page', () => {
  it('sends a fake mouse move only to a place mousePoint() takes', () => {
    expect(main.match(/sendInputEvent\(/g)).toHaveLength(1)
    expect(main).toMatch(/on\('window:mouseMove', \(event, data\) => \{\n(?: +\/\/.*\n)* +const point = mousePoint\(data\)\n +if \(win && point\) win\.webContents\.sendInputEvent\(\{ type: 'mouseMove', \.\.\.point \}\)\n {2}\}\)/)
  })

  it('reads the diagrams of the page with itemsFromJson() only', () => {
    expect(main).not.toMatch(/JSON\.parse\(/)
    expect(main).not.toMatch(/normalizeItems/)
    expect(main).toMatch(/handle\('projects:save', \(event, json\) => projects\.save\(json\)\)/)
    expect(main).toMatch(/handle\('projects:export', async \(event, json, defaultName = 'export\.json'\) => \{\n +const items = itemsFromJson\(json\)\n/)
  })

  // 템플릿 글자열은 값을 글자로 바꾼다: 바꿀 수 없는 값이면 toResult에 닿기 전에 던져서, 화면은 { ok: false } 대신 거부를 받는다
  it('puts the kind of a terminal into a text only when it is a text', () => {
    expect(main).toMatch(/handle\('terminal:open', \(event, kind, payload, size\) => toResult\(typeof kind === 'string' \? `terminal:\$\{kind\}` : 'terminal:open', async \(\) => opened\(/)
    // 나머지 둘은 for의 목록에서 온 종류다 (sshKinds)
    expect(main.match(/\$\{kind\}/g)).toHaveLength(3)
    expect(main.match(/`ssh:\$\{kind\}`/g)).toHaveLength(2)
  })
})

// 붙여넣기는 클립보드의 글을 통째로 받는다 (#220, 예전에는 1 MB에서 잘랐다): 화면은 터미널이 한 번에 받는 것보다 긴
// 붙여넣기를 그 길이와 함께 거절하고, 잘린 글로는 그 길이가 틀린다. 상한은 화면이 클립보드에 쓰는 쪽(화면이 보내는 값)에만 있다.
describe('the clipboard of the terminal', () => {
  it('gives a paste the whole text and limits only what the page writes', () => {
    expect(main).toMatch(/handle\('clipboard:readText', async \(\) => String\(\(await clipboard\.readText\(\)\) \?\? ''\)\)\n/)
    expect(main).toMatch(/handle\('clipboard:writeText', async \(event, text\) => \{\n +if \(typeof text === 'string' && text\.length <= MAX_CLIPBOARD\) await clipboard\.writeText\(text\)\n/)
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
