import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { launch } from './launcher.js'
import { buildConnect, buildForward, buildProxyJump, toUnixPath } from './ssh.js'

// 생성된 스크립트를 실제 bash에서 실행해 본다. ssh는 받은 인자를 기록하고, SSH_ASKPASS를 진짜 ssh처럼 직접 실행하는 가짜로 바꾼다.
//   Linux/macOS: /bin/bash
//   Windows    : Git Bash. JUMPSPACE_TEST_BASH에 bash.exe 경로를 지정한다. (예: C:\Program Files\Git\bin\bash.exe)
// 이 테스트는 스크립트를 "직접 실행"할 수 있는지, 환경변수가 넘어가는지, 인용이 맞는지를 확인한다. (서버 없이)
const BASH = process.env.JUMPSPACE_TEST_BASH || (process.platform === 'win32' ? '' : '/bin/bash')
const canRun = Boolean(BASH) && existsSync(BASH) && spawnSync(BASH, ['-c', 'true']).status === 0

// 환경변수로 bash를 지정했는데 쓸 수 없다면 조용히 건너뛰지 않고 실패시킨다. (CI 설정 실수 방지)
if (process.env.JUMPSPACE_TEST_BASH) {
  it('the bash given in JUMPSPACE_TEST_BASH can be started', () => {
    expect(canRun).toBe(true)
  })
}

const FAKE_SSH = `#!/bin/bash
printf '%s\\0' "$@" > "$FAKE_SSH_OUT.args"
prev=
for a in "$@"; do
  if [ "$prev" = "-F" ]; then cp "$a" "$FAKE_SSH_OUT.config"; fi
  prev=$a
done
if [ -n "$SSH_ASKPASS" ] && [ -n "$FAKE_SSH_PROMPTS" ]; then
  : > "$FAKE_SSH_OUT.answer"
  IFS='|' read -ra prompts <<< "$FAKE_SSH_PROMPTS"
  for prompt in "\${prompts[@]}"; do
    "$SSH_ASKPASS" "$prompt" >> "$FAKE_SSH_OUT.answer"
  done
fi
exit "\${FAKE_SSH_EXIT:-0}"
`

const pathKey = Object.keys(process.env).find(k => k.toLowerCase() === 'path') || 'PATH'
const read = file => (existsSync(file) ? readFileSync(file, 'utf-8') : null)
const aliasesOf = config => [...config.matchAll(/^Host (\w+)$/gm)].map(x => x[1])

const root = mkdtempSync(join(tmpdir(), 'jumpspace-script-'))
const binDir = join(root, 'bin')
mkdirSync(binDir)
writeFileSync(join(binDir, 'ssh'), FAKE_SSH, { mode: 0o755 })
afterAll(() => rmSync(root, { recursive: true, force: true }))

const node = { name: 'web', user: 'deploy', host: 'example.com', port: '22', keyPath: '/keys/a', exec: '' }

let seq = 0
// 실행마다 파일 이름을 나눈다. dir에 공백이 들어간 경로도 쓸 수 있다.
function newRun(dir = root) {
  const id = `run${seq++}`
  return {
    out: join(dir, id),
    paths: { scriptPath: toUnixPath(join(dir, `${id}.sh`)), configPath: toUnixPath(join(dir, `${id}.jmp`)) }
  }
}

function run(built, { out, paths }, { prompts = '', exit = '', input = '' } = {}) {
  writeFileSync(paths.scriptPath, built.script, { mode: 0o700 })
  if (built.config) writeFileSync(paths.configPath, built.config)

  const r = spawnSync(BASH, [paths.scriptPath], {
    cwd: root,
    env: {
      ...process.env,
      ...built.env,
      [pathKey]: `${binDir}${delimiter}${process.env[pathKey]}`,
      FAKE_SSH_OUT: out,
      FAKE_SSH_PROMPTS: prompts,
      FAKE_SSH_EXIT: exit
    },
    encoding: 'utf-8',
    input,
    timeout: 30000
  })

  const args = read(`${out}.args`)
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    args: args === null ? null : args.split('\0').slice(0, -1),
    answers: read(`${out}.answer`),
    config: read(`${out}.config`)
  }
}

