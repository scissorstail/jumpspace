// SSH 실행에 쓰이는 입력값 검증. 렌더러(=저장/import된 JSON)에서 넘어오는 값은 신뢰하지 않는다.

const USER_RE = /^[A-Za-z0-9._@\\][A-Za-z0-9._@\\-]{0,127}$/
const HOST_RE = /^[A-Za-z0-9._:%[\]][A-Za-z0-9._:%[\]-]{0,254}$/
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/g

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function validatePort(value, label = 'Port') {
  const text = typeof value === 'number' ? String(value) : str(value)
  if (!/^\d{1,5}$/.test(text) || Number(text) < 1 || Number(text) > 65535) {
    throw new Error(`${label} must be a number between 1 and 65535.`)
  }
  return String(Number(text))
}

export function validateUser(value) {
  const user = str(value)
  if (!USER_RE.test(user)) {
    throw new Error(`Invalid user: "${user}"`)
  }
  return user
}

export function validateHost(value) {
  const host = str(value)
  if (!HOST_RE.test(host)) {
    throw new Error(`Invalid host: "${host}"`)
  }
  return host
}

export function validateKeyPath(value, { required = false } = {}) {
  const keyPath = str(value)
  if (!keyPath) {
    if (required) throw new Error('Key path is required.')
    return ''
  }
  if (keyPath.length > 1024 || CONTROL_RE.test(keyPath) || keyPath.includes('"')) {
    throw new Error('Invalid key path.')
  }
  CONTROL_RE.lastIndex = 0
  return keyPath
}

// 원격에서 실행될 명령어. 사용자가 의도해서 입력하는 값이라 내용은 제한하지 않고 NUL만 막는다.
export function validateExec(value) {
  const exec = typeof value === 'string' ? value.trim() : ''
  if (exec.length > 4096 || exec.includes('\u0000')) {
    throw new Error('Invalid exec command.')
  }
  return exec
}

// 화면 표시(echo)용 이름. 제어문자는 공백으로 바꾼다.
export function sanitizeName(value) {
  return str(value).replace(CONTROL_RE, ' ').slice(0, 200)
}

export function validateNode(node, { requireKey = false } = {}) {
  if (!node || typeof node !== 'object') {
    throw new Error('Invalid connection data.')
  }

  return {
    name: sanitizeName(node.name),
    user: validateUser(node.user),
    host: validateHost(node.host),
    port: validatePort(node.port),
    keyPath: validateKeyPath(node.keyPath, { required: requireKey }),
    exec: validateExec(node.exec)
  }
}

export function validateForwards(forwards) {
  if (!Array.isArray(forwards)) {
    throw new Error('Invalid forward list.')
  }

  const list = forwards
    .filter(x => x && x.checked && x.from && x.to)
    .map(x => ({
      from: validatePort(x.from, 'Forward port'),
      to: validatePort(x.to, 'Forward port')
    }))

  if (list.length === 0) {
    throw new Error('No forward is selected.')
  }

  return list
}
