import { spawn as nodeSpawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { rmSync, statSync } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildConnect, buildForward, buildProxyJump, toUnixPath } from './ssh.js'

const STALE_MS = 24 * 60 * 60 * 1000

// %ProgramFiles% 같은 Windows 환경변수 표기를 펼친다. (예전에는 cmd.exe가 대신 해줬다)
export function expandEnv(value, env = process.env) {
  return String(value).replace(/%([^%]+)%/g, (match, name) => env[name] ?? match)
}

// 실행할 수 있는 파일이 거기 있는가. 폴더도 있는 것이지만 실행되지 않는다: 설정에 Git을 설치한 폴더를 넣으면
// "spawn ... ENOENT"나 "File not found"만 보이고 설정을 고치라는 말이 없었다 (#227).
export function isFile(path) {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false
}

// 스크립트 경로는 bash -c 인자 안에서 single-quote로 감싸 넘기므로 따옴표가 있으면 안전하게 넘길 수 없다.
function assertSafePath(path) {
  if (/['"%]/.test(path)) {
    throw new Error(`The temp directory path contains unsupported characters: ${path}`)
  }
}

export async function sweepTempDir(tempDir, now = Date.now()) {
  let names
  try {
    names = await readdir(tempDir)
  } catch {
    return
  }

  await Promise.all(names
    .filter(name => /\.(sh|jmp)$/.test(name))
    .map(async name => {
      const file = join(tempDir, name)
      try {
        if (now - (await stat(file)).mtimeMs > STALE_MS) {
          await rm(file, { force: true })
        }
      } catch {}
    }))
}

function waitForSpawn(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('spawn', resolve)
  })
}

// 요청을 검증하고 스크립트(와 필요하면 ssh config)를 만든다. 파일은 write()를 부를 때 쓴다.
// kind: 'connect' | 'forward' | 'proxyJump'. payload는 kind별 요청 내용(ssh.js의 빌더 참고)이다.
export function prepareSession(kind, payload, { tempDir }) {
  const builders = { connect: buildConnect, forward: buildForward, proxyJump: buildProxyJump }
  if (!Object.hasOwn(builders, kind)) {
    throw new Error(`Unknown command: ${kind}`)
  }

  const id = randomBytes(8).toString('hex')
  const scriptFile = join(tempDir, `${id}.sh`)
  const configFile = join(tempDir, `${id}.jmp`)
  const paths = { scriptPath: toUnixPath(scriptFile), configPath: toUnixPath(configFile) }
  assertSafePath(paths.scriptPath)

  // 입력 검증도 여기서 끝난다. 잘못된 요청이면 디스크에 아무것도 만들지 않는다.
  const { script, config, env } = builders[kind](payload, paths)

  return {
    scriptPath: paths.scriptPath,
    env,
    async write() {
      await mkdir(tempDir, { recursive: true })

      // 이 스크립트는 ssh의 SSH_ASKPASS로도 실행되므로 실행 권한이 필요하다.
      await writeFile(scriptFile, script, { encoding: 'utf-8', mode: 0o700 })
      if (config) {
        await writeFile(configFile, config, { encoding: 'utf-8', mode: 0o600 })
      }
    },
    // 기다리지 않고 지운다: 세션을 끝내는 쪽(terminal.js)은 앱이 끝나는 중일 수도 있다. 지우지 못한 파일(다른 프로그램이
    // 잡고 있다)은 두고 간다: 하루가 지나면 sweepTempDir이 치운다.
    cleanup() {
      for (const file of [scriptFile, configFile]) {
        try {
          rmSync(file, { force: true })
        } catch {}
      }
    }
  }
}

// Git Bash 창(mintty)을 새로 띄워서 실행한다. spawn은 테스트에서 바꿀 수 있게 열어 둔다.
export async function launch(kind, payload, { tempDir, gitBashPath, spawn = nodeSpawn }) {
  const session = prepareSession(kind, payload, { tempDir })

  const bash = expandEnv(gitBashPath || '')
  if (!bash || !isFile(bash)) {
    throw new Error(`Git Bash was not found: ${bash || '(not set)'}\nCheck "Git Bash path" in Settings.`)
  }

  await session.write()

  try {
    const child = spawn(bash, ['-c', `bash '${session.scriptPath}'`], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, ...session.env }
    })
    await waitForSpawn(child)
    child.unref()
  } catch (e) {
    session.cleanup()
    throw e
  }
}
