import { existsSync } from 'node:fs'
import { release as osRelease } from 'node:os'
import { win32 } from 'node:path'
import { expandEnv, prepareSession } from './launcher.js'

export const MAX_SESSIONS = 16
const MAX_WRITE = 64 * 1024

// 앱 안의 터미널에서 쓸 bash. Windows에서는 설정의 git-bash.exe(mintty를 띄우는 실행기) 옆에 있는 bin\bash.exe를 쓴다.
export function terminalBash(gitBashPath, { platform = process.platform, exists = existsSync, env = process.env } = {}) {
  if (platform !== 'win32') {
    return '/bin/bash'
  }

  const configured = expandEnv(gitBashPath || '', env)
  const bash = /^git-bash\.exe$/i.test(win32.basename(configured))
    ? win32.join(win32.dirname(configured), 'bin', 'bash.exe')
    : configured

  if (!bash || !exists(bash)) {
    throw new Error(`bash.exe of Git for Windows was not found: ${bash || '(not set)'}\nCheck "Git Bash path" in Settings.`)
  }
  return bash
}

// pty가 끝난 상태. 신호로 끝났으면(예: 접속 중 Ctrl+C로 bash까지 SIGINT) 쉘처럼 128 + 신호 번호로 알린다. (Windows는 신호가 없다)
export function exitStatus({ exitCode, signal }) {
  if (exitCode) return exitCode
  return signal ? 128 + signal : 0
}

// 세션을 끝낸다. pty.kill()은 bash에만 신호를 보내서 그 아래의 ssh가 남는다. (bash는 실행 중인 명령이 끝나야 trap을 실행한다)
// node-pty는 세션마다 새 프로세스 그룹을 만들므로 Unix에서는 그룹 전체에 SIGHUP을 보낸다. Windows는 ConPTY를 닫으면 함께 끝난다.
export function killPty(pty, { platform = process.platform, kill = process.kill.bind(process) } = {}) {
  if (platform !== 'win32' && Number.isInteger(pty.pid) && pty.pid > 0) {
    try {
      kill(-pty.pid, 'SIGHUP')
    } catch {}
  }
  try {
    pty.kill()
  } catch {}
}

// 화면(xterm.js)에게 pty가 Windows의 ConPTY라고 알려 주는 값 (xterm.js의 windowsPty 옵션). Windows가 아니면 null.
// ConPTY는 크기가 바뀌면 자기 화면을 스스로 맞춘다. xterm.js가 이것을 모르면 패널이 높아질 때 지난 출력을 화면으로
// 끌어내리는데, ConPTY는 그 자리를 빈 줄로 여겨서 다시 그리고 그 줄들이 사라진다.
// buildNumber는 xterm.js가 긴 줄을 스스로 다시 접을지(REFLOW_BUILD부터)를 정한다. 앱에 함께 넣은 ConPTY(bundled)는
// Windows 버전과 상관없이 새 것이라서, 화면이 다시 접어야 한다 (오래된 Windows의 번호를 그대로 주면 긴 줄이 잘린 채 남았다).
export const REFLOW_BUILD = 21376

export function windowsPtyInfo({ platform = process.platform, release = osRelease(), bundled = false } = {}) {
  if (platform !== 'win32') return null

  const build = Number(String(release).split('.')[2])
  const buildNumber = Number.isInteger(build) && build > 0 ? build : undefined
  return { backend: 'conpty', buildNumber: bundled ? Math.max(buildNumber ?? 0, REFLOW_BUILD) : buildNumber }
}

const isSize = value => Number.isInteger(value) && value >= 2 && value <= 1000

