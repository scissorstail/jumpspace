import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createTerminalManager, exitStatus, KILL_WAIT_MS, killPty, MAX_PENDING_OUTPUT, MAX_SESSIONS, OUTPUT_DELAY_MS, REFLOW_BUILD, terminalBash, windowsPtyInfo } from './terminal.js'
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

// node-pty의 ConPTY는 세션 목록을 잠그지 않아서, 여러 세션이 함께 끝나면 앱이 죽었다 (KILL_WAIT_MS의 설명)
describe('createTerminalManager: sessions are ended one after another on Windows', () => {
  const windows = { platform: 'win32', release: '10.0.19045' }
  afterEach(() => vi.useRealTimers())

  // node-pty의 Windows pty처럼: 스레드가 세션을 목록에서 지운 뒤 main에서 _agent._$onProcessExit를 부른다 (released)
  function setupWindows() {
    const { spawnPty: plain, ptys } = fakePtyFactory()
    const spawnPty = vi.fn((file, args, options) => {
      const pty = plain(file, args, options)
      pty.told = vi.fn()
      pty._agent = { _$onProcessExit: pty.told }
      pty.released = code => pty._agent._$onProcessExit(code)
      return pty
    })
    const tempDir = mkdtempSync(join(root, 'kill-'))
    const manager = createTerminalManager({ tempDir, getBash: () => '/bin/bash', spawnPty, send: vi.fn(), ...windows })
    return { manager, spawnPty, ptys, tempDir }
  }
  const settle = () => new Promise(resolve => setTimeout(resolve, 0))
  const kills = ptys => ptys.map(pty => pty.kill.mock.calls.length)

  it('ends the next session only when node-pty is done with the one before', async () => {
    const { manager, ptys, tempDir } = setupWindows()
    for (let i = 0; i < 3; i++) await manager.open('connect', node, { owner: 1 })
    const other = await manager.open('connect', node, { owner: 2 })

    manager.closeAll(1)
    // 화면에는 셋 다 끝났다: 세션도 파일도 없다. pty는 첫 것만 끝냈다.
    expect(manager.size).toBe(1)
    expect(readdirSync(tempDir)).toHaveLength(1)
    expect(kills(ptys)).toEqual([1, 0, 0, 0])

    ptys[0].released(1)
    await settle()
    expect(kills(ptys)).toEqual([1, 1, 0, 0])
    // node-pty 자신의 일은 그대로 한다
    expect(ptys[0].told).toHaveBeenCalledWith(1)
    ptys[1].released(1)
    await settle()
    expect(kills(ptys)).toEqual([1, 1, 1, 0])
    ptys[2].released(1)
    await settle()

    // 다른 창의 세션은 그대로였고, 기다릴 것이 없으면 바로 끝낸다
    expect(kills(ptys)).toEqual([1, 1, 1, 0])
    manager.close(other, 2)
    expect(kills(ptys)).toEqual([1, 1, 1, 1])
    ptys[3].released(1)
  })

  it('goes on after KILL_WAIT_MS when node-pty says nothing', async () => {
    const { manager, ptys } = setupWindows()
    await manager.open('connect', node, { owner: 1 })
    await manager.open('connect', node, { owner: 1 })
    vi.useFakeTimers()

    manager.closeAll(1)
    await vi.advanceTimersByTimeAsync(KILL_WAIT_MS - 1)
    expect(kills(ptys)).toEqual([1, 0])
    await vi.advanceTimersByTimeAsync(1)
    expect(kills(ptys)).toEqual([1, 1])
  })

  it('does not wait for a session whose program had already ended', async () => {
    const { manager, ptys } = setupWindows()
    await manager.open('connect', node, { owner: 1 })
    await manager.open('connect', node, { owner: 1 })
    // node-pty는 알렸지만 화면에는 아직 끝나지 않았다
    ptys[0].released(0)

    manager.closeAll(1)
    await settle()
    expect(kills(ptys)).toEqual([1, 1])
    ptys[1].released(1)
  })

  // 시작도 node-pty의 그 목록을 고친다
  it('starts a session only when the sessions being ended are done, and not when its window went away meanwhile', async () => {
    const { manager, spawnPty, ptys } = setupWindows()
    const first = await manager.open('connect', node, { owner: 1 })
    manager.close(first, 1)

    const next = manager.open('connect', node, { owner: 1 })
    const gone = manager.open('connect', node, { owner: 2 })
    // 파일을 다 쓸 때까지 (기다리지 않는다면 여기서 둘 다 시작했을 것이다)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(spawnPty).toHaveBeenCalledTimes(1)

    manager.closeAll(2)
    ptys[0].released(1)
    expect(await next).toBeGreaterThan(first)
    await expect(gone).rejects.toThrow(/closed or reloaded/)
    expect(spawnPty).toHaveBeenCalledTimes(2)
    expect(manager.size).toBe(1)
  })

  it('ends sessions at once outside Windows', async () => {
    const { manager, ptys } = setup()
    for (let i = 0; i < 3; i++) await manager.open('connect', node, { owner: 1 })
    manager.closeAll(1)
    expect(kills(ptys)).toEqual([1, 1, 1])
  })

  // 기다림은 설치된 node-pty 안의 것에 기댄다. 판이 바뀌어 그것이 없어지거나 목록을 잠그게 되면 여기서 알게 된다.
  it('relies on what the installed node-pty does on Windows', () => {
    const pty = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'node_modules', 'node-pty')
    const read = file => readFileSync(join(pty, file), 'utf8')
    expect(read('lib/windowsPtyAgent.js')).toMatch(/this\._useConptyDll, function \(c\) \{ return _this\._\$onProcessExit\(c\); \}\);/)
    expect(read('lib/windowsTerminal.js')).toMatch(/_this\._agent = new windowsPtyAgent_1\.WindowsPtyAgent\(/)
    const conpty = read('src/win/conpty.cc')
    expect(conpty).toMatch(/static std::vector<std::unique_ptr<pty_baton>> ptyHandles;/)
    expect(conpty).toMatch(/CloseHandle\(baton->hShell\);\s+assert\(remove_pty_baton\(baton->id\)\);\s+auto status = tsfn\.BlockingCall/)
    expect(conpty).not.toMatch(/mutex|CRITICAL_SECTION|SRWLOCK/)
  })
})

