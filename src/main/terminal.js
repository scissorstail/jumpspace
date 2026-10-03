import { existsSync } from 'node:fs'
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

// 세션을 끝낸다. pty.kill()은 bash에만 신호를 보내서 그 아래의 ssh가 남는다. (bash는 실행 중인 명령이 끝나야 trap을 실행한다)
// node-pty는 세션마다 새 프로세스 그룹을 만들므로 Unix에서는 그룹 전체에 SIGHUP을 보낸다. Windows는 ConPTY를 닫으면 함께 끝난다.
// pty가 끝난 상태. 신호로 끝났으면(예: 접속 중 Ctrl+C로 bash까지 SIGINT) 쉘처럼 128 + 신호 번호로 알린다. (Windows는 신호가 없다)
export function exitStatus({ exitCode, signal }) {
  if (exitCode) return exitCode
  return signal ? 128 + signal : 0
}

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

const isSize = value => Number.isInteger(value) && value >= 2 && value <= 1000

// 터미널 세션(pty)을 관리한다. 세션은 연 화면(owner, webContents id)만 쓰고 닫을 수 있다.
// 실행하는 것은 ssh.js가 만든 스크립트뿐이고, 화면에서는 키 입력만 보낸다.
//   send(owner, channel, ...args): 화면으로 보내기 ('terminal:data', 'terminal:exit')
//   spawnPty(file, args, options): node-pty의 spawn (테스트에서 바꾼다)
//   getBash(): 실행할 bash 경로
// 끝난 세션의 요청은 탭에서 다시 접속(reopen)할 수 있도록 탭이 닫힐 때까지 기억한다. (비밀번호가 들어 있어서
// 화면(store)에는 다시 두지 않는다) 사용자가 닫은 세션은 기억하지 않는다.
export function createTerminalManager({ tempDir, getBash, spawnPty, send, maxSessions = MAX_SESSIONS }) {
  const sessions = new Map()
  const ended = new Map() // id -> { owner, kind, payload }
  const maxEnded = maxSessions * 2
  let nextId = 1

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

    let pty
    try {
      pty = spawnPty(bash, [prepared.scriptPath], {
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

    const id = nextId++
    sessions.set(id, { owner, pty })
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
