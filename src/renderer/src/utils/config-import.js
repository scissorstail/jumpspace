// SSH config에서 읽은 것(src/shared/ssh-config-parse.js의 parseSshConfig)을 캔버스에 더할 노드와 연결로 바꾼다 (순수 함수).
// 캔버스 메뉴의 "From SSH config" 창이 붙여 넣은 글을 읽을 때마다 부르고, 그 결과를 보여준 뒤 그대로 만든다.

import { MAX_CONFIG_HOSTS } from '../../../shared/ssh-config-parse.js'
import { validateForwards, validateNode } from '../../../shared/validate.js'
import { hopKey } from './terminal-sessions.js'

// config에 Port가 없으면 ssh는 22번으로 접속한다. 노드는 포트가 비어 있으면 접속할 수 없고(utils/forward.js의 isRoutable),
// 경로 안에서는 "ssh로 접속하지 않는 포워딩 대상"이라는 다른 뜻이 된다. 그래서 글에 없는 값 중 이것만 ssh의 기본값으로 채운다.
export const DEFAULT_SSH_PORT = '22'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

// 노드에 넣을 값. 글에 있는 값만 넣는다: 없는 값은 키도 없어서 노드에서 비어 있다.
function nodeData(host) {
  const data = { name: host.name, host: host.host, port: host.port || DEFAULT_SSH_PORT }
  for (const key of ['user', 'keyPath', 'exec']) {
    if (host[key]) data[key] = host[key]
  }
  // config에 적힌 포워딩은 켜져 있는 것이다
  if (host.forwards?.length) data.forwards = host.forwards.map(x => ({ checked: true, from: x.from, host: x.host, to: x.to }))

  return data
}

// 접속할 때 거절될 값이 있으면 그 이유. 노드는 그대로 만든다: 노드 설정에서 같은 규칙으로 표시되고 고칠 수 있다.
function problemOf(data) {
  try {
    validateNode(data, { partial: true })
    validateForwards(data.forwards || [], { allowEmpty: true })
    return ''
  } catch (e) {
    return e.message
  }
}

// ProxyJump를 연결로 바꾼다. 노드의 입력은 하나라서 노드마다 앞 노드는 하나뿐이다.
// "ProxyJump a,b"인 c는 a -> b -> c로 간다. 먼저 묶음마다 자기 바로 앞(마지막 jump)을 잇고, 그다음 목록의 앞쪽을 잇는다:
// 앞쪽(a -> b)은 b의 묶음이 달리 말하지 않을 때에만 이어진다.
function linkJumps(hosts) {
  const indexOf = new Map(hosts.map((host, index) => [host.name, index]))
  const before = hosts.map(() => null)
  const leadsTo = (from, to) => {
    for (let at = from; at !== null; at = before[at]) {
      if (at === to) return true
    }
    return false
  }
  // 이미 다른 노드가 앞에 있거나, 이으면 돌아오는 길이 생기면 잇지 않는다
  const link = (from, to) => {
    if (before[to] === from) return true
    if (before[to] !== null || leadsTo(from, to)) return false
    before[to] = from
    return true
  }

  // 묶음마다 그 경로의 이웃한 쌍들 [[앞, 다음]]. 글에 없는 이름이 낀 쌍은 null이다.
  const broken = new Set()
  const pairs = hosts.map(host => [...host.jumps, host.name]
    .map(name => indexOf.get(name))
    .map((to, i, path) => (i > 0 && path[i - 1] !== undefined && to !== undefined ? [path[i - 1], to] : null))
    .slice(1))

  // 자기 바로 앞을 먼저
  pairs.forEach((list, index) => {
    const own = list[list.length - 1]
    if (own && !link(...own)) broken.add(index)
  })
  pairs.forEach((list, index) => {
    for (const pair of list.slice(0, -1)) {
      if (pair && !link(...pair)) broken.add(index)
    }
  })

  const notes = []
  hosts.forEach((host, index) => {
    const missing = host.jumps.filter(name => !indexOf.has(name))
    if (missing.length) {
      notes.push(`${host.name}: ProxyJump through ${missing.join(', ')}, not a Host in this text. That connection is not made.`)
    } else if (broken.has(index)) {
      notes.push(`${host.name}: ProxyJump ${host.jumps.join(',')} does not fit the connections of the other blocks. It is connected as far as it fits.`)
    }
  })

  return { before, notes }
}