// 진짜 OpenSSH(ssh-add)가 SSH_ASKPASS로 지정한 스크립트 "파일"을 직접 실행하는지 확인한다.
// ssh-add는 ssh와 같은 방식(execlp)으로 askpass를 실행한다. 생성되는 스크립트처럼 스크립트가 스스로를 askpass로 지정한다.
// Windows(Git Bash)에서 "셔뱅이 있는 파일을 askpass로 실행할 수 있는가"를 서버 없이 확인하는 방법이다.
const hasOpenSsh = canRun && spawnSync(BASH, ['-c', 'command -v ssh-add && command -v ssh-agent && command -v ssh-keygen']).status === 0

describe.skipIf(!hasOpenSsh)('real OpenSSH runs a script file as SSH_ASKPASS', () => {
  it('ssh-add gets the passphrase from the script that names itself as askpass', () => {
    const script = toUnixPath(join(root, 'askpass-driver.sh'))
    const key = toUnixPath(join(root, 'askpass-key'))
    writeFileSync(script, `#!/bin/bash
# ssh가 prompt를 인자로 주고 실행하면 답을 출력한다. (생성되는 스크립트와 같은 구조)
if [ "$#" -gt 0 ]; then
  printf '%s\\n' 'test pass phrase'
  exit 0
fi
set -e
export SSH_ASKPASS="$0" SSH_ASKPASS_REQUIRE=force
ssh-keygen -q -t ed25519 -N 'test pass phrase' -f '${key}'
eval "$(ssh-agent -s)" > /dev/null
trap 'kill "$SSH_AGENT_PID"' EXIT
ssh-add '${key}' < /dev/null
ssh-add -l
`, { mode: 0o700 })

    const r = spawnSync(BASH, [script], { cwd: root, encoding: 'utf-8', input: '', timeout: 60000 })

    expect(r.stderr).not.toMatch(/Permission denied|exec\(/)
    expect(r.stdout).toMatch(/ED25519/)
    expect(r.status).toBe(0)
  })
})

describe.skipIf(!canRun)('generated scripts run under bash', () => {
  describe('connect', () => {
    it('runs ssh with the expected arguments and removes the script afterwards', () => {
      const r = newRun()
      const result = run(buildConnect(node, r.paths), r)

      expect(result.status).toBe(0)
      expect(result.args).toEqual([
        '-o', 'StrictHostKeyChecking=accept-new',
        '-i', '/keys/a', '-o', 'IdentitiesOnly=yes',
        '-p', '22',
        '--', 'deploy@example.com'
      ])
      expect(existsSync(r.paths.scriptPath)).toBe(false)
      expect(result.stdout).toContain('Connect... deploy@example.com:22 (web)')
    })

    it('keeps hostile values as data', () => {
      const name = "x'; touch PWNED; echo '"
      const exec = "echo 'a b'; touch PWNED2"
      const r = newRun()
      const result = run(buildConnect({ ...node, name, exec }, r.paths), r)

      expect(result.stdout).toContain(`(${name})`)
      // 원격 명령은 인자 하나로 그대로 전달된다. (로컬에서는 실행되지 않는다)
      expect(result.args.slice(-4)).toEqual(['-tt', '--', 'deploy@example.com', `${exec}; exec $SHELL`])
      expect(existsSync(join(root, 'PWNED'))).toBe(false)
      expect(existsSync(join(root, 'PWNED2'))).toBe(false)
    })

    it('exits with the status of ssh, and waits for Enter when ssh itself failed (255)', () => {
      const one = newRun()
      expect(run(buildConnect(node, one.paths), one, { exit: '7' }).status).toBe(7)

      const two = newRun()
      const failed = run(buildConnect(node, two.paths), two, { exit: '255', input: '\n' })
      expect(failed.status).toBe(255)
      expect(failed.stdout).toContain('ssh failed (exit status 255)')
    })

    it('hands the password to ssh through SSH_ASKPASS, which the script itself answers', () => {
      const password = "S3cr'et \"q\" $x \\ end"
      const r = newRun()
      const result = run(buildConnect({ ...node, keyPath: '', password }, r.paths), r, { prompts: "deploy@example.com's password: " })

      expect(result.answers).toBe(`${password}\n`)
      expect(result.args).toContain('PubkeyAuthentication=no')
      // 비밀번호는 명령줄이나 파일에 남지 않는다
      expect(JSON.stringify(result.args)).not.toContain('S3cr')
      expect(existsSync(r.paths.scriptPath)).toBe(false)
    })
  })

  describe('proxyJump', () => {
    const hops = [
      { name: 'jump', user: 'kate', host: 'jump.example.com', port: '22', keyPath: '/keys/j', password: 'pw-one' },
      { name: 'inner', user: 'paul', host: '10.0.0.5', port: '2222', password: 'pw-two', exec: 'uptime' }
    ]

    it('passes the config and answers the prompt of each hop with that hop\'s password', () => {
      const r = newRun()
      const built = buildProxyJump(hops, r.paths)
      const [a1, a2] = aliasesOf(built.config)
      const result = run(built, r, { prompts: `kate@${a1}'s password: |(paul@${a2}) Password: ` })

      expect(result.status).toBe(0)
      expect(result.args).toEqual([
        '-o', 'StrictHostKeyChecking=accept-new',
        '-F', r.paths.configPath, '-J', a1,
        '-tt', '--', a2, 'uptime; exec $SHELL'
      ])
      expect(result.answers).toBe('pw-one\npw-two\n')
      // ssh가 실행되는 동안 config가 있었고, 끝나면 스크립트와 config 모두 지워진다
      expect(result.config).toBe(built.config)
      expect(existsSync(r.paths.scriptPath)).toBe(false)
      expect(existsSync(r.paths.configPath)).toBe(false)
    })
  })

  describe('forward', () => {
    it('opens the tunnels through the whole chain', () => {
      const r = newRun()
      const built = buildForward({
        via: [node, { ...node, name: 'inner', host: 'inner.example.com' }],
        forwards: [{ checked: true, from: '8080', host: 'db.internal', to: '5432' }, { checked: true, from: '9090', to: '80' }]
      }, r.paths)
      const [a1, a2] = aliasesOf(built.config)
      const result = run(built, r)

      expect(result.args).toEqual([
        '-o', 'StrictHostKeyChecking=accept-new',
        '-F', r.paths.configPath, '-J', a1,
        '-N', '-o', 'ExitOnForwardFailure=yes',
        '-L', 'localhost:8080:db.internal:5432', '-L', 'localhost:9090:localhost:80',
        '--', a2
      ])
      expect(result.stdout).toContain('localhost:8080 -> db.internal:5432')
      expect(existsSync(r.paths.configPath)).toBe(false)
    })
  })

  describe('through launch() (bash -c "bash \'<script>\'", like Git Bash does)', () => {
    async function waitFor(check, ms = 15000) {
      const end = Date.now() + ms
      while (Date.now() < end) {
        const value = check()
        if (value) return value
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return null
    }

    // launch()는 process.env를 그대로 물려주므로, 가짜 ssh가 쓸 값은 여기서 설정한다.
    async function launchAndRead(dirName, payload) {
      const dir = join(root, dirName)
      mkdirSync(dir, { recursive: true })
      const out = join(dir, 'result')
      const saved = { path: process.env[pathKey], out: process.env.FAKE_SSH_OUT }
      process.env[pathKey] = `${binDir}${delimiter}${saved.path}`
      process.env.FAKE_SSH_OUT = out

      try {
        await launch('connect', payload, { tempDir: join(dir, 'tmp'), gitBashPath: BASH })
        const args = await waitFor(() => read(`${out}.args`))
        return args === null ? null : args.split('\0').slice(0, -1)
      } finally {
        process.env[pathKey] = saved.path
        if (saved.out === undefined) delete process.env.FAKE_SSH_OUT
        else process.env.FAKE_SSH_OUT = saved.out
      }
    }

    it('starts the generated script', async () => {
      const args = await launchAndRead('plain', node)
      expect(args).toEqual(expect.arrayContaining(['-p', '22', '--', 'deploy@example.com']))
    })

    // Windows 사용자 이름에 공백이 있는 경우(C:\Users\John Doe\...)를 흉내낸다.
    it('works when the temp directory path contains spaces', async () => {
      const args = await launchAndRead('with space dir', node)
      expect(args).toEqual(expect.arrayContaining(['--', 'deploy@example.com']))
    })
  })
})
