// 앱 안의 터미널 탭 목록. 노드(Rete 안의 Vue)와 하단 패널이 이 store로 주고받는다.
// request에는 접속 요청(비밀번호 포함)이 들어 있다. 패널이 main에 넘긴 뒤 지운다.
// (끝난 탭을 다시 연결할 때 쓰는 요청은 main(terminal.js)이 갖고 있고, 여기에는 다시 두지 않는다)
// hops는 세션이 지나가는 서버들(user@host:port, 경로 순서)이다. 캔버스가 열린 경로의 연결선을 표시하는 데 쓴다.
//
// 터미널은 그것을 연 다이어그램(item)의 것이다. owner는 지금 열려 있는 item의 번호(목록 항목의 index)이고,
// 세션은 만들어질 때의 owner를 갖는다. 패널과 캔버스는 지금 owner의 세션만 보여주고, 다른 item의 세션은
// 뒤에서 계속 돈다. 활성 탭과 패널을 숨겼는지는 item마다 기억해 두었다가 돌아오면 되살린다.
import { hopKey, reorderSessions, sessionsOf } from '../../utils/terminal-sessions'

let nextKey = 1

export default {
  state: {
    sessions: [],
    activeKey: null,
    isPanelOpen: false,
    owner: null,
    // owner -> { activeKey, isPanelOpen }. mutation 안에서만 읽는다.
    remembered: {}
  },
  getters: {
    // 모든 item의 세션 (패널이 화면을 유지하고, 목록이 item별 개수를 세는 데 쓴다)
    allTerminalSessions: state => state.sessions,
    // 지금 열려 있는 item의 세션
    terminalSessions: state => sessionsOf(state.sessions, state.owner),
    activeTerminalKey: state => state.activeKey,
    isTerminalPanelOpen: state => state.isPanelOpen
  },
  mutations: {
    terminalAdd(state, { title, kind, payload, route = [] }) {
      const key = nextKey++
      const hops = route.map(hopKey)
      // connected: 로그인 표시를 받았는지 (캔버스의 연결 중/연결됨 구분)
      state.sessions.push({ key, id: null, owner: state.owner, title, hops, status: 'starting', connected: false, exitCode: null, request: { kind, payload } })
      state.activeKey = key
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
      const siblings = sessionsOf(state.sessions, session.owner)
      const index = siblings.indexOf(session)
      state.sessions.splice(state.sessions.indexOf(session), 1)
      siblings.splice(index, 1)

      // 다른 item의 세션이 뒤에서 끝났으면 보이는 패널은 그대로 둔다.
      if (session.owner !== state.owner) return
      if (state.activeKey === key) {
        const next = siblings[Math.min(index, siblings.length - 1)]
        state.activeKey = next ? next.key : null
      }
      if (siblings.length === 0) state.isPanelOpen = false
    },
    terminalActivate(state, key) {
      state.activeKey = key
      state.isPanelOpen = true
    },
    // 탭을 끌어서 옮겼다: keys는 보이는 탭들의 새 순서
    terminalReorder(state, keys) {
      state.sessions = reorderSessions(state.sessions, keys)
    },
    terminalPanel(state, isOpen) {
      state.isPanelOpen = isOpen
    },
    // 다른 item을 열었다(없으면 null). 떠나는 item의 활성 탭과 패널 상태를 기억하고, 새 item의 것을 되살린다.
    terminalOwner(state, owner) {
      if (owner === state.owner) return

      state.remembered[state.owner] = { activeKey: state.activeKey, isPanelOpen: state.isPanelOpen }
      state.owner = owner

      const mine = sessionsOf(state.sessions, owner)
      const last = state.remembered[owner]
      state.activeKey = mine.some(x => x.key === last?.activeKey) ? last.activeKey : mine[0]?.key ?? null
      state.isPanelOpen = mine.length > 0 && (last ? last.isPanelOpen : true)
    }
  },
  actions: {
    terminalOpen({ commit }, request) {
      commit('terminalAdd', request)
    }
  }
}
