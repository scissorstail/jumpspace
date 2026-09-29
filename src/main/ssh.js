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

function wrap(lines, cleanupPaths) {
  return [
    '#!/bin/bash',
    `cleanup() { rm -f -- ${cleanupPaths.map(sq).join(' ')}; }`,
    'trap cleanup EXIT HUP TERM',
    ...lines,
    'rc=$?',
    // ssh 자체의 오류(255)는 창이 바로 닫히면 확인할 수 없으므로 잠시 멈춘다.
    'if [ "$rc" -eq 255 ]; then printf \'\\nssh failed (exit status 255). Press Enter to close.\'; read -r _; fi',
    ''
  ].join('\n')
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
    node.exec && '-tt',
    '--',
    sq(dest),
    node.exec && sq(`${node.exec}; exec $SHELL`)
  ].filter(Boolean).join(' ')

  return wrap([
    banner(`Connect... ${dest}:${node.port} (${node.name})`, ''),
    ssh
  ], [scriptPath])
}

export function buildForward({ prev, node, forwards }, { scriptPath }) {
  const prevNode = validateNode(prev, { requireKey: true })
  const destNode = validateNode(node)
  const list = validateForwards(forwards)

  const remoteHost = `${prevNode.user}@${prevNode.host}`
  const destHost = `${destNode.user}@${destNode.host}`

  const ssh = [
    SSH_BASE,
    `-i ${sq(toUnixPath(prevNode.keyPath))}`,
    `-p ${sq(prevNode.port)}`,
    '-N',
    ...list.map(x => `-L ${sq(`localhost:${x.from}:${destNode.host}:${x.to}`)}`),
    '--',
    sq(remoteHost)
  ].join(' ')

  return wrap([
    banner(
      'Forward...',
      `localhost -> ${remoteHost}:${prevNode.port} (${prevNode.name}) -> ${destHost} (${destNode.name})`,
      ...list.map(x => `localhost:${x.from} <-> ${prevNode.name} <-> ${destNode.name}:${x.to}`),
      ''
    ),
    ssh
  ], [scriptPath])
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
      ...(node.keyPath ? [`IdentityFile "${toUnixPath(node.keyPath).replaceAll('%', '%%')}"`] : [])
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

  const script = wrap([
    banner('ProxyJump...', ...nodes.map(x => `>>> ${x.host}:${x.port} (${x.name})`), ''),
    ssh
  ], [scriptPath, configPath])

  return { script, config }
}
