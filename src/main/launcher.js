import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildConnect, buildForward, buildProxyJump, toUnixPath } from './ssh.js'

const STALE_MS = 24 * 60 * 60 * 1000

// %ProgramFiles% 같은 Windows 환경변수 표기를 펼친다. (예전에는 cmd.exe가 대신 해줬다)
export function expandEnv(value, env = process.env) {
  return String(value).replace(/%([^%]+)%/g, (match, name) => env[name] ?? match)
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

export async function launch(kind, payload, { tempDir, gitBashPath }) {
  const bash = expandEnv(gitBashPath || '')
  if (!bash || !existsSync(bash)) {
    throw new Error(`Git Bash was not found: ${bash || '(not set)'}\nCheck "Git Bash path" in Settings.`)
  }

  await mkdir(tempDir, { recursive: true })

  const id = randomBytes(8).toString('hex')
  const scriptFile = join(tempDir, `${id}.sh`)
  const configFile = join(tempDir, `${id}.jmp`)
  const paths = { scriptPath: toUnixPath(scriptFile), configPath: toUnixPath(configFile) }
  assertSafePath(paths.scriptPath)

  let script
  let config = null
  if (kind === 'connect') {
    script = buildConnect(payload, paths)
  } else if (kind === 'forward') {
    script = buildForward(payload, paths)
  } else if (kind === 'proxyJump') {
    ({ script, config } = buildProxyJump(payload, paths))
  } else {
    throw new Error(`Unknown command: ${kind}`)
  }

  await writeFile(scriptFile, script, { encoding: 'utf-8', mode: 0o600 })
  if (config) {
    await writeFile(configFile, config, { encoding: 'utf-8', mode: 0o600 })
  }

  try {
    const child = spawn(bash, ['-c', `bash '${paths.scriptPath}'`], {
      detached: true,
      stdio: 'ignore'
    })
    await waitForSpawn(child)
    child.unref()
  } catch (e) {
    await rm(scriptFile, { force: true })
    await rm(configFile, { force: true })
    throw e
  }
}
