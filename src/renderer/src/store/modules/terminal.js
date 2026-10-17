// 앱 안의 터미널 탭 목록. 노드(Rete 안의 Vue)와 하단 패널이 이 store로 주고받는다.
// request에는 접속 요청(비밀번호 포함)이 들어 있다. 패널이 main에 넘긴 뒤 지운다.
// (끝난 탭을 다시 연결할 때와 같은 접속을 하나 더 열 때 쓰는 요청은 main(terminal.js)이 갖고 있고, 여기에는 다시 두지 않는다:
// 하나 더 연 탭의 request는 { duplicateOf: 그 탭의 세션 id }뿐이다)
// hops는 세션이 지나가는 서버들(user@host:port, 경로 순서)이다. 캔버스가 열린 경로의 연결선을 표시하는 데 쓴다.
//
// 터미널은 그것을 연 다이어그램(item)의 것이다. owner는 지금 열려 있는 item의 번호(목록 항목의 index)이고,
// 세션은 만들어질 때의 owner를 갖는다. 패널과 캔버스는 지금 owner의 세션만 보여주고, 다른 item의 세션은
// 뒤에서 계속 돈다. 활성 탭과 패널을 최소화했는지, 최대화했는지, 좌우로 나눴는지는 item마다 기억해 두었다가 돌아오면 되살린다.
//
// 패널은 좌우 두 칸으로 나눌 수 있다 (owner, 2026-10-12). 칸마다 제 탭 줄이 있고 (owner, 2026-10-17), 두 칸에 탭이 하나씩 보인다:
// activeKey(고른 탭, 키 입력을 받는다)와 sideKey(다른 칸의 탭). rightKeys는 오른쪽 칸의 탭들이고, 나머지는 왼쪽 칸의 것이다.
// 나눌 때는 고른 탭의 옆 탭 하나만 오른쪽 칸으로 간다. 탭은 끌어서 다른 칸으로 옮긴다. 한 칸에 탭이 더 없으면 나누기가 끝난다.
// 탭 줄의 순서는 sessions의 순서 하나다: 칸마다 그 칸의 탭을 그 순서대로 보인다. 그래서 합치면 나누기 전의 줄로 돌아간다.
import { activatePane, closePane, hopKey, moveToSide, reorderSessions, restorePanes, sessionsOf, shownPanes, splitPartner } from '../../utils/terminal-sessions'

let nextKey = 1

