import { release as osRelease } from 'node:os'
import { win32 } from 'node:path'
import { MAX_WRITE } from '../shared/terminal-input.js'
import { expandEnv, isFile, prepareSession } from './launcher.js'

export const MAX_SESSIONS = 16

// 세션이 열리는 동안 그것을 부탁한 창이 닫히거나 새로 고쳐졌다 (closeAll)
class WindowGone extends Error {}

// 앱 안의 터미널에서 쓸 bash. Windows에서는 설정의 git-bash.exe(mintty를 띄우는 실행기) 옆에 있는 bin\bash.exe를 쓴다.
export function terminalBash(gitBashPath, { platform = process.platform, exists = isFile, env = process.env } = {}) {
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

// pty가 끝난 상태. 신호로 끝났으면(예: 접속 중 Ctrl+C로 bash까지 SIGINT) 쉘처럼 128 + 신호 번호로 알린다.
// Windows에는 신호가 없지만 Git의 bash(MSYS)는 신호로 끝난 것을 종료 코드의 윗바이트(신호 << 8)로 남긴다:
// 접속 중 Ctrl+C는 512로 끝났다. 아랫바이트가 0이고 한 바이트를 넘는 값만 그렇게 읽는다 (보통의 종료 코드는 255까지).
export function exitStatus({ exitCode, signal }, { platform = process.platform } = {}) {
  if (platform === 'win32' && exitCode > 0xff && exitCode <= 0xffff && (exitCode & 0xff) === 0) {
    return 128 + ((exitCode >> 8) & 0x7f)
  }
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

// pty의 출력을 화면으로 보내기 전에 모으는 시간. 화면을 다시 그리는 프로그램(Claude Code, tmux)의 한 장면은 pty에서
// 수십 조각으로 나뉘어 온다 (함께 온 ConPTY에서 한 장면에 25조각쯤). 조각마다 보내면 화면이 그 사이에 그려져서 반쯤
// 그린 장면과 그 자리의 커서가 보였다. 8ms면 그런 장면이 거의 없었고(4ms로는 남았다), 키 입력의 메아리에는 느껴지지 않는다.
export const OUTPUT_DELAY_MS = 8
// 이만큼 쌓이면 기다리지 않고 보낸다 (출력이 쏟아질 때 한 번에 보내는 양의 한도).
export const MAX_PENDING_OUTPUT = 256 * 1024

// 앱이 끝내는 세션은 Windows에서 하나씩 끝낸다. node-pty(1.1.0)의 ConPTY는 세션 목록(conpty.cc의 ptyHandles)을 잠그지
// 않는다: 세션의 프로그램이 끝나면 그 세션의 스레드가 목록에서 그것을 지우는데(SetupExitCallback, conpty.cc:106), 여럿이
// 거의 함께 끝나면 그 스레드들이 같은 목록을 함께 고쳐서 앱(main)이 죽었다 (conpty.node에서 c0000005: 실제 창에서 세션
// 16개를 연 채 새로 고쳤을 때 한 번, Node만으로 32개를 한 루프에서 끝내면 20번에 3번). 그 스레드는 지우기를 마친 뒤
// main에서 _$onProcessExit를 부른다. 그래서 다음 것은 앞의 것의 그 알림이 온 뒤에, 늦어도 KILL_WAIT_MS 뒤에 끝내고,
// 그동안은 새 세션도 시작하지 않는다(시작도 그 목록을 고친다). 32개를 이렇게 끝내는 데 0.5초쯤 걸렸고 죽지 않았다.
// 저절로 함께 끝나는 세션(서버가 함께 끊을 때)과 그때의 크기 변경(목록을 읽는다)은 막지 못한다: 그 틈은 아주 짧다.
export const KILL_WAIT_MS = 2000

// node-pty의 스레드가 이 세션을 목록에서 지우고 main에 알렸을 때 끝나는 Promise. 알림을 받을 곳이 없으면 null.
// (_$onProcessExit는 node-pty 안의 것이다: terminal.test.js가 설치된 node-pty에 그것이 있는지 본다)
function nativeExit(pty) {
  const agent = pty?._agent
  if (!agent || typeof agent._$onProcessExit !== 'function') return null
  return new Promise(resolve => {
    const told = agent._$onProcessExit
    agent._$onProcessExit = function (...args) {
      try {
        return told.apply(this, args)
      } finally {
        resolve()
      }
    }
  })
}

// promise가 끝나거나 ms가 지나면 끝난다 (타이머를 남기지 않는다)
function waitFor(promise, ms) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms)
    promise.then(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}

// 터미널 세션(pty)을 관리한다. 세션은 연 화면(owner, webContents id)만 쓰고 닫을 수 있다.
// 실행하는 것은 ssh.js가 만든 스크립트뿐이고, 화면에서는 키 입력만 보낸다.
//   send(owner, channel, ...args): 화면으로 보내기 ('terminal:data', 'terminal:exit')
//   spawnPty(file, args, options): node-pty의 spawn (테스트에서 바꾼다)
//   getBash(): 실행할 bash 경로
//   platform, release: 테스트에서 바꾼다 (Windows에서만 ConPTY를 고른다)
// 끝난 세션의 요청은 탭에서 다시 접속(reopen)할 수 있도록 탭이 닫힐 때까지 기억한다. (비밀번호가 들어 있어서
// 화면(store)에는 다시 두지 않는다) 사용자가 닫은 세션은 기억하지 않는다. 돌고 있는 세션의 요청은 같은 접속의 세션을
// 하나 더 열 때(duplicate) 쓴다.
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

  // 열리는 중인 세션 (파일을 쓰고, 앱이 끝내는 세션이 다 끝나기를 기다리는 동안이다: open에서 기다리는 곳은 그 둘뿐이다).
  // 빈 자리를 셀 때 함께 센다: 한꺼번에 온 요청이 모두 같은 빈 자리를 보고 한도를 넘었다. 그 사이에 그 창이 닫히거나
  // 새로 고쳐지면(closeAll) 열지 않는다: 그 세션은 탭 없이 main에서 돌았을 것이다 (새로 고친 화면은 그 번호를 모른다).
  const opening = new Set()

  // 끝낼 세션들 (차례로, KILL_WAIT_MS 위의 설명). 끝내는 동안 isKilling이고, killed는 그 일이 다 끝나면 끝난다.
  const kills = []
  let isKilling = false
  let killed = Promise.resolve()

  async function killInTurn() {
    isKilling = true
    try {
      while (kills.length) {
        const session = kills.shift()
        killPty(session.pty)
        if (session.released) await waitFor(session.released, KILL_WAIT_MS)
      }
    } finally {
      isKilling = false
    }
  }

  async function open(kind, payload, { owner, cols = 80, rows = 24 }) {
    if (sessions.size + opening.size >= maxSessions) {
      throw new Error(`Too many terminals are open (at most ${maxSessions}). Close one first.`)
    }

    const prepared = prepareSession(kind, payload, { tempDir })
    const bash = getBash()
    const pending = { owner, cancelled: false }
    opening.add(pending)
    try {
      await prepared.write()
      // 앱이 끝내는 세션이 있으면 그것들이 다 끝난 뒤에 시작한다. killed는 그동안 끝내게 된 것까지 끝내야 끝나고(killInTurn),
      // 그 뒤 여기로 돌아오기 전에 새로 끝내기 시작할 수는 없다 (그것은 창의 요청이나 이벤트에서만 시작한다).
      if (isKilling) await killed
      if (pending.cancelled) throw new WindowGone('The window of this terminal was closed or reloaded before it started.')
    } catch (e) {
      // 쓰다 만 파일도 지운다
      prepared.cleanup()
      throw e
    } finally {
      opening.delete(pending)
    }

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
      prepared.cleanup()
      throw e
    }

    const { pty, bundled } = spawned
    const id = nextId++
    // request: 같은 접속을 하나 더 열 때 쓴다 (duplicate). 비밀번호가 들어 있어서 화면에는 다시 주지 않는다.
    const session = { owner, request: { kind, payload }, pty, cleanup: prepared.cleanup, windowsPty: windowsPtyInfo({ platform, release, bundled }), pending: '', timer: null, released: platform === 'win32' ? nativeExit(pty) : null }
    sessions.set(id, session)

    // 모아 둔 출력을 화면으로 보낸다. (OUTPUT_DELAY_MS)
    const flush = () => {
      clearTimeout(session.timer)
      session.timer = null
      if (session.pending) {
        const data = session.pending
        session.pending = ''
        send(owner, 'terminal:data', id, data)
      }
    }

    pty.onData(data => {
      // 사용자가 닫은 세션의 남은 출력은 받을 화면이 없다.
      if (sessions.get(id) !== session) return
      session.pending += data
      if (session.pending.length >= MAX_PENDING_OUTPUT) flush()
      else if (session.timer === null) session.timer = setTimeout(flush, OUTPUT_DELAY_MS)
    })
    pty.onExit(event => {
      const exitCode = exitStatus(event, { platform })
      // 끝났다는 알림보다 마지막 출력이 먼저 가야 한다.
      flush()
      // 스스로 끝난 스크립트는 자기 파일을 지우고 가지만, 그러지 못하고 끝날 때가 있다 (Windows에서 접속 중 Ctrl+C, 밖에서
      // 죽은 bash). 다시 접속하면 새 파일을 쓴다.
      session.cleanup()
      // 사용자가 닫은 세션(close/closeAll이 이미 지웠다)은 다시 열 일이 없다.
      if (sessions.delete(id)) remember(id, { owner, kind, payload })
      send(owner, 'terminal:exit', id, exitCode)
    })
    return id
  }

  // 세션을 끝낸다. 모아 둔 출력은 버린다. pty는 차례로 끝낸다 (killInTurn): 목록에서는 이미 빠졌으므로 화면에는 끝난 것이다.
  // 스크립트와 ssh config는 여기서 지운다. 스크립트의 trap에 맡길 수 없다: Windows에서는 ConPTY가 닫히면 bash가 trap을
  // 실행하지 못하고 끝나서, 닫은 탭마다 파일(호스트와 사용자 이름이 들어 있다)이 임시 폴더에 남았다. (하루가 지나야 치워진다)
  function end(id, session) {
    sessions.delete(id)
    clearTimeout(session.timer)
    session.timer = null
    session.pending = ''
    kills.push(session)
    if (!isKilling) killed = killInTurn()
    session.cleanup()
  }

  return {
    get size() {
      return sessions.size
    },

    // 돌고 있는 세션의 수, 모든 창의 것: 열리는 중인 것도 센다 (앱이 끝나면 그것도 열지 않는다). 트레이의 Quit이 묻는 수.
    get running() {
      return sessions.size + opening.size
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
        // 다시 시도할 수 있게 남겨 둔다 (예: 터미널이 너무 많을 때). 창이 닫히거나 새로 고쳐졌으면 다시 열 탭이 없다:
        // 요청(비밀번호 포함)을 들고 있을 까닭도 없다.
        if (!(e instanceof WindowGone)) remember(id, entry)
        throw e
      }
    },

    // 탭의 세션과 같은 요청으로 세션을 하나 더 연다 (탭을 Ctrl+클릭, owner 2026-10-17, #257). 돌고 있는 세션이든, 다시
    // 접속하려고 기억해 둔 끝난 세션이든 된다 (그 요청은 그대로 남는다). 새 세션의 id를 돌려준다.
    async duplicate(id, owner, { cols, rows } = {}) {
      const entry = ended.get(id)
      const request = owned(id, owner)?.request ?? (entry && entry.owner === owner ? entry : null)
      if (!request) {
        throw new Error('This terminal can no longer be opened again. Start it from its node.')
      }
      return open(request.kind, request.payload, { owner, cols, rows })
    },

    // 프로그램이 막 끝난 pty는 크기 변경에 예외를 던진다 (node-pty: "Cannot resize a pty that has already exited").
    // 끝났다는 알림(onExit)은 남은 출력을 다 읽은 뒤에야 오므로 그 사이의 요청은 버린다: 여기서 던지면 메인 프로세스의
    // 잡히지 않은 오류가 된다. 쓰기도 같은 이유로 감싼다. 화면은 MAX_WRITE보다 긴 것을 보내지 않고 그렇다고 알린다.
    write(id, owner, data) {
      const session = owned(id, owner)
      if (session && typeof data === 'string' && data.length <= MAX_WRITE) {
        try {
          session.pty.write(data)
        } catch {}
      }
    },

    resize(id, owner, cols, rows) {
      const session = owned(id, owner)
      if (session && isSize(cols) && isSize(rows)) {
        try {
          session.pty.resize(cols, rows)
        } catch {}
      }
    },

    // 탭을 닫으면 세션을 끝내고, 끝난 세션이면 기억해 둔 요청을 잊는다.
    close(id, owner) {
      forget(id, owner)
      const session = owned(id, owner)
      if (session) end(id, session)
    },

    // 창이 닫히거나 새로고침될 때 그 화면의 세션을 모두 끝낸다. 열리는 중인 것은 열지 않게 한다.
    // owner가 없으면 모든 창의 것이다 (앱이 끝날 때).
    closeAll(owner) {
      const isOwned = x => owner === undefined || x.owner === owner
      for (const pending of opening) {
        if (isOwned(pending)) pending.cancelled = true
      }
      for (const [id, entry] of ended) {
        if (isOwned(entry)) ended.delete(id)
      }
      for (const [id, session] of sessions) {
        if (isOwned(session)) end(id, session)
      }
    }
  }
}
