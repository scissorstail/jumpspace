// 포트포워딩 화면 로직 (순수 함수). 노드 하나와 그 앞에 연결된 노드들(prevs)로부터
// "어떤 경로로 포워딩할 수 있는지"를 판단한다. 실제 ssh 명령은 main 프로세스가 검증해서 만든다.
//
// 포워딩 방식은 두 가지다.
//   'self'   : 이 노드에 ssh로 접속하고(앞 노드들은 ProxyJump로 거친다), 그 서버에서 바라본 host:port로 연결한다.
//              user/host/port가 모두 있는 노드. 대상 host를 비우면 localhost(= 이 노드 자신)이다.
//   'target' : (이전 버전 방식) 이 노드는 포워딩 "대상"일 뿐 ssh로 접속하지 않는다. 앞 노드에 접속해서 이 노드의 host로 연결한다.
//              port를 비워 둔 노드. 대상 host를 비우면 이 노드의 host이다.

import { DEFAULT_FORWARD_HOST } from '../../../shared/validate.js'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

// ssh로 접속하는 데 필요한 정보(user/host/port)가 모두 있는가
export function isRoutable(node) {
  return Boolean(node && node.user && node.host && node.port)
}

// 입력한 포트 값의 상태. 잘못된 값일 때만 false를 돌려주고(오류만 표시한다), 그 외에는 null이다.
// 비어 있는 값은 required일 때만 잘못된 값으로 본다.
export function portState(value, required = false) {
  if (!value) return required ? false : null
  return /^\d{1,5}$/.test(value) && Number(value) >= 1 && Number(value) <= 65535 ? null : false
}

// 저장된 포워딩 항목을 { checked, from, host, to } 형태로 맞춘다. (host는 이전 버전에는 없었다)
export function normalizeForward(entry) {
  return {
    checked: Boolean(entry?.checked),
    from: entry?.from ?? null,
    host: entry?.host ?? null,
    to: entry?.to ?? null
  }
}

export function activeForwards(forwards) {
  return (forwards || []).filter(x => x.checked)
}

// 이 노드에서 포워딩을 어떻게 열 수 있는지 판단한다.
//   mode: 'self' | 'target' | null(열 수 없음)
//   via: ssh로 거칠 노드들(마지막 노드에 접속한다)
//   defaultHost: 대상 host를 비웠을 때 쓰는 값
//   reason: 열 수 없을 때의 이유
export function forwardPlan(node, prevs) {
  const chain = prevs || []
  const chainReady = chain.every(isRoutable)
  const chainReason = 'Every previous node needs a user, host and port.'

  if (isRoutable(node)) {
    return chainReady
      ? { mode: 'self', via: [...chain, node], defaultHost: DEFAULT_FORWARD_HOST, reason: null }
      : { mode: null, via: [], defaultHost: DEFAULT_FORWARD_HOST, reason: chainReason }
  }

  if (chain.length === 0) {
    return { mode: null, via: [], defaultHost: DEFAULT_FORWARD_HOST, reason: 'Enter a user, host and port to forward through this node.' }
  }
  if (!node?.host) {
    return { mode: null, via: [], defaultHost: DEFAULT_FORWARD_HOST, reason: 'Enter the host to forward to.' }
  }
  if (!chainReady) {
    return { mode: null, via: [], defaultHost: node.host, reason: chainReason }
  }

  return { mode: 'target', via: chain, defaultHost: node.host, reason: null }
}

// 포워딩 창 위쪽에 보여줄 한 줄 설명
export function forwardHint(plan, node) {
  if (plan.mode === 'self') {
    const previous = plan.via.length - 1
    return `Opens tunnels through ${node.user}@${node.host}${previous > 0 ? `, via ${plural(previous, 'previous node')}` : ''}.`
  }
  if (plan.mode === 'target') {
    return `This node has no SSH login (no user/port), so tunnels open to ${node.host} through ${plural(plan.via.length, 'previous node')}.`
  }
  return plan.reason
}

// 실행 요청에 넘길 항목. 대상 host를 비운 항목은 이 방식의 기본값으로 채운다.
export function forwardEntries(forwards, plan) {
  return (forwards || []).map(x => ({
    checked: Boolean(x.checked),
    from: x.from,
    host: (x.host || '').trim() || plan.defaultHost,
    to: x.to
  }))
}

// 노드 아래에 보여줄 요약. 켜진 포워딩이 없으면 null.
//   first: 첫 포워딩 (길면 화면에서 말줄임), more: 나머지 개수 ("+2", 없으면 ''), 따로 두어서 잘리지 않게 한다.
//   show: 포트와 host를 화면에 내는 방법. 노드 정보를 숨긴 동안에는 가린 글자를 돌려주는 함수를 넘긴다 (utils/mask.js).
export function forwardSummary(forwards, plan, show = x => x) {
  const active = activeForwards(forwards)
  if (active.length === 0) return null

  const describe = x => `:${show(x.from || '?')} → ${show((x.host || '').trim() || plan.defaultHost)}:${show(x.to || '?')}`
  const first = describe(active[0])
  const more = active.length > 1 ? `+${active.length - 1}` : ''

  return {
    first,
    more,
    text: more ? `${first} (${more})` : first,
    title: active.map(describe).join('\n')
  }
}

// "Copy SSH config"에 넘길 내용. 포워딩은 ssh로 접속하는 마지막 노드의 LocalForward가 된다.
export function configRequest(node, prevs, forwards, plan) {
  const chain = prevs || []
  const entries = forwardEntries(activeForwards(forwards), plan)

  if (plan.mode === 'target') {
    // 이 노드는 접속 대상이 아니므로 앞 노드까지만 복사하고, 이 노드의 host를 대상으로 하는 LocalForward를 붙인다.
    return { nodes: chain, forwards: entries }
  }

  return { nodes: [...chain, node], forwards: plan.mode === 'self' ? entries : [] }
}