export default {
  state: {
    sessions: [],
    activeKey: null,
    // 패널이 펼쳐져 있는지. false이면 최소화한 것이다: 탭 줄만 창 아래쪽에 남는다 (세션이 없으면 패널 자체가 없다).
    isPanelOpen: false,
    // 패널을 헤더 바로 아래까지 올렸는지 (최대화). 패널을 최소화해도 남아서, 다시 펼치면 최대화한 채로 돌아온다.
    isPanelMaximized: false,
    // 좌우로 나눈 동안 다른 칸에 보이는 탭 (null이면 나누지 않았다)과, 오른쪽 칸의 탭들
    sideKey: null,
    rightKeys: [],
    owner: null,
    // owner -> { activeKey, isPanelOpen, isPanelMaximized, sideKey, rightKeys }. mutation 안에서만 읽는다.
    remembered: {}
  },
  getters: {
    // 모든 item의 세션 (패널이 화면을 유지하고, 목록이 item별 개수를 세는 데 쓴다)
    allTerminalSessions: state => state.sessions,
    // 지금 열려 있는 item의 세션
    terminalSessions: state => sessionsOf(state.sessions, state.owner),
    activeTerminalKey: state => state.activeKey,
    // 두 칸에 보이는 탭: { left, right } (나누지 않았으면 right는 null)
    terminalPanes: state => shownPanes(state),
    // 좌우로 나눈 동안 다른 칸(고른 탭이 없는 칸)에 보이는 탭. 나누지 않았으면 null.
    terminalSideKey: state => (state.activeKey === null ? null : state.sideKey),
    // 오른쪽 칸의 탭들 (나누지 않았으면 비어 있다)
    terminalRightKeys: state => state.rightKeys,
    isTerminalPanelOpen: state => state.isPanelOpen,
    // 패널이 캔버스 자리까지 차지하고 있는지: 최대화했고, 패널이 펼쳐져 있는 동안만이다 (최소화한 동안은 캔버스가 보인다).
    isTerminalPanelMaximized: state => state.isPanelOpen && state.isPanelMaximized && sessionsOf(state.sessions, state.owner).length > 0
  },
  mutations: {
    terminalAdd(state, { title, kind, payload, route = [] }) {
      const key = nextKey++
      const hops = route.map(hopKey)
      // connected: 로그인 표시를 받았는지 (캔버스의 연결 중/연결됨 구분). busy: 출력이 오가는 중인지 (그 노드의 점이 깜박인다)
      // kind는 요청이 지워진 뒤에도 남는다 (비밀이 없다): 돌고 있는 포워딩 탭은 Ctrl+클릭으로 복사하지 않는다 (#258).
      state.sessions.push({ key, id: null, owner: state.owner, title, kind, hops, status: 'starting', connected: false, busy: false, exitCode: null, request: { kind, payload } })
      // 나눈 동안에는 고른 칸에 열린다: 그 칸의 탭 줄에 들어간다.
      if (state.sideKey !== null && state.rightKeys.includes(state.activeKey)) state.rightKeys = [...state.rightKeys, key]
      state.activeKey = key
      state.isPanelOpen = true
    },
    // 탭 key와 같은 접속을 새 탭에 하나 더 연다 (탭을 Ctrl+클릭, owner 2026-10-17, #257). 새 탭은 그 탭 바로 뒤, 그 탭의 칸의
    // 줄에 들어가고 키 입력을 받는다. 요청은 main이 갖고 있어서 세션의 id만 둔다: main에 세션이 없는 탭이면 아무것도 하지 않는다.
    terminalDuplicate(state, key) {
      const source = sessionsOf(state.sessions, state.owner).find(x => x.key === key)
      if (!source || source.id === null) return

      const copy = { key: nextKey++, id: null, owner: source.owner, title: source.title, kind: source.kind, hops: [...source.hops], status: 'starting', connected: false, busy: false, exitCode: null, request: { duplicateOf: source.id } }
      state.sessions.splice(state.sessions.indexOf(source) + 1, 0, copy)
      // activatePane은 rightKeys로 칸을 정한다: 오른쪽 칸의 탭이면 새 탭도 먼저 그 줄에 넣는다.
      if (state.sideKey !== null && state.rightKeys.includes(key)) state.rightKeys = [...state.rightKeys, copy.key]
      Object.assign(state, activatePane(state, copy.key))
      state.isPanelOpen = true
    },
    terminalUpdate(state, { key, ...patch }) {
      const session = state.sessions.find(x => x.key === key)
      if (session) Object.assign(session, patch)
    },
    terminalRemove(state, key) {
      const session = state.sessions.find(x => x.key === key)
      if (!session) return

      // 닫은 탭의 옆 탭은 같은 item의 탭 가운데에서 고른다.
      const keys = sessionsOf(state.sessions, session.owner).map(x => x.key)
      state.sessions.splice(state.sessions.indexOf(session), 1)

      // 다른 item의 세션이 뒤에서 끝났으면 보이는 패널은 그대로 둔다. (그 item의 칸은 돌아올 때 restorePanes가 맞춘다)
      if (session.owner !== state.owner) return
      Object.assign(state, closePane(state, key, keys))
      // 마지막 탭이 닫히면 최대화도 끝난다: 다음 터미널은 캔버스 아래에서 보통 높이로 열린다.
      if (keys.length === 1) {
        state.isPanelOpen = false
        state.isPanelMaximized = false
      }
    },
    terminalActivate(state, key) {
      Object.assign(state, activatePane(state, key))
      state.isPanelOpen = true
    },
    // 패널을 좌우로 나누거나(true: 고른 탭의 옆 탭이 오른쪽 칸으로 간다) 다시 합친다(false: 탭이 모두 한 줄로 돌아가고 고른 탭만 보인다).
    // 탭이 하나뿐이면 나눌 수 없다.
    terminalSplit(state, isSplit) {
      const partner = isSplit ? splitPartner(sessionsOf(state.sessions, state.owner), state.activeKey) : null
      if (isSplit && partner === null) return

      state.sideKey = partner
      state.rightKeys = partner === null ? [] : [partner]
      state.isPanelOpen = true
    },
    // 탭을 끌어서 옮겼다: keys는 탭 줄 하나(나눈 동안에는 한 칸의 줄)의 탭들의 새 순서. 그 탭들의 자리 안에서만 바뀐다.
    terminalReorder(state, keys) {
      state.sessions = reorderSessions(state.sessions, keys)
    },
    // 탭 key를 다른 칸(side)의 탭 줄로 끌어 옮겼다. keys는 그 줄의 새 순서다 (옮긴 탭이 들어 있다).
    terminalMove(state, { key, side, keys }) {
      Object.assign(state, moveToSide(state, key, side, sessionsOf(state.sessions, state.owner).map(x => x.key)))
      state.sessions = reorderSessions(state.sessions, keys)
    },
    terminalPanel(state, isOpen) {
      state.isPanelOpen = isOpen
    },
    // 패널을 헤더 아래까지 올리거나(true) 캔버스 아래의 원래 높이로 내린다(false).
    terminalMaximize(state, isMaximized) {
      state.isPanelMaximized = isMaximized
    },
    // 다른 item을 열었다(없으면 null). 떠나는 item의 활성 탭과 패널 상태를 기억하고, 새 item의 것을 되살린다.
    terminalOwner(state, owner) {
      if (owner === state.owner) return

      state.remembered[state.owner] = { activeKey: state.activeKey, isPanelOpen: state.isPanelOpen, isPanelMaximized: state.isPanelMaximized, sideKey: state.sideKey, rightKeys: state.rightKeys }
      state.owner = owner

      const mine = sessionsOf(state.sessions, owner)
      const last = state.remembered[owner]
      state.isPanelOpen = mine.length > 0 && (last ? last.isPanelOpen : true)
      state.isPanelMaximized = mine.length > 0 && !!last?.isPanelMaximized
      // 나눈 것은 두 칸에 탭이 남아 있을 때만 되살린다. (떠나 있는 동안 끝난 세션은 탭이 닫혔다)
      Object.assign(state, restorePanes(last, mine.map(x => x.key)))
    }
  },
  actions: {
    terminalOpen({ commit }, request) {
      commit('terminalAdd', request)
    }
  }
}
