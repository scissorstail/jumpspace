// SSH 실행에 쓰이는 입력값 검증. 렌더러(=저장/import된 JSON)에서 넘어오는 값은 신뢰하지 않는다.

const USER_RE = /^[A-Za-z0-9._@\\][A-Za-z0-9._@\\-]{0,127}$/
const HOST_RE = /^[A-Za-z0-9._:%[\]][A-Za-z0-9._:%[\]-]{0,254}$/
// 검사(test)용과 치환(replace)용을 나눈다. g 플래그가 붙은 정규식으로 test()를 하면 lastIndex가 남아서
// 이전 호출에서 거부한 값의 위치 때문에 다음 값의 제어문자를 놓칠 수 있다.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/
// eslint-disable-next-line no-control-regex
const CONTROL_ALL_RE = /[\u0000-\u001f\u007f]/g

// 포워딩 대상 host를 비웠을 때 쓰는 값. (접속한 서버 자신)
export const DEFAULT_FORWARD_HOST = 'localhost'

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

export function validateHost(value, label = 'host') {
  const host = str(value)
  if (!HOST_RE.test(host)) {
    throw new Error(`Invalid ${label}: "${host}"`)
  }
  return host
}

export function validateKeyPath(value) {
  const keyPath = str(value)
  if (!keyPath) {
    return ''
  }
  if (keyPath.length > 1024 || CONTROL_RE.test(keyPath) || keyPath.includes('"')) {
    throw new Error('Invalid key path.')
  }
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
  return str(value).replace(CONTROL_ALL_RE, ' ').slice(0, 200)
}

// 비밀번호는 그대로 사용한다. (trim하지 않는다) 줄바꿈이 있으면 prompt 응답이 잘리므로 막는다.
export function validatePassword(value) {
  if (value === undefined || value === null || value === '') {
    return ''
  }
  // eslint-disable-next-line no-control-regex
  if (typeof value !== 'string' || value.length > 1024 || /[\u0000\r\n]/.test(value)) {
    throw new Error('Invalid password.')
  }
  return value
}

// partial: 입력 중인 값도 허용한다. (host만 필수)
// 인증은 필수가 아니다. 키도 비밀번호도 없으면 ssh-agent나 기본 키, 터미널 입력으로 진행된다.
export function validateNode(node, { partial = false } = {}) {
  if (!node || typeof node !== 'object') {
    throw new Error('Invalid connection data.')
  }

  return {
    name: sanitizeName(node.name),
    user: partial && !str(node.user) ? '' : validateUser(node.user),
    host: validateHost(node.host),
    port: partial && !str(node.port) ? '' : validatePort(node.port),
    keyPath: validateKeyPath(node.keyPath),
    password: validatePassword(node.password),
    exec: validateExec(node.exec)
  }
}

// 포워딩 항목 { checked, from, host, to } 중 켜진(checked) 것만 검증해서 { from, host, to } 목록으로 돌려준다.
//   from: 이 컴퓨터에서 열 포트, host/to: 접속한 서버에서 바라본 대상 주소. host를 비우면 localhost(= 접속한 서버 자신)이다.
// 오류 메시지의 번호는 화면에 보이는 목록의 순서(1부터)와 같다.
export function validateForwards(forwards, { allowEmpty = false } = {}) {
  if (!Array.isArray(forwards)) {
    throw new Error('Invalid forward list.')
  }

  const list = []
  forwards.forEach((x, index) => {
    if (!x || !x.checked) return

    const n = index + 1
    list.push({
      from: validatePort(x.from, `Local port (forward ${n})`),
      host: str(x.host) ? validateHost(x.host, `target host (forward ${n})`) : DEFAULT_FORWARD_HOST,
      to: validatePort(x.to, `Target port (forward ${n})`)
    })
  })

  // 같은 로컬 포트를 두 번 열 수 없다.
  const ports = new Set()
  for (const { from } of list) {
    if (ports.has(from)) {
      throw new Error(`Local port ${from} is used by more than one forward.`)
    }
    ports.add(from)
  }

  if (list.length === 0 && !allowEmpty) {
    throw new Error('No forward is selected.')
  }

  return list
}