// parsed: parseSshConfig의 결과 { hosts, ignored, skipped, over }
// 반환:
//   nodes: [노드의 connection 값] (hosts와 같은 순서)
//   links: [[앞 노드의 번호, 다음 노드의 번호]]
//   rows:  창에 보여줄 줄 [{ name, target: 'user@host:port', after: 앞 노드의 이름 또는 '', extras: ['key', ...], problem }]
//   notes: 만들지 않거나 넣지 않은 것에 대한 설명
export function importPlan(parsed) {
  const { hosts = [], ignored = [], skipped = 0, over = 0 } = parsed || {}
  const nodes = hosts.map(nodeData)
  const { before, notes } = linkJumps(hosts)

  const rows = nodes.map((data, index) => ({
    name: data.name,
    target: `${data.user ? `${data.user}@` : ''}${data.host}:${data.port}`,
    after: before[index] === null ? '' : nodes[before[index]].name,
    extras: [data.keyPath && 'key', data.exec && 'exec', data.forwards && plural(data.forwards.length, 'forward')].filter(Boolean),
    problem: problemOf(data)
  }))

  // 같은 키워드는 대소문자가 달라도 한 번만 말한다
  const unused = ignored.filter((word, index) => ignored.findIndex(x => x.toLowerCase() === word.toLowerCase()) === index)
  if (unused.length) notes.push(`Not used, a node has no place for it: ${unused.join(', ')}.`)
  if (skipped) notes.push(`${plural(skipped, 'block')} left out: a Host of only patterns (such as *) or a Match is not one server.`)
  if (over) notes.push(`${plural(over, 'more Host block')} left out: at most ${MAX_CONFIG_HOSTS} nodes at a time.`)

  return {
    nodes,
    links: before.map((from, to) => (from === null ? null : [from, to])).filter(Boolean),
    rows,
    notes
  }
}

// 창의 한 줄에서 주소 뒤에 붙는 말: 어느 노드 다음에 이어지는지와, 그 밖에 갖고 있는 것
export function rowDetail(row) {
  return [row.after && `through ${row.after}`, ...row.extras].filter(Boolean).join(', ')
}

// 창에 보여줄 한 줄: 무엇을 만드는지
export function importCount({ nodes, links }) {
  return links.length ? `${plural(nodes.length, 'node')}, ${plural(links.length, 'connection')}` : plural(nodes.length, 'node')
}

// 지나쳐 보이면 만들기 전에 이유를 늘어놓고 묻는다 (owner, 2026-10-15: "너무 지나치다 싶으면 생성하기 전에 사유를 나열하고 물어보기").
// 무엇이 지나친지는 여기서 정했다: 이보다 많은 노드를 한꺼번에 놓으면 다이어그램이 가득 찬다.
export const MANY_CONFIG_NODES = 10
// 이유 하나에 이름을 몇 개까지 적는지
const NAMES_SHOWN = 3

const namesOf = list => (list.length > NAMES_SHOWN ? `${list.slice(0, NAMES_SHOWN).join(', ')} and ${list.length - NAMES_SHOWN} more` : list.join(', '))

// 만들기 전에 물어볼 이유들. 빈 목록이면 묻지 않고 만든다.
//   plan: importPlan의 결과, parsed: parseSshConfig의 결과 (한도로 빠진 묶음의 수 over),
//   existing: 이 다이어그램에 이미 있는 노드들의 user@host:port (utils/terminal-sessions.js의 hopKey)
// 이미 있는 노드는 user, host, port가 모두 같아야 같다: User가 없는 블록(@host:22)은 root@host:22와 다르다.
// 물을 이유가 아닌 것: 쓰지 않은 키워드, 서버 하나가 아닌 묶음(Host *, Match), 잇지 못한 ProxyJump(창의 notes가 이미 말한다),
// 같은 글 안에서 한 서버를 가리키는 두 묶음(별칭: 글이 그렇게 적었다).
export function importConcerns(plan, parsed, existing = []) {
  const { nodes = [], rows = [] } = plan || {}
  const reasons = []

  if (nodes.length > MANY_CONFIG_NODES) reasons.push(`${plural(nodes.length, 'node')} at once: more than ${MANY_CONFIG_NODES} fill the diagram.`)
  if (parsed?.over) reasons.push(`${plural(parsed.over, 'more Host block')} left out: at most ${MAX_CONFIG_HOSTS} at a time.`)

  const refused = rows.filter(row => row.problem).map(row => row.name)
  if (refused.length) reasons.push(`${plural(refused.length, 'node')} with a value ssh would refuse: ${namesOf(refused)}.`)

  const there = new Set(existing)
  const twice = nodes.filter(data => there.has(hopKey(data))).map(data => data.name)
  if (twice.length) reasons.push(`${plural(twice.length, 'node')} already in this diagram (same user, host and port): ${namesOf(twice)}.`)

  return reasons
}
