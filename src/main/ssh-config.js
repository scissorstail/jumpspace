import { bracketHost, toUnixPath } from './ssh.js'
import { validateForwards, validateNode } from '../shared/validate.js'

function toAlias(node, used) {
  const base = node.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '') || node.host.replace(/[^A-Za-z0-9._-]/g, '-')
  let alias = base
  for (let i = 2; used.has(alias); i += 1) {
    alias = `${base}-${i}`
  }
  used.add(alias)
  return alias
}

// 접속 경로(마지막 node가 목적지)를 ~/.ssh/config 형식의 문자열로 만든다.
// 앞선 node는 ProxyJump로 연결하고, forwards(켜진 것만)는 마지막 node의 LocalForward가 된다. 비밀번호는 포함하지 않는다.
export function buildSshConfig(rawNodes, { forwards = [] } = {}) {
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    throw new Error('Nothing to copy.')
  }

  const nodes = rawNodes.map(x => validateNode(x, { partial: true }))
  const localForwards = validateForwards(forwards, { allowEmpty: true })
  const used = new Set()
  const aliases = nodes.map(x => toAlias(x, used))

  return nodes.map((node, index) => {
    const isLast = index === nodes.length - 1
    // exec는 config의 RemoteCommand에 한 줄로만 표현할 수 있다.
    const canExec = isLast && node.exec && !/[\r\n]/.test(node.exec)

    return [
      `Host ${aliases[index]}`,
      `    HostName ${node.host}`,
      node.user && `    User ${node.user}`,
      node.port && `    Port ${node.port}`,
      node.keyPath && `    IdentityFile "${toUnixPath(node.keyPath).replaceAll('%', '%%')}"`,
      node.keyPath && '    IdentitiesOnly yes',
      index > 0 && `    ProxyJump ${aliases.slice(0, index).join(',')}`,
      canExec && `    RemoteCommand ${node.exec}; exec $SHELL`,
      canExec && '    RequestTTY yes',
      ...(isLast ? localForwards.map(x => `    LocalForward ${x.from} ${bracketHost(x.host)}:${x.to}`) : []),
      node.password && '    # password is not exported'
    ].filter(Boolean).join('\n')
  }).join('\n\n') + '\n'
}
