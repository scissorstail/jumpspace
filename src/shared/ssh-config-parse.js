// ~/.ssh/config 형식의 글에서 Host 묶음을 읽어, 노드에 넣을 값으로 돌려준다 (캔버스 메뉴의 "From SSH config").
// "Copy SSH config"(src/main/ssh-config.js의 buildSshConfig)가 쓰는 것의 반대 방향이라, 그것이 쓴 글은 그대로 읽힌다.
// 글에 있는 값만 넣는다: 글에 없는 값은 키 자체가 없고, 노드에서는 비어 있거나 기본값이다. 비밀번호는 config에 없다.

// 한 번에 만드는 노드의 수. 긴 config를 통째로 붙여도 캔버스가 노드로 덮이지 않게 한다.
export const MAX_CONFIG_HOSTS = 50

// buildSshConfig는 exec를 "RemoteCommand <exec>; exec $SHELL"로 쓴다 (이 값으로). 읽을 때는 그 꼬리를 뗀다.
export const EXEC_TAIL = '; exec $SHELL'

// 큰따옴표로 감싼 값의 따옴표를 벗긴다
const unquote = value => (value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value)

// 공백으로 나눈다. 큰따옴표 안의 공백에서는 나누지 않는다.
const words = text => (text.match(/"[^"]*"|\S+/g) || []).map(unquote)

// "키워드 값" 또는 "키워드=값". 키워드는 대소문자를 가리지 않는다. 그렇게 읽을 수 없는 줄(빈 줄, # 주석도)은 null.
function parseLine(line) {
  const match = line.match(/^([A-Za-z][A-Za-z0-9]*)(?:\s*=\s*|\s+)(.*)$/)

  return match ? { keyword: match[1].toLowerCase(), written: match[1], value: match[2].trim() } : null
}

// "LocalForward [bind:]port host:hostport" -> { from, host, to }. 그렇게 읽을 수 없으면(유닉스 소켓 등) null.
// 묶는 주소(bind)는 노드의 포워딩에 자리가 없어서 버린다.
function parseForward(value) {
  const [listen, target, ...rest] = words(value)
  if (!listen || !target || rest.length) return null

  const from = listen.slice(listen.lastIndexOf(':') + 1)
  const [, host, to] = target.match(/^\[([^\]]+)\]:(\d+)$/) || target.match(/^([^:]+):(\d+)$/) || []
  if (!/^\d+$/.test(from) || !host) return null

  return { from, host, to }
}

// 반환:
//   hosts:   [{ name, host, user?, port?, keyPath?, exec?, forwards?: [{ from, host, to }], jumps: [이름] }]
//            name은 Host의 첫 이름, host는 HostName(없으면 ssh처럼 그 이름), jumps는 ProxyJump에 적힌 순서 그대로다.
//   ignored: 읽었지만 노드에 넣을 자리가 없는 키워드 (글에 쓰인 그대로, 한 번씩)
//   skipped: 노드로 만들지 않은 묶음의 수 (Host * 처럼 패턴뿐인 것, Match)
//   over:    한도(MAX_CONFIG_HOSTS)를 넘어서 만들지 않은 묶음의 수
export function parseSshConfig(text) {
  const hosts = []
  const ignored = new Set()
  let skipped = 0
  let over = 0
  // 지금 읽는 묶음. 첫 Host 앞이면 null, 건너뛰는 묶음이면 false.
  let current = null

  // 같은 설정이 여러 번 나오면 ssh는 처음 것을 쓴다
  const once = (key, value) => {
    if (value && current[key] === undefined) current[key] = value
  }

  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const parsed = parseLine(raw.trim())
    if (!parsed) continue
    const { keyword, written, value } = parsed

    if (keyword === 'host' || keyword === 'match') {
      // 패턴(*, ?)과 제외(!)는 호스트 하나를 가리키지 않는다
      const name = keyword === 'host' ? words(value).find(x => !/^!|[*?]/.test(x)) : undefined
      const known = name && hosts.find(x => x.name === name)

      if (!name) {
        skipped += 1
        current = false
      } else if (known) {
        // 같은 이름의 묶음이 또 나오면 ssh는 둘을 합쳐서 본다 (먼저 나온 값이 이긴다)
        current = known
      } else if (hosts.length >= MAX_CONFIG_HOSTS) {
        over += 1
        current = false
      } else {
        current = { name }
        hosts.push(current)
      }
      continue
    }

    if (current === false) continue
    // 첫 Host 앞의 설정은 모든 호스트에 걸리는 것이라 노드 하나의 값이 아니다
    if (current === null) {
      ignored.add(written)
      continue
    }

    switch (keyword) {
      case 'hostname':
        once('host', unquote(value))
        break
      case 'user':
        once('user', unquote(value))
        break
      case 'port':
        once('port', unquote(value))
        break
      case 'identityfile':
        // config에서 %는 %%로 쓴다
        once('keyPath', unquote(value).replaceAll('%%', '%'))
        break
      case 'remotecommand':
        once('exec', value.endsWith(EXEC_TAIL) ? value.slice(0, -EXEC_TAIL.length).trim() : value)
        break
      case 'proxyjump':
        if (current.jumps === undefined && value) {
          current.jumps = value.toLowerCase() === 'none' ? [] : value.split(',').map(x => x.trim()).filter(Boolean)
        }
        break
      case 'localforward': {
        const forward = parseForward(value)
        if (forward) (current.forwards ||= []).push(forward)
        else ignored.add(written)
        break
      }
      // buildSshConfig가 키, exec와 함께 쓰는 줄. 노드의 값은 아니지만 알릴 것도 없다.
      case 'identitiesonly':
      case 'requesttty':
        break
      default:
        ignored.add(written)
    }
  }

  for (const host of hosts) {
    host.host ??= host.name
    host.jumps ??= []
  }

  return { hosts, ignored: [...ignored], skipped, over }
}
