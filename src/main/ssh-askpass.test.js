import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildConnect, buildProxyJump } from './ssh.js'

// 생성된 스크립트를 실제로 실행해서, ssh가 askpass로 물어보는 prompt가 홉별 비밀번호로 올바르게 이어지는지 확인한다.
// (ssh는 SSH_ASKPASS 프로그램을 prompt를 인자로 해서 실행한다.)
const canRun = process.platform !== 'win32' && spawnSync('bash', ['-c', 'true']).status === 0

describe.skipIf(!canRun)('askpass routing (runs the generated script)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jumpspace-askpass-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const hop = (name, extra) => ({ name, user: name, host: `${name}.example.com`, port: '22', ...extra })
  const nodes = [
    hop('keyed', { keyPath: '/keys/a' }), // 비밀번호 없음
    hop('first', { password: "pa'ss \"q\" $x \\ back" }),
    hop('second', { password: 'second-pw' }),
    hop('bare')
  ]

  // 스크립트를 만들어 두고 prompt별로 실행한다. 새 세션(detached)이라 /dev/tty가 없어서 터미널 입력을 기다리며 멈추지 않는다.
  function askpassOf(built, index) {
    const scriptPath = join(dir, `s${index}.sh`)
    writeFileSync(scriptPath, built.script, { mode: 0o700 })
    return prompt => spawnSync('bash', [scriptPath, prompt], {
      env: { ...process.env, ...built.env },
      encoding: 'utf-8',
      detached: true,
      timeout: 10000
    }).stdout
  }

  const paths = { scriptPath: '/nonexistent/script.sh', configPath: '/nonexistent/config' }
  const built = buildProxyJump(nodes, paths)
  const aliases = [...built.config.matchAll(/^Host (\w+)$/gm)].map(x => x[1])
  const ask = askpassOf(built, 0)

  it('answers each hop with its own password (password method)', () => {
    expect(ask(`first@${aliases[1]}'s password: `)).toBe("pa'ss \"q\" $x \\ back\n")
    expect(ask(`second@${aliases[2]}'s password: `)).toBe('second-pw\n')
  })

  it('answers keyboard-interactive password prompts too', () => {
    expect(ask(`(first@${aliases[1]}) Password: `)).toBe("pa'ss \"q\" $x \\ back\n")
    expect(ask(`(second@${aliases[2]}) Password: `)).toBe('second-pw\n')
    expect(ask(`(second@${aliases[2]}) password:`)).toBe('second-pw\n')
  })

  it('never answers with another hop\'s password', () => {
    // 이름이 같아도 별칭(경로)이 다르면 다른 홉이다.
    expect(ask(`second@${aliases[1]}'s password: `)).not.toContain('second-pw')
    expect(ask(`first@${aliases[2]}'s password: `)).not.toContain('pa')
  })

  it('does not answer prompts of hops without a stored password, or other kinds of prompts', () => {
    const others = [
      `keyed@${aliases[0]}'s password: `,
      `bare@${aliases[3]}'s password: `,
      `(bare@${aliases[3]}) Password: `,
      // OTP처럼 "password"라는 단어가 들어 있어도 비밀번호 prompt가 아니면 저장된 비밀번호로 답하지 않는다.
      `(second@${aliases[2]}) One-time password (OATH) for \`second': `,
      `(second@${aliases[2]}) Verification code: `,
      "Enter passphrase for key '/keys/a': ",
      'someone@elsewhere\'s password: '
    ]

    for (const prompt of others) {
      const out = ask(prompt)
      expect(out, prompt).not.toContain('second-pw')
      expect(out, prompt).not.toContain("pa'ss")
    }
  })

  it('answers direct connections by host name', () => {
    const direct = buildConnect(hop('direct', { password: 'direct-pw' }), paths)
    const askDirect = askpassOf(direct, 1)

    expect(askDirect("direct@direct.example.com's password: ")).toBe('direct-pw\n')
    expect(askDirect('(direct@direct.example.com) Password: ')).toBe('direct-pw\n')
  })
})
