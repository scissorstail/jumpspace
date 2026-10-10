import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createTerminalManager, exitStatus, killPty, MAX_PENDING_OUTPUT, MAX_SESSIONS, OUTPUT_DELAY_MS, REFLOW_BUILD, terminalBash, windowsPtyInfo } from './terminal.js'
import { sq, toUnixPath } from './ssh.js'

const root = mkdtempSync(join(tmpdir(), 'jumpspace-terminal-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const node = { name: 'web', user: 'deploy', host: 'example.com', port: '22', keyPath: '', password: '', exec: '' }

// node-pty 대신 쓰는 가짜 pty
function fakePtyFactory() {
  const ptys = []
  const spawnPty = vi.fn((file, args, options) => {
    const handlers = { data: [], exit: [] }
    const pty = {
      file,
      args,
      options,
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: fn => handlers.data.push(fn),
      onExit: fn => handlers.exit.push(fn),
      emitData: data => handlers.data.forEach(fn => fn(data)),
      emitExit: exitCode => handlers.exit.forEach(fn => fn({ exitCode }))
    }
    ptys.push(pty)
    return pty
  })
  return { spawnPty, ptys }
}

function setup(extra = {}) {
  const { spawnPty, ptys } = fakePtyFactory()
  const send = vi.fn()
  const tempDir = mkdtempSync(join(root, 't-'))
  const manager = createTerminalManager({ tempDir, getBash: () => '/bin/bash', spawnPty, send, platform: 'linux', ...extra })
  return { manager, spawnPty, ptys, send, tempDir }
}

describe('terminalBash', () => {
  it('uses /bin/bash outside Windows', () => {
    expect(terminalBash('whatever', { platform: 'linux' })).toBe('/bin/bash')
  })

  it('uses bin\\bash.exe next to git-bash.exe on Windows, and expands %VAR%', () => {
    const exists = vi.fn(() => true)
    const bash = terminalBash('%ProgramFiles%\\Git\\git-bash.exe', { platform: 'win32', exists, env: { ProgramFiles: 'C:\\Program Files' } })

    expect(bash.replaceAll('\\', '/')).toBe('C:/Program Files/Git/bin/bash.exe')
  })

  it('takes a bash.exe given directly, and explains a missing one', () => {
    expect(terminalBash('D:\\Git\\bin\\bash.exe', { platform: 'win32', exists: () => true })).toBe('D:\\Git\\bin\\bash.exe')
    expect(() => terminalBash('D:\\nope\\git-bash.exe', { platform: 'win32', exists: () => false })).toThrow(/bash\.exe of Git for Windows was not found/)
  })
})

describe('exitStatus', () => {
  it('reports the exit code, or 128 + signal for a session killed by a signal', () => {
    expect(exitStatus({ exitCode: 0 })).toBe(0)
    expect(exitStatus({ exitCode: 255, signal: 0 })).toBe(255)
    expect(exitStatus({ exitCode: 0, signal: 2 })).toBe(130)
    expect(exitStatus({ exitCode: 0, signal: 1 })).toBe(129)
    expect(exitStatus({ exitCode: 3, signal: 2 })).toBe(3)
  })

  it("reads the signal out of the exit code of Git's bash on Windows (Ctrl+C while connecting ends with 512)", () => {
    const windows = { platform: 'win32' }

    expect(exitStatus({ exitCode: 512 }, windows)).toBe(130)
    expect(exitStatus({ exitCode: 256 }, windows)).toBe(129)
    // 코어를 남겼다는 표시(0x80)는 신호 번호가 아니다.
    expect(exitStatus({ exitCode: (0x80 | 3) << 8 }, windows)).toBe(131)
    // 보통의 종료 코드와 Windows의 큰 상태 값(예: 0xC000013A)은 그대로 둔다.
    expect(exitStatus({ exitCode: 255 }, windows)).toBe(255)
    expect(exitStatus({ exitCode: 0 }, windows)).toBe(0)
    expect(exitStatus({ exitCode: 513 }, windows)).toBe(513)
    expect(exitStatus({ exitCode: 0xC000013A }, windows)).toBe(0xC000013A)
    expect(exitStatus({ exitCode: 0x10000 }, windows)).toBe(0x10000)
    // 다른 곳에서는 종료 코드를 그대로 믿는다.
    expect(exitStatus({ exitCode: 512 }, { platform: 'linux' })).toBe(512)
  })
})

describe('killPty', () => {
  it('hangs up the whole process group on Unix, then closes the pty', () => {
    const kill = vi.fn()
    const pty = { pid: 1234, kill: vi.fn() }

    killPty(pty, { platform: 'linux', kill })

    expect(kill).toHaveBeenCalledWith(-1234, 'SIGHUP')
    expect(pty.kill).toHaveBeenCalled()
  })

  it('only closes the pty on Windows, and survives errors', () => {
    const kill = vi.fn(() => { throw new Error('ESRCH') })
    const pty = { pid: 1234, kill: vi.fn(() => { throw new Error('gone') }) }

    expect(() => killPty(pty, { platform: 'win32', kill })).not.toThrow()
    expect(kill).not.toHaveBeenCalled()
    expect(() => killPty(pty, { platform: 'linux', kill })).not.toThrow()
  })
})

describe('windowsPtyInfo', () => {
  it('is null outside Windows', () => {
    expect(windowsPtyInfo({ platform: 'linux', release: '6.8.0' })).toBeNull()
    expect(windowsPtyInfo({ platform: 'darwin', release: '24.0.0', bundled: true })).toBeNull()
  })

  it("gives the build of Windows for Windows' own ConPTY", () => {
    expect(windowsPtyInfo({ platform: 'win32', release: '10.0.19045' })).toEqual({ backend: 'conpty', buildNumber: 19045 })
    expect(windowsPtyInfo({ platform: 'win32', release: '10.0.26100' })).toEqual({ backend: 'conpty', buildNumber: 26100 })
    // 번호를 모르면 주지 않는다 (xterm.js는 그때 새 ConPTY로 본다)
    expect(windowsPtyInfo({ platform: 'win32', release: 'unknown' })).toEqual({ backend: 'conpty', buildNumber: undefined })
  })

  it('counts the bundled ConPTY as a new one on an old Windows, so the screen reflows long lines itself', () => {
    expect(windowsPtyInfo({ platform: 'win32', release: '10.0.19045', bundled: true })).toEqual({ backend: 'conpty', buildNumber: REFLOW_BUILD })
    expect(windowsPtyInfo({ platform: 'win32', release: '10.0.26100', bundled: true })).toEqual({ backend: 'conpty', buildNumber: 26100 })
    expect(windowsPtyInfo({ platform: 'win32', release: '', bundled: true })).toEqual({ backend: 'conpty', buildNumber: REFLOW_BUILD })
  })
})

describe('createTerminalManager: the pty on Windows', () => {
  const windows = { platform: 'win32', release: '10.0.19045' }

  it('starts the session in the ConPTY that comes with node-pty and tells the screen so', async () => {
    const { manager, spawnPty } = setup(windows)
    const id = await manager.open('connect', node, { owner: 7 })

    expect(spawnPty).toHaveBeenCalledTimes(1)
    expect(spawnPty.mock.calls[0][2].useConptyDll).toBe(true)
    expect(manager.windowsPty(id, 7)).toEqual({ backend: 'conpty', buildNumber: REFLOW_BUILD })
    // 다른 창에는 알려 주지 않는다.
    expect(manager.windowsPty(id, 8)).toBeNull()
    expect(manager.windowsPty(999, 7)).toBeNull()
  })

  it('leaves the pty alone outside Windows', async () => {
    const { manager, spawnPty } = setup({ platform: 'linux', release: '6.8.0' })
    const id = await manager.open('connect', node, { owner: 7 })

    expect(spawnPty.mock.calls[0][2]).not.toHaveProperty('useConptyDll')
    expect(manager.windowsPty(id, 7)).toBeNull()
  })

  it("falls back to Windows' own ConPTY when the bundled one cannot start, and does not try it again", async () => {
    const { spawnPty: plain, ptys } = fakePtyFactory()
    const spawnPty = vi.fn((file, args, options) => {
      if (options.useConptyDll) throw new Error('Cannot find conpty.dll')
      return plain(file, args, options)
    })
    const tempDir = mkdtempSync(join(root, 'fallback-'))
    const manager = createTerminalManager({ tempDir, getBash: () => '/bin/bash', spawnPty, send: vi.fn(), ...windows })

    const first = await manager.open('connect', node, { owner: 1 })
    expect(spawnPty).toHaveBeenCalledTimes(2)
    expect(ptys).toHaveLength(1)
    expect(ptys[0].options).not.toHaveProperty('useConptyDll')
    expect(manager.windowsPty(first, 1)).toEqual({ backend: 'conpty', buildNumber: 19045 })

    const second = await manager.open('connect', node, { owner: 1 })
    expect(spawnPty).toHaveBeenCalledTimes(3)
    expect(manager.windowsPty(second, 1)).toEqual({ backend: 'conpty', buildNumber: 19045 })
  })

  it('reports the real error and removes the files when no pty can be started at all', async () => {
    const tempDir = mkdtempSync(join(root, 'nopty-'))
    const spawnPty = vi.fn((file, args, options) => { throw new Error(options.useConptyDll ? 'no bundled conpty' : 'no pty at all') })
    const manager = createTerminalManager({ tempDir, getBash: () => '/bin/bash', spawnPty, send: vi.fn(), ...windows })

    await expect(manager.open('connect', node, { owner: 1 })).rejects.toThrow('no pty at all')
    expect(readdirSync(tempDir)).toEqual([])
    // 함께 온 ConPTY 탓이 아닐 수 있으므로 다음에는 다시 그것부터 해 본다.
    await expect(manager.open('connect', node, { owner: 1 })).rejects.toThrow('no pty at all')
    expect(spawnPty.mock.calls.map(call => !!call[2].useConptyDll)).toEqual([true, false, true, false])
  })
})

describe('createTerminalManager', () => {
  it('runs the generated script in a pty and forwards its output to the window that opened it', async () => {
    const { manager, spawnPty, ptys, send } = setup()

    const id = await manager.open('connect', { ...node, password: 'pw' }, { owner: 7, cols: 120, rows: 30 })
    const [file, args, options] = spawnPty.mock.calls[0]

    expect(file).toBe('/bin/bash')
    expect(args).toHaveLength(1)
    expect(existsSync(args[0])).toBe(true)
    expect(options).toMatchObject({ cols: 120, rows: 30, name: 'xterm-256color' })
    expect(options.env.TERM).toBe('xterm-256color')
    expect(options.env.JUMPSPACE_IN_APP).toBe('1')
    // 비밀번호는 환경변수로만 넘어가고 인자에는 없다.
    expect(Object.values(options.env)).toContain('pw')
    expect(args.join(' ')).not.toContain('pw')

    ptys[0].emitData('hello')
    ptys[0].emitExit(0)
    expect(send.mock.calls).toEqual([[7, 'terminal:data', id, 'hello'], [7, 'terminal:exit', id, 0]])
    expect(manager.size).toBe(0)
  })

  it('lets only the owner write, resize and close, and checks the values', async () => {
    const { manager, ptys } = setup()
    const id = await manager.open('connect', node, { owner: 1 })

    manager.write(id, 2, 'x')
    manager.resize(id, 2, 100, 40)
    manager.close(id, 2)
    expect(ptys[0].write).not.toHaveBeenCalled()
    expect(ptys[0].resize).not.toHaveBeenCalled()
    expect(ptys[0].kill).not.toHaveBeenCalled()

    manager.write(id, 1, 42)
    manager.write(id, 1, 'x'.repeat(70000))
    manager.resize(id, 1, 0, 40)
    manager.resize(id, 1, 80.5, 40)
    expect(ptys[0].write).not.toHaveBeenCalled()
    expect(ptys[0].resize).not.toHaveBeenCalled()

    manager.write(id, 1, 'ls\r')
    manager.resize(id, 1, 100, 40)
    expect(ptys[0].write).toHaveBeenCalledWith('ls\r')
    expect(ptys[0].resize).toHaveBeenCalledWith(100, 40)

    manager.close(id, 1)
    expect(ptys[0].kill).toHaveBeenCalled()
    expect(manager.size).toBe(0)
  })

  it('validates the request before creating anything', async () => {
    const { manager, spawnPty, tempDir } = setup()

    await expect(manager.open('connect', { ...node, host: '-oProxyCommand=x' }, { owner: 1 })).rejects.toThrow()
    await expect(manager.open('rm', node, { owner: 1 })).rejects.toThrow(/Unknown command/)
    expect(spawnPty).not.toHaveBeenCalled()
    expect(readdirSync(tempDir)).toEqual([])
  })

  it('removes the files when the pty cannot be started, and when bash is missing writes nothing', async () => {
    const tempDir = mkdtempSync(join(root, 'fail-'))
    const failing = createTerminalManager({ tempDir, getBash: () => '/bin/bash', spawnPty: () => { throw new Error('no pty') }, send: vi.fn() })
    await expect(failing.open('connect', node, { owner: 1 })).rejects.toThrow('no pty')
    expect(readdirSync(tempDir)).toEqual([])

    const noBash = createTerminalManager({ tempDir, getBash: () => { throw new Error('no bash') }, spawnPty: vi.fn(), send: vi.fn() })
    await expect(noBash.open('connect', node, { owner: 1 })).rejects.toThrow('no bash')
    expect(readdirSync(tempDir)).toEqual([])
  })

  it('limits the number of sessions and closes all of a window', async () => {
    const { manager, ptys } = setup({ maxSessions: 2 })
    await manager.open('connect', node, { owner: 1 })
    await manager.open('connect', node, { owner: 2 })

    await expect(manager.open('connect', node, { owner: 1 })).rejects.toThrow(/Too many terminals/)

    manager.closeAll(1)
    expect(ptys[0].kill).toHaveBeenCalled()
    expect(ptys[1].kill).not.toHaveBeenCalled()
    expect(manager.size).toBe(1)
    expect(MAX_SESSIONS).toBeGreaterThan(2)
  })
})

describe('createTerminalManager: output goes to the screen in batches', () => {
  afterEach(() => vi.useRealTimers())

  it('collects the pieces of one redraw into one message', async () => {
    const { manager, ptys, send } = setup()
    const id = await manager.open('connect', node, { owner: 7 })
    vi.useFakeTimers()

    ptys[0].emitData('\x1b[5;1H')
    ptys[0].emitData('spin 1')
    vi.advanceTimersByTime(OUTPUT_DELAY_MS - 1)
    ptys[0].emitData('\x1b[29;13H')
    expect(send).not.toHaveBeenCalled()

    // 첫 조각에서 OUTPUT_DELAY_MS 뒤에 보낸다. 조각이 이어져도 더 미루지 않는다.
    vi.advanceTimersByTime(1)
    expect(send.mock.calls).toEqual([[7, 'terminal:data', id, '\x1b[5;1Hspin 1\x1b[29;13H']])

    ptys[0].emitData('next')
    vi.advanceTimersByTime(OUTPUT_DELAY_MS)
    expect(send).toHaveBeenLastCalledWith(7, 'terminal:data', id, 'next')
    expect(send).toHaveBeenCalledTimes(2)

    // 보낼 것이 없으면 아무것도 보내지 않는다.
    vi.advanceTimersByTime(OUTPUT_DELAY_MS * 10)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('sends what is left before it reports the end', async () => {
    const { manager, ptys, send } = setup()
    const id = await manager.open('connect', node, { owner: 7 })
    vi.useFakeTimers()

    ptys[0].emitData('Connection closed.')
    ptys[0].emitExit(255)
    expect(send.mock.calls).toEqual([[7, 'terminal:data', id, 'Connection closed.'], [7, 'terminal:exit', id, 255]])

    vi.advanceTimersByTime(OUTPUT_DELAY_MS * 10)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('does not wait when a lot has piled up', async () => {
    const { manager, ptys, send } = setup()
    const id = await manager.open('connect', node, { owner: 7 })
    vi.useFakeTimers()

    const chunk = 'x'.repeat(MAX_PENDING_OUTPUT / 4)
    for (let i = 0; i < 3; i++) ptys[0].emitData(chunk)
    expect(send).not.toHaveBeenCalled()
    ptys[0].emitData(chunk)
    expect(send.mock.calls).toEqual([[7, 'terminal:data', id, chunk.repeat(4)]])

    // 그 뒤의 출력은 다시 모은다.
    ptys[0].emitData('tail')
    expect(send).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(OUTPUT_DELAY_MS)
    expect(send).toHaveBeenLastCalledWith(7, 'terminal:data', id, 'tail')
  })

  it('keeps the output of sessions apart, and drops that of a closed one', async () => {
    const { manager, ptys, send } = setup()
    const a = await manager.open('connect', node, { owner: 1 })
    const b = await manager.open('connect', node, { owner: 1 })
    vi.useFakeTimers()

    ptys[0].emitData('from a')
    ptys[1].emitData('from b')
    manager.close(a, 1)
    ptys[0].emitData('after the tab was closed')
    vi.advanceTimersByTime(OUTPUT_DELAY_MS)
    expect(send.mock.calls).toEqual([[1, 'terminal:data', b, 'from b']])

    ptys[1].emitData('more')
    manager.closeAll(1)
    vi.advanceTimersByTime(OUTPUT_DELAY_MS)
    expect(send).toHaveBeenCalledTimes(1)

    // 닫은 세션이 끝났다는 알림은 그대로 간다 (남은 출력 없이).
    ptys[0].emitExit(129)
    expect(send).toHaveBeenLastCalledWith(1, 'terminal:exit', a, 129)
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('createTerminalManager: a session that is ending', () => {
  it('ignores a resize and key strokes the pty no longer takes', async () => {
    const { manager, ptys, send } = setup()
    const id = await manager.open('connect', node, { owner: 1 })
    // node-pty: 프로그램이 끝난 뒤, 끝났다는 알림이 오기 전
    ptys[0].resize.mockImplementation(() => { throw new Error('Cannot resize a pty that has already exited') })
    ptys[0].write.mockImplementation(() => { throw new Error('This socket has been ended by the other party') })

    expect(() => manager.resize(id, 1, 100, 40)).not.toThrow()
    expect(() => manager.write(id, 1, 'x')).not.toThrow()
    expect(ptys[0].resize).toHaveBeenCalledWith(100, 40)
    expect(ptys[0].write).toHaveBeenCalledWith('x')

    ptys[0].emitExit(255)
    expect(send).toHaveBeenCalledWith(1, 'terminal:exit', id, 255)
  })

  it("reports Ctrl+C while connecting as 130 on Windows, where Git's bash ends with 512", async () => {
    const { manager, ptys, send } = setup({ platform: 'win32', release: '10.0.19045' })
    const id = await manager.open('connect', node, { owner: 1 })

    ptys[0].emitExit(512)
    expect(send).toHaveBeenCalledWith(1, 'terminal:exit', id, 130)
  })
})

describe('createTerminalManager: reconnect', () => {
  it('reopens an ended session with the same request and gives it a new id', async () => {
    const { manager, spawnPty, ptys, send } = setup()
    const id = await manager.open('connect', { ...node, password: 'pw' }, { owner: 3 })
    ptys[0].emitExit(255)

    const again = await manager.reopen(id, 3, { cols: 100, rows: 30 })
    expect(again).not.toBe(id)
    expect(spawnPty).toHaveBeenCalledTimes(2)
    const options = spawnPty.mock.calls[1][2]
    expect(options).toMatchObject({ cols: 100, rows: 30 })
    expect(Object.values(options.env)).toContain('pw')

    ptys[1].emitData('back')
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith(3, 'terminal:data', again, 'back'))
    // 한 번 다시 열면 옛 id로는 다시 열 수 없다.
    await expect(manager.reopen(id, 3)).rejects.toThrow(/can no longer be reconnected/)
  })

  it('only reopens for the window that owns it, and only ended sessions', async () => {
    const { manager, ptys } = setup()
    const id = await manager.open('connect', node, { owner: 1 })
    await expect(manager.reopen(id, 1)).rejects.toThrow(/can no longer/) // 아직 실행 중
    ptys[0].emitExit(0)
    await expect(manager.reopen(id, 2)).rejects.toThrow(/can no longer/)
    await expect(manager.reopen(999, 1)).rejects.toThrow(/can no longer/)
    expect(await manager.reopen(id, 1)).toBeGreaterThan(id)
  })

  it('forgets the request when the tab is closed, when the user ended it, and when the window goes away', async () => {
    const { manager, ptys } = setup()
    const a = await manager.open('connect', node, { owner: 1 })
    ptys[0].emitExit(0)
    manager.close(a, 1) // 끝난 탭을 닫는다
    await expect(manager.reopen(a, 1)).rejects.toThrow(/can no longer/)

    const b = await manager.open('connect', node, { owner: 1 })
    manager.close(b, 1) // 실행 중인 탭을 닫으면 pty가 끝나며 exit가 온다
    ptys[1].emitExit(129)
    await expect(manager.reopen(b, 1)).rejects.toThrow(/can no longer/)

    const c = await manager.open('connect', node, { owner: 1 })
    ptys[2].emitExit(0)
    manager.closeAll(1)
    await expect(manager.reopen(c, 1)).rejects.toThrow(/can no longer/)
  })

  it('keeps the request when reopening fails, so it can be tried again', async () => {
    const { manager, ptys } = setup({ maxSessions: 1 })
    const id = await manager.open('connect', node, { owner: 1 })
    ptys[0].emitExit(0)
    await manager.open('connect', node, { owner: 1 }) // 자리를 채운다

    await expect(manager.reopen(id, 1)).rejects.toThrow(/Too many terminals/)
    manager.close(2, 1)
    expect(await manager.reopen(id, 1)).toBeGreaterThan(2)
  })

  it('remembers a bounded number of ended sessions', async () => {
    const { manager, ptys } = setup({ maxSessions: 1 })
    const ids = []
    for (let i = 0; i < 3; i++) {
      ids.push(await manager.open('connect', node, { owner: 1 }))
      ptys[i].emitExit(0)
    }
    // maxSessions 1이면 2개까지 기억한다: 가장 오래된 것이 잊힌다.
    await expect(manager.reopen(ids[0], 1)).rejects.toThrow(/can no longer/)
    expect(await manager.reopen(ids[2], 1)).toBeGreaterThan(ids[2])
  })
})

// 진짜 pty(node-pty)와 bash로 생성된 스크립트를 실행한다. ssh는 BASH_ENV로 정의한 가짜 함수로 바꾸고,
// 키 입력이 프로그램까지 닿는지(한 줄을 읽어서 되돌려 준다) 확인한다.
//   Windows: JUMPSPACE_TEST_BASH에 Git의 bin\bash.exe를 지정한다.
const BASH = process.env.JUMPSPACE_TEST_BASH || (process.platform === 'win32' ? '' : '/bin/bash')

describe.skipIf(!BASH || !existsSync(BASH))('a real pty', () => {
  it('runs a connect script and passes key strokes to it', async () => {
    const { spawn } = await import('node-pty')
    const bashEnv = join(root, 'bashenv.sh')
    writeFileSync(bashEnv, 'ssh() { printf "FAKE-SSH %s\\n" "$*"; IFS= read -r line; printf "GOT:%s\\n" "$line"; }\n')

    const output = []
    let exit = null
    const tempDir = mkdtempSync(join(root, 'real-'))
    const manager = createTerminalManager({
      tempDir,
      getBash: () => BASH,
      spawnPty: (file, args, options) => spawn(file, args, { ...options, env: { ...options.env, BASH_ENV: toUnixPath(bashEnv) } }),
      send: (owner, channel, id, value) => (channel === 'terminal:data' ? output.push(value) : (exit = value))
    })

    const id = await manager.open('connect', node, { owner: 1 })
    const waitFor = async (check, ms = 15000) => {
      const end = Date.now() + ms
      while (!check()) {
        if (Date.now() > end) throw new Error(`timed out; output so far: ${sq(output.join(''))}`)
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }

    await waitFor(() => output.join('').includes('FAKE-SSH'))
    expect(output.join('')).toContain('deploy@example.com')

    manager.write(id, 1, 'typed-in-the-app\r')
    await waitFor(() => output.join('').includes('GOT:typed-in-the-app'))
    await waitFor(() => exit !== null)
    expect(exit).toBe(0)
  }, 30000)

  // 한글(멀티바이트 UTF-8)이 키 입력으로 프로그램까지 그대로 가고, 출력으로 그대로 돌아오는지.
  // Windows에서는 ConPTY와 Git의 bash.exe를 거치므로 CI의 Windows 잡에서 확인한다.
  it('passes Korean text through the pty in both directions', async () => {
    const { spawn } = await import('node-pty')
    const bashEnv = join(root, 'bashenv-hangul.sh')
    writeFileSync(bashEnv, 'ssh() { printf "READY\\n"; IFS= read -r line; printf "GOT[%s]" "$line"; printf "%s" "$line" | od -An -tx1 | tr -d " \\n"; printf "\\nEND\\n"; }\n')

    const output = []
    let exit = null
    const tempDir = mkdtempSync(join(root, 'hangul-'))
    const manager = createTerminalManager({
      tempDir,
      getBash: () => BASH,
      spawnPty: (file, args, options) => spawn(file, args, { ...options, env: { ...options.env, BASH_ENV: toUnixPath(bashEnv) } }),
      send: (owner, channel, id, value) => (channel === 'terminal:data' ? output.push(value) : (exit = value))
    })
    const text = () => output.join('')
    const waitFor = async (check, ms = 15000) => {
      const end = Date.now() + ms
      while (!check()) {
        if (Date.now() > end) throw new Error(`timed out; output so far: ${JSON.stringify(text())}`)
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }

    const id = await manager.open('connect', node, { owner: 1 })
    await waitFor(() => text().includes('READY'))
    manager.write(id, 1, '한글 입력\r')
    await waitFor(() => text().includes('END'))

    // 받은 바이트: 한 글 (공백) 입 력 in UTF-8
    expect(text()).toContain('ed959ceab88020ec9e85eba0a5')
    expect(text()).toContain('GOT[한글 입력]')
    await waitFor(() => exit !== null)
  }, 30000)

  // 전체 화면 프로그램(tmux, vim, Claude Code)이 쓰는 요청이 화면까지 오는지. Windows 10에 들어 있는 ConPTY는
  // 대체 화면과 마우스 요청을 넘기지 않아서, 앱은 node-pty에 함께 들어 있는 ConPTY를 쓴다 (CI의 Windows 잡에서 확인한다).
  it('hands the alternate screen and the mouse request of a full-screen program on to the screen', async () => {
    const { spawn } = await import('node-pty')
    const bashEnv = join(root, 'bashenv-fullscreen.sh')
    writeFileSync(bashEnv, 'ssh() { printf "READY\\n"; printf "\\033[?1049h\\033[?1000hFULL\\033[?1000l\\033[?1049l"; printf "END\\n"; }\n')

    const output = []
    let exit = null
    const tempDir = mkdtempSync(join(root, 'fullscreen-'))
    const manager = createTerminalManager({
      tempDir,
      getBash: () => BASH,
      spawnPty: (file, args, options) => spawn(file, args, { ...options, env: { ...options.env, BASH_ENV: toUnixPath(bashEnv) } }),
      send: (owner, channel, id, value) => {
        if (channel === 'terminal:exit') exit = value
        else output.push(value)
        // 새 ConPTY는 시작할 때 터미널에게 묻고(DA1) 답을 3초까지 기다린다. 화면(xterm.js)이 하듯 답한다.
        if (channel === 'terminal:data' && value.includes('\x1b[c')) manager.write(id, owner, '\x1b[?1;2c')
      }
    })
    const text = () => output.join('')

    const waitFor = async (check, ms = 15000) => {
      const end = Date.now() + ms
      while (!check()) {
        if (Date.now() > end) throw new Error(`timed out; output so far: ${JSON.stringify(text())}`)
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }

    await manager.open('connect', node, { owner: 1 })
    await waitFor(() => exit !== null)

    expect(text()).toContain('\x1b[?1049h')
    expect(text()).toContain('\x1b[?1000h')
    expect(text().indexOf('\x1b[?1049h')).toBeLessThan(text().indexOf('FULL'))
    expect(text().indexOf('FULL')).toBeLessThan(text().indexOf('\x1b[?1049l'))
    expect(exit).toBe(0)
  }, 30000)

  it.skipIf(process.platform === 'win32')('closing a session also ends the program that runs in it', async () => {
    const { spawn } = await import('node-pty')
    const bashEnv = join(root, 'bashenv-sleep.sh')
    const marker = join(root, 'still-running')
    // 가짜 ssh: 진짜 ssh처럼 따로 된 프로세스로, 잠시 기다린 뒤에도 살아 있으면 표시 파일을 만든다.
    writeFileSync(bashEnv, `ssh() { printf "FAKE-SSH\\n"; bash -c ${sq(`sleep 3; : > ${sq(toUnixPath(marker))}`)}; }\n`)

    const output = []
    const tempDir = mkdtempSync(join(root, 'kill-'))
    const manager = createTerminalManager({
      tempDir,
      getBash: () => BASH,
      spawnPty: (file, args, options) => spawn(file, args, { ...options, env: { ...options.env, BASH_ENV: toUnixPath(bashEnv) } }),
      send: (owner, channel, id, value) => channel === 'terminal:data' && output.push(value)
    })

    const id = await manager.open('connect', node, { owner: 1 })
    const end = Date.now() + 10000
    while (!output.join('').includes('FAKE-SSH') && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 50))

    manager.close(id, 1)
    await new Promise(resolve => setTimeout(resolve, 4000))

    expect(existsSync(marker)).toBe(false)
    // 스크립트의 trap이 임시 파일도 지웠다.
    expect(readdirSync(tempDir)).toEqual([])
  }, 30000)
})
