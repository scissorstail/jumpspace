import { createHash } from 'node:crypto'
import { validateNode, validateForwards } from './validate.js'

// Git Bash에서 실행할 스크립트를 만든다.
// 사용자 입력값은 전부 POSIX single-quote로 감싸서 스크립트 파일에 넣고, 명령어 문자열 인자로는 넘기지 않는다.

export function sq(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

export function toUnixPath(value) {
  return String(value).replaceAll('\\', '/')
}

function md5(value) {
  return createHash('md5').update(value).digest('hex')
}

const SSH_BASE = 'ssh -o StrictHostKeyChecking=accept-new'

// 비밀번호 인증은 SSH_ASKPASS로 처리한다. 비밀번호는 파일에 쓰지 않고 환경변수(JS_PW_n)로만 넘긴다.
// 같은 스크립트가 askpass 역할도 한다. (인자가 있으면 ssh가 prompt를 물어보는 것)
// 비밀번호 prompt("user@host's password:")에만 답하고, 그 외(키 암호 등)는 터미널에서 직접 입력받는다.
//
// prompt에 표시되는 호스트는 ssh에 넘긴 이름이다. 직접 접속이면 node.host, ProxyJump는 config의 Host 별칭이다.
function askpassPrelude(nodes, promptHosts = nodes.map(x => x.host)) {
  const env = {}
  const cases = []

  nodes.forEach((node, index) => {
    if (node.password) {
      env[`JS_PW_${index}`] = node.password
      cases.push(`  ${sq(`${node.user}@${promptHosts[index]}'s password:`)}*) printf '%s\\n' "$JS_PW_${index}" ;;`)
    }
  })

  if (cases.length === 0) {
    return { prelude: [], env }
  }

  return {
    env,
    prelude: [
      'if [ "$#" -gt 0 ]; then',
      '  case "$1" in',
      ...cases,
      "  *) printf '%s' \"$1\" > /dev/tty; IFS= read -r -s answer < /dev/tty; printf '\\n' > /dev/tty; printf '%s\\n' \"$answer\" ;;",
      '  esac',
      '  exit 0',
      'fi',
      'export SSH_ASKPASS="$0" SSH_ASKPASS_REQUIRE=force'
    ]
  }
}

function passwordOptions(node) {
  if (!node.password) return []
  // 틀린 비밀번호로 여러 번 시도해서 계정이 잠기는 일을 막는다.
  return ['-o NumberOfPasswordPrompts=1', ...(node.keyPath ? [] : ['-o PubkeyAuthentication=no'])]
}

function wrap({ prelude = [], lines, cleanupPaths, env = {} }) {
  const script = [
    '#!/bin/bash',
    ...prelude,
    `cleanup() { rm -f -- ${cleanupPaths.map(sq).join(' ')}; }`,
    'trap cleanup EXIT HUP TERM',
    ...lines,
    'rc=$?',
    // ssh 자체의 오류(255)는 창이 바로 닫히면 확인할 수 없으므로 잠시 멈춘다.
    'if [ "$rc" -eq 255 ]; then printf \'\\nssh failed (exit status 255). Press Enter to close.\'; read -r _; fi',
    ''
  ].join('\n')

  return { script, config: null, env }
}

function banner(...lines) {
  return `printf '%s\\n' ${lines.map(sq).join(' ')}`
}

export function buildConnect(rawNode, { scriptPath }) {
  const node = validateNode(rawNode)
  const dest = `${node.user}@${node.host}`

  const ssh = [
    SSH_BASE,
    node.keyPath && `-i ${sq(toUnixPath(node.keyPath))}`,
    `-p ${sq(node.port)}`,
    ...passwordOptions(node),
    node.exec && '-tt',
    '--',
    sq(dest),
    node.exec && sq(`${node.exec}; exec $SHELL`)
  ].filter(Boolean).join(' ')

  return wrap({
    ...askpassPrelude([node]),
    lines: [banner(`Connect... ${dest}:${node.port} (${node.name})`, ''), ssh],
    cleanupPaths: [scriptPath]
  })
}

export function buildForward({ prev, node, forwards }, { scriptPath }) {
  const prevNode = validateNode(prev, { requireAuth: true })
  const destNode = validateNode(node)
  const list = validateForwards(forwards)

  const remoteHost = `${prevNode.user}@${prevNode.host}`
  const destHost = `${destNode.user}@${destNode.host}`

  const ssh = [
    SSH_BASE,
    prevNode.keyPath && `-i ${sq(toUnixPath(prevNode.keyPath))}`,
    `-p ${sq(prevNode.port)}`,
    ...passwordOptions(prevNode),
    '-N',
    ...list.map(x => `-L ${sq(`localhost:${x.from}:${destNode.host}:${x.to}`)}`),
    '--',
    sq(remoteHost)
  ].filter(Boolean).join(' ')

  return wrap({
    ...askpassPrelude([prevNode]),
    lines: [
      banner(
        'Forward...',
        `localhost -> ${remoteHost}:${prevNode.port} (${prevNode.name}) -> ${destHost} (${destNode.name})`,
        ...list.map(x => `localhost:${x.from} <-> ${prevNode.name} <-> ${destNode.name}:${x.to}`),
        ''
      ),
      ssh
    ],
    cleanupPaths: [scriptPath]
  })
}

// ProxyJump는 노드마다 키가 다를 수 있어서 임시 ssh config 파일을 함께 만든다.
export function buildProxyJump(rawNodes, { scriptPath, configPath }) {
  if (!Array.isArray(rawNodes) || rawNodes.length < 2) {
    throw new Error('ProxyJump needs at least two nodes.')
  }

  const nodes = rawNodes.map(x => validateNode(x))
  const hostHashes = []

  const config = nodes.map(node => {
    const pathHash = md5(hostHashes.join(''))
    const hostHash = md5(pathHash + node.host + node.user + node.port)
    hostHashes.push(hostHash)

    return [
      `Host ${hostHash}`,
      `HostName ${node.host}`,
      `HostKeyAlias ${hostHash}`,
      'StrictHostKeyChecking accept-new',
      `User ${node.user}`,
      `Port ${node.port}`,
      ...(node.keyPath ? [`IdentityFile "${toUnixPath(node.keyPath).replaceAll('%', '%%')}"`] : []),
      ...(node.password ? ['NumberOfPasswordPrompts 1'] : []),
      ...(node.password && !node.keyPath ? ['PubkeyAuthentication no'] : [])
    ].join('\n') + '\n'
  }).join('\n') + '\n'

  const dest = hostHashes[hostHashes.length - 1]
  const jumps = hostHashes.slice(0, -1).join(',')
  const last = nodes[nodes.length - 1]

  const ssh = [
    SSH_BASE,
    `-F ${sq(configPath)}`,
    `-J ${sq(jumps)}`,
    last.exec && '-tt',
    '--',
    sq(dest),
    last.exec && sq(`${last.exec}; exec $SHELL`)
  ].filter(Boolean).join(' ')

  return {
    ...wrap({
      ...askpassPrelude(nodes, hostHashes),
      lines: [banner('ProxyJump...', ...nodes.map(x => `>>> ${x.host}:${x.port} (${x.name})`), ''), ssh],
      cleanupPaths: [scriptPath, configPath]
    }),
    config
  }
}
