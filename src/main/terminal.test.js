import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { createTerminalManager, killPty, MAX_SESSIONS, terminalBash } from './terminal.js'
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
  const manager = createTerminalManager({ tempDir, getBash: () => '/bin/bash', spawnPty, send, ...extra })
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
    expect(send).toHaveBeenCalledWith(7, 'terminal:data', id, 'hello')

    ptys[0].emitExit(0)
    expect(send).toHaveBeenCalledWith(7, 'terminal:exit', id, 0)
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
