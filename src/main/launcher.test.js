import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expandEnv, launch, prepareSession, sweepTempDir } from './launcher.js'

// 실제로 실행할 수 있는 "Git Bash" 대용. 파일이 존재하기만 하면 되고, spawn은 가짜로 바꾼다.
const root = mkdtempSync(join(tmpdir(), 'jumpspace-launcher-'))
const fakeBash = join(root, 'git-bash')
writeFileSync(fakeBash, '')
afterAll(() => rmSync(root, { recursive: true, force: true }))

const node = { name: 'web', user: 'deploy', host: 'example.com', port: '22', keyPath: '/keys/a', password: 'S3cr3t', exec: '' }
const files = dir => (existsSync(dir) ? readdirSync(dir) : [])

// child_process.spawn 대용. 호출 내용을 기록하고, fail이면 시작에 실패한 것처럼 error를 낸다.
function fakeSpawn({ fail } = {}) {
  const calls = []
  const spawn = (file, args, options) => {
    calls.push({ file, args, options })
    const child = new EventEmitter()
    child.unref = vi.fn()
    calls[calls.length - 1].child = child
    queueMicrotask(() => (fail ? child.emit('error', new Error('spawn failed')) : child.emit('spawn')))
    return child
  }
  return { spawn, calls }
}

describe('expandEnv', () => {
  it('expands %VAR% and keeps unknown ones', () => {
    expect(expandEnv('%ProgramFiles%\\Git\\git-bash.exe', { ProgramFiles: 'C:\\Program Files' }))
      .toBe('C:\\Program Files\\Git\\git-bash.exe')
    expect(expandEnv('%NOPE%\\x', {})).toBe('%NOPE%\\x')
  })
})

