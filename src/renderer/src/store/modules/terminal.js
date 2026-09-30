// 앱 안의 터미널 탭 목록. 노드(Rete 안의 Vue)와 하단 패널이 이 store로 주고받는다.
// request에는 접속 요청(비밀번호 포함)이 들어 있다. 패널이 main에 넘긴 뒤 지운다.
// hops는 세션이 지나가는 서버들(user@host:port, 경로 순서)이다. 캔버스가 열린 경로의 연결선을 표시하는 데 쓴다.
import { hopKey } from '../../utils/terminal-sessions'

let nextKey = 1

export default {
  state: {
    sessions: [],
    activeKey: null,
    isPanelOpen: false
  },
  getters: {
    terminalSessions: state => state.sessions,
    activeTerminalKey: state => state.activeKey,
    isTerminalPanelOpen: state => state.isPanelOpen
  },
  mutations: {
    terminalAdd(state, { title, kind, payload, route = [] }) {
      const key = nextKey++
      const hops = route.map(hopKey)
      state.sessions.push({ key, id: null, title, hops, status: 'starting', exitCode: null, request: { kind, payload } })
      state.activeKey = key
      state.isPanelOpen = true
    },
    terminalUpdate(state, { key, ...patch }) {
      const session = state.sessions.find(x => x.key === key)
      if (session) Object.assign(session, patch)
    },
    terminalRemove(state, key) {
      const index = state.sessions.findIndex(x => x.key === key)
      if (index === -1) return
      state.sessions.splice(index, 1)
      if (state.activeKey === key) {
        const next = state.sessions[Math.min(index, state.sessions.length - 1)]
        state.activeKey = next ? next.key : null
      }
      if (state.sessions.length === 0) state.isPanelOpen = false
    },
    terminalActivate(state, key) {
      state.activeKey = key
      state.isPanelOpen = true
    },
    terminalPanel(state, isOpen) {
      state.isPanelOpen = isOpen
    }
  },
  actions: {
    terminalOpen({ commit }, request) {
      commit('terminalAdd', request)
    }
  }
}