// 터미널 세션(pty)을 관리한다. 세션은 연 화면(owner, webContents id)만 쓰고 닫을 수 있다.
// 실행하는 것은 ssh.js가 만든 스크립트뿐이고, 화면에서는 키 입력만 보낸다.
//   send(owner, channel, ...args): 화면으로 보내기 ('terminal:data', 'terminal:exit')
//   spawnPty(file, args, options): node-pty의 spawn (테스트에서 바꾼다)
//   getBash(): 실행할 bash 경로
//   platform, release: 테스트에서 바꾼다 (Windows에서만 ConPTY를 고른다)
// 끝난 세션의 요청은 탭에서 다시 접속(reopen)할 수 있도록 탭이 닫힐 때까지 기억한다. (비밀번호가 들어 있어서
// 화면(store)에는 다시 두지 않는다) 사용자가 닫은 세션은 기억하지 않는다.
export function createTerminalManager({ tempDir, getBash, spawnPty, send, maxSessions = MAX_SESSIONS, platform = process.platform, release = osRelease() }) {
  const sessions = new Map()
  const ended = new Map() // id -> { owner, kind, payload }
  const maxEnded = maxSessions * 2
  let nextId = 1
  // Windows에서는 node-pty에 함께 들어 있는 ConPTY(conpty.dll, OpenConsole.exe)를 쓴다. Windows 10에 들어 있는 ConPTY는
  // 프로그램의 출력을 자기 화면에 그린 뒤 다시 내보내서, 마우스와 대체 화면(전체 화면 프로그램)이 전해지지 않고
  // 화면을 다시 그리는 동안 커서가 그 자리에 보였다 (tmux, Claude Code, Codex). 함께 온 것은 받은 그대로 넘긴다.
  // 그것을 쓸 수 없으면(파일이 없거나 막혔다) Windows의 것으로 열고, 그 뒤로는 다시 시도하지 않는다.
  let bundledConpty = platform === 'win32'

  function spawnSession(file, args, options) {
    if (bundledConpty) {
      try {
        return { pty: spawnPty(file, args, { ...options, useConptyDll: true }), bundled: true }
      } catch {
        const pty = spawnPty(file, args, options)
        bundledConpty = false
        return { pty, bundled: false }
      }
    }
    return { pty: spawnPty(file, args, options), bundled: false }
  }

  function owned(id, owner) {
    const session = sessions.get(id)
    return session && session.owner === owner ? session : null
  }

  function remember(id, entry) {
    ended.set(id, entry)
    // 오래된 것부터 잊는다. (탭을 닫지 않고 계속 다시 여는 경우)
    while (ended.size > maxEnded) ended.delete(ended.keys().next().value)
  }

  function forget(id, owner) {
    const entry = ended.get(id)
    if (entry && entry.owner === owner) ended.delete(id)
  }

  async function open(kind, payload, { owner, cols = 80, rows = 24 }) {
    if (sessions.size >= maxSessions) {
      throw new Error(`Too many terminals are open (at most ${maxSessions}). Close one first.`)
    }

    const prepared = prepareSession(kind, payload, { tempDir })
    const bash = getBash()
    await prepared.write()

    let spawned
    try {
      spawned = spawnSession(bash, [prepared.scriptPath], {
        name: 'xterm-256color',
        cols: isSize(cols) ? cols : 80,
        rows: isSize(rows) ? rows : 24,
        // JUMPSPACE_IN_APP: 스크립트가 ssh 실패 뒤 Enter를 기다리지 않는다 (ssh.js)
        env: { ...process.env, ...prepared.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', JUMPSPACE_IN_APP: '1' }
      })
    } catch (e) {
      await prepared.cleanup()
      throw e
    }

    const { pty, bundled } = spawned
    const id = nextId++
    sessions.set(id, { owner, pty, windowsPty: windowsPtyInfo({ platform, release, bundled }) })
    pty.onData(data => send(owner, 'terminal:data', id, data))
    pty.onExit(event => {
      const exitCode = exitStatus(event)
      // 사용자가 닫은 세션(close/closeAll이 이미 지웠다)은 다시 열 일이 없다.
      if (sessions.delete(id)) remember(id, { owner, kind, payload })
      send(owner, 'terminal:exit', id, exitCode)
    })
    return id
  }

  return {
    get size() {
      return sessions.size
    },

    open,

    // 세션의 pty에 대해 화면이 알아야 할 것 (windowsPtyInfo). Windows가 아니거나 모르는 세션이면 null.
    windowsPty(id, owner) {
      return owned(id, owner)?.windowsPty ?? null
    },

    // 끝난 세션을 같은 요청으로 다시 연다. 새 세션의 id를 돌려준다.
    async reopen(id, owner, { cols, rows } = {}) {
      const entry = ended.get(id)
      if (!entry || entry.owner !== owner) {
        throw new Error('This session can no longer be reconnected. Start it again from its node.')
      }
      ended.delete(id)
      try {
        return await open(entry.kind, entry.payload, { owner, cols, rows })
      } catch (e) {
        remember(id, entry) // 다시 시도할 수 있게 남겨 둔다 (예: 터미널이 너무 많을 때)
        throw e
      }
    },

    write(id, owner, data) {
      const session = owned(id, owner)
      if (session && typeof data === 'string' && data.length <= MAX_WRITE) {
        session.pty.write(data)
      }
    },

    resize(id, owner, cols, rows) {
      const session = owned(id, owner)
      if (session && isSize(cols) && isSize(rows)) {
        session.pty.resize(cols, rows)
      }
    },

    // 탭을 닫으면 세션을 끝내고, 끝난 세션이면 기억해 둔 요청을 잊는다.
    close(id, owner) {
      forget(id, owner)
      const session = owned(id, owner)
      if (session) {
        sessions.delete(id)
        killPty(session.pty)
      }
    },

    // 창이 닫히거나 새로고침될 때 그 화면의 세션을 모두 끝낸다.
    closeAll(owner) {
      for (const [id, entry] of ended) {
        if (owner === undefined || entry.owner === owner) ended.delete(id)
      }
      for (const [id, session] of sessions) {
        if (owner === undefined || session.owner === owner) {
          sessions.delete(id)
          killPty(session.pty)
        }
      }
    }
  }
}