describe('launch', () => {
  let tempDir
  beforeEach(() => { tempDir = mkdtempSync(join(root, 't-')) })

  it('writes the script, runs it through bash -c and detaches', async () => {
    const { spawn, calls } = fakeSpawn()
    await launch('connect', node, { tempDir, gitBashPath: fakeBash, spawn })

    const [script] = files(tempDir)
    expect(files(tempDir)).toHaveLength(1)
    expect(script).toMatch(/^[0-9a-f]{16}\.sh$/)

    expect(calls).toHaveLength(1)
    const { file, args, options, child } = calls[0]
    expect(file).toBe(fakeBash)
    expect(args[0]).toBe('-c')
    // 경로는 single-quote로 감싼 한 인자이고, Windows 경로도 슬래시로 바뀐다
    expect(args[1]).toBe(`bash '${join(tempDir, script).replaceAll('\\', '/')}'`)
    expect(options).toMatchObject({ detached: true, stdio: 'ignore' })
    expect(child.unref).toHaveBeenCalled()
  })

  it('passes secrets through the environment only (never on the command line or on disk)', async () => {
    const { spawn, calls } = fakeSpawn()
    await launch('connect', node, { tempDir, gitBashPath: fakeBash, spawn })

    expect(calls[0].options.env.JS_PW_0).toBe('S3cr3t')
    expect(calls[0].options.env.PATH).toBe(process.env.PATH) // 기존 환경도 유지한다
    expect(JSON.stringify(calls[0].args)).not.toContain('S3cr3t')
    for (const name of files(tempDir)) {
      expect(readFileSync(join(tempDir, name), 'utf-8')).not.toContain('S3cr3t')
    }
  })

  it.skipIf(process.platform === 'win32')('makes the script executable (it is also used as SSH_ASKPASS) and keeps the config private', async () => {
    const { spawn } = fakeSpawn()
    await launch('proxyJump', [node, { ...node, host: 'inner.example.com' }], { tempDir, gitBashPath: fakeBash, spawn })

    const script = files(tempDir).find(x => x.endsWith('.sh'))
    const config = files(tempDir).find(x => x.endsWith('.jmp'))
    expect(statSync(join(tempDir, script)).mode & 0o777).toBe(0o700)
    expect(statSync(join(tempDir, config)).mode & 0o777).toBe(0o600)
  })

  it('writes a config file only for the commands that need one', async () => {
    const { spawn } = fakeSpawn()

    await launch('connect', node, { tempDir, gitBashPath: fakeBash, spawn })
    expect(files(tempDir).filter(x => x.endsWith('.jmp'))).toHaveLength(0)

    await launch('forward', { via: [node], forwards: [{ checked: true, from: '8080', to: '80' }] }, { tempDir, gitBashPath: fakeBash, spawn })
    await launch('proxyJump', [node, { ...node, host: 'b' }], { tempDir, gitBashPath: fakeBash, spawn })
    expect(files(tempDir).filter(x => x.endsWith('.jmp'))).toHaveLength(2)
  })

  it('cleans up the files when the process cannot be started', async () => {
    const { spawn } = fakeSpawn({ fail: true })
    await expect(launch('proxyJump', [node, { ...node, host: 'b' }], { tempDir, gitBashPath: fakeBash, spawn })).rejects.toThrow('spawn failed')
    expect(files(tempDir)).toEqual([])
  })

  it('validates the request before touching the disk', async () => {
    const { spawn, calls } = fakeSpawn()
    const missing = join(root, 'never-created')

    await expect(launch('connect', { ...node, host: '-oProxyCommand=calc' }, { tempDir: missing, gitBashPath: fakeBash, spawn })).rejects.toThrow(/Invalid host/)
    await expect(launch('nope', node, { tempDir: missing, gitBashPath: fakeBash, spawn })).rejects.toThrow(/Unknown command/)
    await expect(launch('toString', node, { tempDir: missing, gitBashPath: fakeBash, spawn })).rejects.toThrow(/Unknown command/)
    expect(existsSync(missing)).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('explains a missing Git Bash', async () => {
    const { spawn, calls } = fakeSpawn()

    await expect(launch('connect', node, { tempDir, gitBashPath: join(root, 'nope.exe'), spawn })).rejects.toThrow(/Git Bash was not found.*Settings/s)
    await expect(launch('connect', node, { tempDir, gitBashPath: '', spawn })).rejects.toThrow(/\(not set\)/)
    expect(calls).toHaveLength(0)
    expect(files(tempDir)).toEqual([])
  })

  it('expands %VAR% in the Git Bash path', async () => {
    const { spawn, calls } = fakeSpawn()
    process.env.JUMPSPACE_TEST_ROOT = root
    try {
      await launch('connect', node, { tempDir, gitBashPath: '%JUMPSPACE_TEST_ROOT%/git-bash', spawn })
    } finally {
      delete process.env.JUMPSPACE_TEST_ROOT
    }
    expect(calls[0].file).toBe(`${root}/git-bash`)
  })

  it('refuses a temp directory that cannot be quoted safely', async () => {
    const { spawn } = fakeSpawn()
    await expect(launch('connect', node, { tempDir: join(root, "o'brien"), gitBashPath: fakeBash, spawn })).rejects.toThrow(/unsupported characters/)
  })

  it('uses a different file name every time', async () => {
    const { spawn } = fakeSpawn()
    await launch('connect', node, { tempDir, gitBashPath: fakeBash, spawn })
    await launch('connect', node, { tempDir, gitBashPath: fakeBash, spawn })
    expect(new Set(files(tempDir)).size).toBe(2)
  })
})

describe('prepareSession', () => {
  const unix = process.platform !== 'win32'

  it('accepts only the three commands, also not names from the object prototype', () => {
    const tempDir = mkdtempSync(join(root, 'kinds-'))
    for (const kind of ['rm', 'toString', 'constructor', '__proto__', 'hasOwnProperty', '']) {
      expect(() => prepareSession(kind, node, { tempDir })).toThrow(/Unknown command/)
    }
    expect(files(tempDir)).toEqual([])
  })

  it('writes nothing until write(), then the script (owner only, executable) and the config (owner only)', async () => {
    const tempDir = join(mkdtempSync(join(root, 'modes-')), 'not-yet')
    const session = prepareSession('proxyJump', [node, { ...node, name: 'db', host: 'db.internal' }], { tempDir })
    expect(existsSync(tempDir)).toBe(false)

    await session.write()
    const written = files(tempDir).sort()
    expect(written.map(name => name.replace(/^[0-9a-f]{16}/, 'ID'))).toEqual(['ID.jmp', 'ID.sh'])
    const script = join(tempDir, written.find(name => name.endsWith('.sh')))
    const config = join(tempDir, written.find(name => name.endsWith('.jmp')))
    if (unix) {
      expect(statSync(script).mode & 0o777).toBe(0o700)
      expect(statSync(config).mode & 0o777).toBe(0o600)
    }
    // 비밀번호는 파일에 쓰지 않고 환경변수로만 넘긴다.
    expect(readFileSync(script, 'utf8') + readFileSync(config, 'utf8')).not.toContain('S3cr3t')
    expect(Object.values(session.env)).toContain('S3cr3t')

    await session.cleanup()
    expect(files(tempDir)).toEqual([])
    await session.cleanup() // 이미 지워져 있어도 괜찮다
  })
})

describe('sweepTempDir', () => {
  const DAY = 24 * 60 * 60 * 1000
  const age = (file, ms) => {
    const time = new Date(Date.now() - ms)
    utimesSync(file, time, time)
  }

  it('removes stale scripts and configs only', async () => {
    const dir = mkdtempSync(join(root, 'sweep-'))
    const write = (name, ms) => { const f = join(dir, name); writeFileSync(f, 'x'); age(f, ms); return name }

    write('old.sh', 2 * DAY)
    write('old.jmp', 2 * DAY)
    write('fresh.sh', 1000)
    write('fresh.jmp', 1000)
    write('old-but-not-ours.txt', 2 * DAY)

    await sweepTempDir(dir)
    expect(files(dir).sort()).toEqual(['fresh.jmp', 'fresh.sh', 'old-but-not-ours.txt'])
  })

  it('does nothing when the directory does not exist', async () => {
    await expect(sweepTempDir(join(root, 'does-not-exist'))).resolves.toBeUndefined()
  })

  it('takes the current time as a parameter', async () => {
    const dir = mkdtempSync(join(root, 'sweep-'))
    writeFileSync(join(dir, 'a.sh'), 'x')
    await sweepTempDir(dir, Date.now())
    expect(files(dir)).toEqual(['a.sh'])
    await sweepTempDir(dir, Date.now() + 2 * DAY)
    expect(files(dir)).toEqual([])
  })
})