describe('createTerminalManager', () => {
  it('runs the generated script in a pty and forwards its output to the window that opened it', async () => {
    const { manager, spawnPty, ptys, send } = setup()

    // 임시 폴더 이름(무작위 글자)에 우연히 들어 있을 수 없는 값: 'pw'였을 때 이 테스트가 가끔 실패했다.
    const id = await manager.open('connect', { ...node, password: 'pass word!' }, { owner: 7, cols: 120, rows: 30 })
    const [file, args, options] = spawnPty.mock.calls[0]

    expect(file).toBe('/bin/bash')
    expect(args).toHaveLength(1)
    expect(existsSync(args[0])).toBe(true)
    expect(options).toMatchObject({ cols: 120, rows: 30, name: 'xterm-256color' })
    expect(options.env.TERM).toBe('xterm-256color')
    expect(options.env.JUMPSPACE_IN_APP).toBe('1')
    // 비밀번호는 환경변수로만 넘어가고 인자에는 없다.
    expect(Object.values(options.env)).toContain('pass word!')
    expect(args.join(' ')).not.toContain('pass word!')

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

  it('reports why the pty could not be started, also when its files cannot be removed either', async () => {
    const tempDir = mkdtempSync(join(root, 'stuck-'))
    const spawnPty = (file, args) => {
      // 시작에 실패하는 동안 스크립트가 지울 수 없는 것이 되었다: 파일 대신 비어 있지 않은 폴더.
      rmSync(args[0])
      mkdirSync(args[0])
      writeFileSync(join(args[0], 'held'), '')
      throw new Error('no pty')
    }
    const manager = createTerminalManager({ tempDir, getBash: () => '/bin/bash', spawnPty, send: vi.fn(), platform: 'linux' })

    await expect(manager.open('connect', node, { owner: 1 })).rejects.toThrow('no pty')
    expect(manager.size).toBe(0)
  })

  // 가짜 pty는 스크립트를 실행하지 않는다: 아래에서 파일을 지우는 것은 main이다. (Windows에서는 닫힌 세션의 bash가
  // 자기 trap을 실행하지 못한다)
  const jump = [node, { ...node, name: 'db', host: 'db.internal' }]

  it('removes the script and the config of a session when it is closed, and leaves those of the others', async () => {
    const { manager, spawnPty, tempDir } = setup()
    const first = await manager.open('proxyJump', jump, { owner: 1 })
    await manager.open('connect', node, { owner: 1 })
    // 경로를 거치는 세션은 스크립트와 ssh config를, 직접 접속은 스크립트만 쓴다.
    expect(readdirSync(tempDir).map(name => extname(name)).sort()).toEqual(['.jmp', '.sh', '.sh'])

    // 다른 창의 요청으로는 지워지지 않는다.
    manager.close(first, 2)
    expect(readdirSync(tempDir)).toHaveLength(3)

    manager.close(first, 1)
    expect(readdirSync(tempDir).map(name => toUnixPath(join(tempDir, name)))).toEqual([spawnPty.mock.calls[1][1][0]])
  })

  it('removes the files of every session of a window that goes away, and of all of them when the app ends', async () => {
    const { manager, tempDir } = setup()
    await manager.open('proxyJump', jump, { owner: 1 })
    await manager.open('connect', node, { owner: 1 })
    await manager.open('proxyJump', jump, { owner: 2 })
    await manager.open('connect', node, { owner: 3 })

    manager.closeAll(1)
    expect(readdirSync(tempDir).map(name => extname(name)).sort()).toEqual(['.jmp', '.sh', '.sh'])
    manager.closeAll()
    expect(readdirSync(tempDir)).toEqual([])
  })

  it('removes the files of a session that ended without cleaning up after itself, and writes new ones to reconnect', async () => {
    const { manager, ptys, tempDir } = setup()
    const id = await manager.open('forward', { via: [node], forwards: [{ checked: true, from: '8080', to: '80' }] }, { owner: 1 })
    expect(readdirSync(tempDir)).toHaveLength(2)

    // bash가 밖에서 죽었을 때처럼 스크립트의 trap 없이 끝났다.
    ptys[0].emitExit(1)
    expect(readdirSync(tempDir)).toEqual([])

    await manager.reopen(id, 1)
    expect(readdirSync(tempDir)).toHaveLength(2)
    expect(existsSync(ptys[1].args[0])).toBe(true)
    expect(ptys[1].args[0]).not.toBe(ptys[0].args[0])
  })

  it('goes on when a file of a closed session cannot be removed', async () => {
    const { manager, ptys, tempDir } = setup()
    const id = await manager.open('proxyJump', jump, { owner: 1 })
    const script = ptys[0].args[0]
    // 지울 수 없는 것으로 바꾼다: 파일 대신 비어 있지 않은 폴더.
    rmSync(script)
    mkdirSync(script)
    writeFileSync(join(script, 'held'), '')

    expect(() => manager.close(id, 1)).not.toThrow()
    expect(ptys[0].kill).toHaveBeenCalled()
    expect(manager.size).toBe(0)
    // 스크립트는 남았고, ssh config는 그래도 지워졌다.
    expect(readdirSync(tempDir).map(name => extname(name))).toEqual(['.sh'])
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

  // 빈 자리를 본 뒤 세션이 생기기까지 파일을 쓰는 동안 기다린다: 그 사이에 온 요청도 그 자리를 보면 안 된다
  it('keeps the limit when many sessions are asked for at once', async () => {
    const { manager, ptys, tempDir } = setup({ maxSessions: 2 })
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => manager.open('connect', node, { owner: 1 })))

    expect(results.map(x => x.status)).toEqual(['fulfilled', 'fulfilled', 'rejected', 'rejected'])
    expect(String(results[3].reason)).toMatch(/Too many terminals/)
    expect(ptys).toHaveLength(2)
    expect(manager.size).toBe(2)
    expect(readdirSync(tempDir)).toHaveLength(2)

    // 닫으면 자리가 난다. 열리다 만 것들은 자리를 잡고 있지 않다.
    manager.close(results[0].value, 1)
    expect(await manager.open('connect', node, { owner: 1 })).toBeGreaterThan(results[1].value)
    await expect(manager.open('connect', node, { owner: 1 })).rejects.toThrow(/Too many terminals/)
  })

  it('counts a session that is being opened, also for reopen', async () => {
    const { manager, ptys } = setup({ maxSessions: 2 })
    const first = await manager.open('connect', node, { owner: 1 })
    ptys[0].emitExit(255)

    const results = await Promise.allSettled([manager.open('connect', node, { owner: 1 }), manager.reopen(first, 1), manager.open('connect', node, { owner: 1 })])
    expect(results.map(x => x.status)).toEqual(['fulfilled', 'fulfilled', 'rejected'])
    expect(manager.size).toBe(2)
  })

  // 파일을 쓰는 사이에 그 창이 새로 고쳐지거나 닫혔다: 세션은 탭 없이 돌았을 것이다
  it('does not start a session whose window went away while its files were written', async () => {
    const { manager, ptys, tempDir } = setup()
    const gone = manager.open('connect', node, { owner: 1 })
    const other = manager.open('connect', node, { owner: 2 })
    manager.closeAll(1)

    await expect(gone).rejects.toThrow(/closed or reloaded/)
    expect(await other).toBeGreaterThan(0)
    expect(ptys).toHaveLength(1)
    expect(manager.size).toBe(1)
    // 그 세션의 파일도 남지 않는다 (다른 창의 세션의 것만 있다)
    expect(readdirSync(tempDir)).toHaveLength(1)

    // 다음 요청은 열린다: 창은 새로 고쳐진 뒤에도 같은 번호다
    expect(await manager.open('connect', node, { owner: 1 })).toBeGreaterThan(0)
    expect(manager.size).toBe(2)
  })

  it('forgets the request of a reconnect whose window went away meanwhile', async () => {
    const { manager, ptys } = setup()
    const id = await manager.open('connect', node, { owner: 1 })
    ptys[0].emitExit(255)

    const again = manager.reopen(id, 1)
    manager.closeAll(1)
    await expect(again).rejects.toThrow(/closed or reloaded/)
    expect(ptys).toHaveLength(1)
    // 다시 열 탭이 없다: 요청을 들고 있지 않는다
    await expect(manager.reopen(id, 1)).rejects.toThrow(/can no longer/)
  })

  it('starts nothing that was being opened when the app ends', async () => {
    const { manager, ptys, tempDir } = setup()
    const opened = await manager.open('connect', node, { owner: 1 })
    // ProxyJump: 스크립트에 ssh config까지, 파일이 둘이다
    const late = [manager.open('connect', node, { owner: 1 }), manager.open('proxyJump', [node, { ...node, name: 'db', host: 'db.internal' }], { owner: 2 })]
    manager.closeAll()

    for (const result of await Promise.allSettled(late)) expect(String(result.reason)).toMatch(/closed or reloaded/)
    expect(opened).toBeGreaterThan(0)
    expect(ptys).toHaveLength(1)
    expect(ptys[0].kill).toHaveBeenCalled()
    expect(manager.size).toBe(0)
    expect(readdirSync(tempDir)).toEqual([])
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

  // Windows에서는 pty(ConPTY)가 닫히면 그 안의 프로그램이 신호 없이 하나씩 끝난다. 그래서 bash는 trap을 실행하지 못하고,
  // 먼저 끝난 프로그램을 기다리던 bash는 자기 차례가 올 때까지(20~30ms) 다음 명령을 실행한다: 끝난 프로그램은 잘 끝난 것으로 보인다.
  it('closing a session also ends the program that runs in it, and its files are gone', async () => {
    const { spawn } = await import('node-pty')
    const bashEnv = join(root, 'bashenv-sleep.sh')
    const started = join(root, 'started')
    const marker = join(root, 'still-running')
    // 가짜 ssh: 진짜 ssh처럼 따로 된 프로세스로, 시작했다고 표시하고 3초 뒤에도 살아 있으면 표시 파일을 만든다.
    // 3초를 정말 기다렸는지 잰다: 위에 쓴 대로 Windows에서는 중간에 끝난 sleep의 다음 명령도 실행될 수 있다.
    const program = `: > ${sq(toUnixPath(started))}; s=$SECONDS; sleep 3; [ $((SECONDS - s)) -ge 2 ] && : > ${sq(toUnixPath(marker))}`
    writeFileSync(bashEnv, `ssh() { bash -c ${sq(program)}; }\n`)

    const tempDir = mkdtempSync(join(root, 'kill-'))
    const manager = createTerminalManager({
      tempDir,
      getBash: () => BASH,
      spawnPty: (file, args, options) => spawn(file, args, { ...options, env: { ...options.env, BASH_ENV: toUnixPath(bashEnv) } }),
      // 새 ConPTY는 시작할 때 터미널에게 묻고(DA1) 답을 3초까지 기다린다. 화면(xterm.js)이 하듯 답한다.
      send: (owner, channel, id, value) => channel === 'terminal:data' && value.includes('\x1b[c') && manager.write(id, owner, '\x1b[?1;2c')
    })

    const id = await manager.open('connect', node, { owner: 1 })
    const end = Date.now() + 15000
    while (!existsSync(started) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 50))
    expect(existsSync(started)).toBe(true)
    expect(readdirSync(tempDir)).toHaveLength(1)

    manager.close(id, 1)
    // 스크립트는 닫는 순간 main이 지운다: bash가 아직 그 파일을 읽고 있어도, 앱이 바로 끝나도 남지 않는다.
    expect(readdirSync(tempDir)).toEqual([])
    await new Promise(resolve => setTimeout(resolve, 4000))

    expect(existsSync(marker)).toBe(false)
    expect(readdirSync(tempDir)).toEqual([])
  }, 30000)
})
