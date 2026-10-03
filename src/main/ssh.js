import { createHash } from 'node:crypto'
import { validateNode, validateForwards } from '../shared/validate.js'
import { CONNECTED_DATA, CONNECTED_OSC } from '../shared/terminal-marker.js'

// Git Bash에서 실행할 스크립트를 만든다.
// 사용자 입력값은 전부 POSIX single-quote로 감싸서 스크립트 파일에 넣고, 명령어 문자열 인자로는 넘기지 않는다.

export function sq(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

export function toUnixPath(value) {
  return String(value).replaceAll('\\', '/')
}

// IPv6 주소는 -L / LocalForward에서 대괄호로 감싸야 포트와 구분된다.
export function bracketHost(host) {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
}

function md5(value) {
  return createHash('md5').update(value).digest('hex')
}

// "$@"는 앱 안의 터미널에서만 채워지는 옵션이다 (아래 inAppOptions). 스크립트는 인자 없이 실행되므로
// (askpass로 불릴 때는 위에서 이미 끝난다) 그 외에는 비어 있다.
const SSH_BASE = 'ssh -o StrictHostKeyChecking=accept-new "$@"'

// 앱 안의 터미널에 "로그인했다"고 알리는 표시. 화면에 보이지 않는 OSC 문자열이고, 패널(xterm)이 받아서 경로를 초록으로 바꾼다.
// LocalCommand는 서버에 로그인한 뒤 로컬에서 한 번 실행된다. 명령줄 옵션이라 ProxyJump가 띄우는 ssh(-W, 출력이 터널)에는 넘어가지 않는다.
const CONNECTED_COMMAND = `printf '\\033]${CONNECTED_OSC};${CONNECTED_DATA}\\007'`
const inAppOptions = [
  'if [ -n "$JUMPSPACE_IN_APP" ]; then',
  `  set -- -o PermitLocalCommand=yes -o ${sq(`LocalCommand=${CONNECTED_COMMAND}`)}`,
  'else',
  '  set --',
  'fi'
]

// 비밀번호 인증은 SSH_ASKPASS로 처리한다. 비밀번호는 파일에 쓰지 않고 환경변수(JS_PW_n)로만 넘긴다.
// 같은 스크립트가 askpass 역할도 한다. (인자가 있으면 ssh가 prompt를 물어보는 것)
// 이 노드의 비밀번호 prompt에만 답하고, 그 외(키 암호, OTP 등)는 터미널에서 직접 입력받는다.
//
// ssh가 물어보는 비밀번호 prompt는 인증 방식에 따라 형식이 다르다.
//   password             : "user@host's password: "
//   keyboard-interactive : "(user@host) Password: "   (문구는 서버가 정한다)
// host는 ssh에 넘긴 이름이다. 직접 접속이면 node.host, config를 쓰는 경로는 Host 별칭이다.
function askpassPrelude(nodes, promptHosts = nodes.map(x => x.host)) {
  const env = {}
  const cases = []

  nodes.forEach((node, index) => {
    if (node.password) {
      env[`JS_PW_${index}`] = node.password
      const who = `${node.user}@${promptHosts[index]}`
      // OTP처럼 "password"가 들어간 다른 prompt에 잘못 답하지 않도록, 문구가 "Password:"로 시작할 때만 답한다.
      cases.push(`  ${sq(`${who}'s password:`)}*|${sq(`(${who}) `)}[Pp]assword:*) printf '%s\\n' "$JS_PW_${index}" ;;`)
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

// 직접 접속(Connect)에서 노드 하나의 인증에 쓰는 ssh 옵션
function authOptions(node) {
  return [
    // 지정한 키만 사용한다. (ssh-agent의 다른 키를 먼저 시도하다가 "Too many authentication failures"가 나는 것을 막는다)
    node.keyPath && `-i ${sq(toUnixPath(node.keyPath))} -o IdentitiesOnly=yes`,
    // 틀린 비밀번호로 여러 번 시도해서 계정이 잠기는 일을 막는다.
    node.password && '-o NumberOfPasswordPrompts=1',
    // 비밀번호만 쓰는 노드는 키 인증을 시도하지 않는다.
    node.password && !node.keyPath && '-o PubkeyAuthentication=no'
  ].filter(Boolean)
}

function wrap({ prelude = [], lines, cleanupPaths, env = {} }) {
  const script = [
    '#!/bin/bash',
    ...prelude,
    // 지우는 동안 오는 신호는 무시한다: 탭을 닫으면 SIGHUP이 여러 번 와서, 정리 중에 trap(exit)이 끼어들거나 rm이 죽었다.
    // 무시한 신호는 rm 같은 자식에도 그대로 이어진다.
    `cleanup() { trap '' HUP INT TERM; rm -f -- ${cleanupPaths.map(sq).join(' ')}; }`,
    'trap cleanup EXIT',
    // 창이나 탭을 닫으면(HUP), 끝내라는 요청(TERM)이면 남은 명령을 실행하지 않고 끝낸다. (파일은 EXIT trap이 지운다)
    "trap 'exit 129' HUP",
    "trap 'exit 143' TERM",
    ...inAppOptions,
    ...lines,
    'rc=$?',
    // ssh 자체의 오류(255)는 창이 바로 닫히면 확인할 수 없으므로 잠시 멈춘다.
    // 앱 안의 터미널(JUMPSPACE_IN_APP)은 끝난 뒤에도 탭이 남으므로 멈추지 않고 바로 끝낸다. (멈추면 실패한 접속이 열린 세션처럼 보인다)
    'if [ "$rc" -eq 255 ] && [ -z "$JUMPSPACE_IN_APP" ]; then printf \'\\nssh failed (exit status 255). Press Enter to close.\'; read -r _; fi',
    'exit "$rc"',
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
    ...authOptions(node),
    `-p ${sq(node.port)}`,
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

// 경로(여러 노드)를 ssh config로 만든다. 노드마다 자기 인증(키/비밀번호/둘 다/없음)을 가진다.
// Host 별칭은 "앞선 경로 + 자기 정보"의 해시라서, 같은 앞부분을 공유하는 경로는 같은 별칭(=같은 known_hosts 항목)을 쓴다.
function hostAliases(nodes) {
  const aliases = []
  for (const node of nodes) {
    const pathHash = md5(aliases.join(''))
    aliases.push(md5(pathHash + node.host + node.user + node.port))
  }
  return aliases
}

function hostConfig(nodes, aliases) {
  return nodes.map((node, index) => [
    `Host ${aliases[index]}`,
    `HostName ${node.host}`,
    `HostKeyAlias ${aliases[index]}`,
    'StrictHostKeyChecking accept-new',
    `User ${node.user}`,
    `Port ${node.port}`,
    ...(node.keyPath ? [`IdentityFile "${toUnixPath(node.keyPath).replaceAll('%', '%%')}"`, 'IdentitiesOnly yes'] : []),
    ...(node.password ? ['NumberOfPasswordPrompts 1'] : []),
    ...(node.password && !node.keyPath ? ['PubkeyAuthentication no'] : [])
  ].join('\n') + '\n').join('\n') + '\n'
}

// 포트포워딩. via의 마지막 노드에 ssh로 접속하고(앞의 노드들은 ProxyJump로 거친다), 그 서버에서 바라본 host:port로 연결한다.
//   via: ssh로 거치는 노드들(순서대로, 1개 이상). 노드마다 자기 인증을 쓴다.
//   forwards: [{ checked, from, host, to }] 켜진 항목만 사용한다. host가 비어 있으면 접속한 서버 자신(localhost)이다.
export function buildForward({ via, forwards }, { scriptPath, configPath }) {
  if (!Array.isArray(via) || via.length === 0) {
    throw new Error('Forward needs at least one node to connect through.')
  }

  const hops = via.map(x => validateNode(x))
  const list = validateForwards(forwards)

  const aliases = hostAliases(hops)
  const config = hostConfig(hops, aliases)
  const jumps = aliases.slice(0, -1).join(',')

  const ssh = [
    SSH_BASE,
    `-F ${sq(configPath)}`,
    jumps && `-J ${sq(jumps)}`,
    '-N',
    // 로컬 포트가 이미 사용 중이면 조용히 무시하지 않고 오류로 끝낸다.
    '-o ExitOnForwardFailure=yes',
    ...list.map(x => `-L ${sq(`localhost:${x.from}:${bracketHost(x.host)}:${x.to}`)}`),
    '--',
    sq(aliases[aliases.length - 1])
  ].filter(Boolean).join(' ')

  const server = hops[hops.length - 1]

  return {
    ...wrap({
      ...askpassPrelude(hops, aliases),
      lines: [
        banner(
          'Forward...',
          `localhost -> ${hops.map(x => `${x.user}@${x.host}:${x.port} (${x.name})`).join(' -> ')}`,
          ...list.map(x => `localhost:${x.from} -> ${x.host}:${x.to}  (as seen from ${server.name || server.host})`),
          ''
        ),
        ssh
      ],
      cleanupPaths: [scriptPath, configPath]
    }),
    config
  }
}

// ProxyJump는 노드마다 인증이 다를 수 있어서 임시 ssh config 파일을 함께 만든다.
export function buildProxyJump(rawNodes, { scriptPath, configPath }) {
  if (!Array.isArray(rawNodes) || rawNodes.length < 2) {
    throw new Error('ProxyJump needs at least two nodes.')
  }

  const nodes = rawNodes.map(x => validateNode(x))
  const aliases = hostAliases(nodes)
  const config = hostConfig(nodes, aliases)
  const last = nodes[nodes.length - 1]

  const ssh = [
    SSH_BASE,
    `-F ${sq(configPath)}`,
    `-J ${sq(aliases.slice(0, -1).join(','))}`,
    last.exec && '-tt',
    '--',
    sq(aliases[aliases.length - 1]),
    last.exec && sq(`${last.exec}; exec $SHELL`)
  ].filter(Boolean).join(' ')

  return {
    ...wrap({
      ...askpassPrelude(nodes, aliases),
      lines: [banner('ProxyJump...', ...nodes.map(x => `>>> ${x.host}:${x.port} (${x.name})`), ''), ssh],
      cleanupPaths: [scriptPath, configPath]
    }),
    config
  }
}
