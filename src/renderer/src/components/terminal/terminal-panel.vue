<template>
  <!-- 최대화하면 높이를 정하지 않는다: 캔버스 자리까지 #workspace를 다 차지한다 (.is-maximized) -->
  <section
    v-show="isOpen && sessions.length > 0"
    class="terminal-panel"
    :class="{ 'is-maximized': isMaximized }"
    :style="isMaximized ? null : { height: `${shownHeight}px` }"
    aria-label="Terminals"
  >
    <!-- 위쪽 가장자리를 끌어서 높이를 바꾼다. 헤더 가까이 끌어 올리면 최대화하고, 최대화한 것을 끌어 내리면 풀린다. -->
    <div
      class="terminal-resize"
      :title="isMaximized ? 'Drag down to lower' : 'Drag to resize, up to the header to maximize'"
      @mousedown.prevent="startResize"
    />

    <terminal-tabs
      :sessions="sessions"
      :active-key="activeKey"
      :is-maximized="isMaximized"
      @activate="activate"
      @close="closeSession"
      @reorder="$store.commit('terminalReorder', $event)"
      @maximize="$store.commit('terminalMaximize', $event)"
      @hide="$store.commit('terminalPanel', false)"
    />

    <!-- 화면은 모든 item의 세션 것을 둔다: 다른 item으로 갔다 와도 내용이 남는다. 탭 줄은 지금 item의 것만 보여준다. -->
    <div class="terminal-body">
      <div
        v-for="session in allSessions"
        v-show="session.key === activeKey"
        :key="session.key"
        :ref="`term-${session.key}`"
        class="terminal-screen"
      />
    </div>
  </section>
</template>

<script>
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { mapGetters } from 'vuex'
import { canReconnect, createOutputRouter, endedByUser, terminalShortcut } from '@/utils/terminal-sessions'
import { endedLine, errorLine, panelDrag, panelHeight, RECONNECTING_LINE, terminalTheme } from '@/utils/terminal-view'
import { CONNECTED_DATA, CONNECTED_OSC } from '../../../../shared/terminal-marker.js'
import TerminalTabs from './terminal-tabs'

// 터미널 색은 지금 고른 테마(assets/theme.scss의 CSS 변수)에서 읽는다.
function currentTerminalTheme() {
  const style = getComputedStyle(document.documentElement)
  return terminalTheme(name => style.getPropertyValue(name).trim())
}

// 하단의 터미널 패널. 탭마다 xterm.js 화면을 하나씩 두고, main의 pty와 키 입력/출력을 주고받는다.
// 터미널은 그것을 연 다이어그램(item)의 것이다. sessions는 지금 열린 item의 세션(탭 줄), allSessions는 전부이다.
// 다른 item의 세션은 보이지 않을 뿐 계속 돌고, 그 item을 다시 열면 나타난다.
export default {
  name: 'TerminalPanel',
  components: { TerminalTabs },
  data() {
    return {
      // 사용자가 정한 높이. 창이 낮으면 보이는 높이(shownHeight)만 줄어든다. 최대화한 동안에도 남아서, 내리면 이 높이로 돌아온다.
      height: 280,
      // 캔버스와 패널이 나눠 쓰는 높이 (#workspace). 창 크기가 바뀌면 다시 잰다.
      available: Infinity
    }
  },
  computed: {
    // 창이 낮아도 캔버스가 남도록 줄인 높이
    shownHeight() {
      return panelHeight(this.height, this.available)
    },
    ...mapGetters({ sessions: 'terminalSessions', allSessions: 'allTerminalSessions', activeKey: 'activeTerminalKey', isOpen: 'isTerminalPanelOpen', isMaximized: 'isTerminalPanelMaximized' })
  },
  watch: {
    // 테마를 바꾸면 열린 터미널의 색도 바꾼다.
    '$store.getters.setting.theme'() {
      this.$nextTick(() => {
        for (const [, entry] of this.terms) entry.term.options.theme = currentTerminalTheme()
      })
    },
    // 새 탭: 화면을 만들고 main에 세션을 연다.
    allSessions(list) {
      this.$nextTick(() => list.filter(x => x.request && !this.terms.has(x.key)).forEach(x => this.start(x)))
    },
    activeKey() {
      this.$nextTick(() => this.fitActive(true))
    },
    isOpen(open) {
      if (open) this.$nextTick(() => this.fitActive(true))
    },
    // 올리거나 내린 뒤에는 바로 칠 수 있게 터미널로 포커스를 준다.
    isMaximized() {
      if (this.isOpen) this.$nextTick(() => this.fitActive(true))
    }
  },
  created() {
    this.terms = new Map() // key -> { term, fit, id }
    this.router = createOutputRouter()
  },
  mounted() {
    this.stopData = window.preload.terminal.onData((id, data) => this.router.push(id, data))
    this.stopExit = window.preload.terminal.onExit((id, exitCode) => this.onExit(id, exitCode))
    this.observer = new ResizeObserver(() => this.fitActive())
    this.observer.observe(this.$el)
    this.spaceObserver = new ResizeObserver(([entry]) => { this.available = entry.contentRect.height })
    this.spaceObserver.observe(this.$el.parentElement)
  },
  beforeDestroy() {
    this.stopData?.()
    this.stopExit?.()
    this.observer?.disconnect()
    this.spaceObserver?.disconnect()
    for (const [, entry] of this.terms) {
      if (entry.id !== null) window.preload.terminal.close(entry.id)
      entry.term.dispose()
    }
  },
  methods: {
    async start(session) {
      const { kind, payload } = session.request
      // 요청(비밀번호 포함)은 main에 넘기면 store에서 지운다.
      this.$store.commit('terminalUpdate', { key: session.key, request: null })

      const term = new Terminal({
        // 깜빡이지 않는다: 로딩 표시처럼 화면을 빠르게 다시 그리는 프로그램에서 커서가 번쩍거렸다.
        cursorBlink: false,
        fontFamily: '"JetBrains Mono", Consolas, "Cascadia Mono", "DejaVu Sans Mono", monospace',
        fontSize: 13,
        scrollback: 5000,
        theme: currentTerminalTheme()
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      const entry = { term, fit, id: null, ended: false, reconnecting: false, interruptedAt: null }
      this.terms.set(session.key, entry)

      const el = this.$refs[`term-${session.key}`]?.[0]
      term.open(el)
      this.fit(entry)
      term.focus()

      term.onData(data => {
        // 끝난 세션에서는 Enter가 다시 접속이다.
        if (entry.ended) {
          if (data === '\r') this.reconnect(this.allSessions.find(x => x.key === session.key))
          return
        }
        // Ctrl+C를 누른 때를 기억한다: 포워딩(ssh -N)은 Ctrl+C로 끝내도 오류(255)로 끝난다.
        if (data.includes('\x03')) entry.interruptedAt = Date.now()
        if (entry.id !== null) window.preload.terminal.write(entry.id, data)
      })
      this.enableClipboard(term, el)
      // 로그인하면 ssh가 보이지 않는 표시를 보낸다 (main의 ssh.js). 받으면 캔버스의 경로가 "연결됨"이 된다.
      term.parser.registerOscHandler(CONNECTED_OSC, data => {
        if (data === CONNECTED_DATA) this.$store.commit('terminalUpdate', { key: session.key, connected: true })
        return true
      })

      const result = await window.preload.terminal.open(kind, payload, { cols: term.cols, rows: term.rows })
      if (!result.ok) {
        term.write(errorLine(result.error))
        this.$store.commit('terminalUpdate', { key: session.key, status: 'failed' })
        return
      }

      entry.id = result.id
      this.adaptToPty(term, result)
      this.router.register(result.id, data => term.write(data))
      this.$store.commit('terminalUpdate', { key: session.key, id: result.id, status: 'running' })
      // 여는 동안 패널 크기가 바뀌었을 수 있다.
      this.fit(entry, true)
    },
    // Windows의 pty(ConPTY)는 크기가 바뀔 때 화면을 스스로 맞춘다. xterm.js도 그에 맞춰야 한다 (main의 windowsPtyInfo):
    // 모르면 패널이 높아질 때 지난 출력을 화면으로 끌어내리고, ConPTY가 그 줄들을 빈 줄로 덮어써서 사라진다.
    // 출력을 받기 전에(router.register 앞에서) 정한다.
    adaptToPty(term, { windowsPty }) {
      if (windowsPty) term.options.windowsPty = windowsPty
    },
    // Windows 터미널처럼. 복사: 선택하고 Ctrl+C (또는 Ctrl+Shift+C, Ctrl+Insert). 고른 글자가 없는 Ctrl+C는 그대로 중단이다.
    // 붙여넣기: Ctrl+V (또는 Ctrl+Shift+V; Shift+Insert는 브라우저가 처리). 오른쪽 클릭: 선택한 글자가 있으면 복사, 없으면 붙여넣기.
    enableClipboard(term, el) {
      const copySelection = () => {
        if (!term.hasSelection()) return false
        window.preload.clipboard.writeText(term.getSelection())
        return true
      }
      const paste = async () => {
        const text = await window.preload.clipboard.readText()
        if (text) term.paste(text)
      }
      term.attachCustomKeyEventHandler(event => {
        const shortcut = terminalShortcut(event, { hasSelection: term.hasSelection() })
        if (!shortcut) return true

        // 브라우저도 붙여넣지 않게 막는다 (두 번 들어간다).
        event.preventDefault()
        if (shortcut === 'paste') {
          paste()
        } else if (copySelection() && !event.shiftKey && event.code === 'KeyC') {
          // Ctrl+C로 복사했으면 선택을 푼다: 다음 Ctrl+C는 중단이다.
          term.clearSelection()
        }
        return false
      })
      el.addEventListener('contextmenu', async event => {
        event.preventDefault()
        if (copySelection()) {
          term.clearSelection()
          return
        }
        await paste()
        term.focus()
      })
    },
    onExit(id, exitCode) {
      const session = this.allSessions.find(x => x.id === id)
      if (!session) return

      const entry = this.terms.get(session.key)
      this.router.unregister(id)
      // exit나 Ctrl+C로 직접 끝냈으면 탭을 바로 닫는다. 오류나 접속 실패로 끝났을 때만 남겨서 다시 접속할 수 있게 한다.
      if (endedByUser({ exitCode, connected: session.connected, interruptedAt: entry?.interruptedAt ?? null })) {
        this.closeSession(session)
        return
      }
      entry?.term.write(endedLine(exitCode))
      if (entry) entry.ended = true
      this.$store.commit('terminalUpdate', { key: session.key, status: 'exited', exitCode })
    },
    // 끝난 세션을 같은 탭에서 같은 요청으로 다시 연다. 요청은 main이 갖고 있다. (store에는 비밀번호를 두지 않는다)
    async reconnect(session) {
      const entry = session && this.terms.get(session.key)
      if (!entry || entry.reconnecting || !canReconnect(session)) return

      entry.reconnecting = true
      const { exitCode } = session
      this.$store.commit('terminalUpdate', { key: session.key, status: 'starting', connected: false, exitCode: null })
      entry.term.write(RECONNECTING_LINE)
      const result = await window.preload.terminal.reopen(entry.id, { cols: entry.term.cols, rows: entry.term.rows })
      entry.reconnecting = false

      // 기다리는 동안 탭이 닫혔으면 새 세션도 닫는다.
      if (!this.terms.has(session.key)) {
        if (result.ok) window.preload.terminal.close(result.id)
        return
      }
      if (!result.ok) {
        entry.term.write(errorLine(result.error))
        this.$store.commit('terminalUpdate', { key: session.key, status: 'exited', exitCode })
        return
      }

      entry.id = result.id
      entry.ended = false
      entry.interruptedAt = null
      this.adaptToPty(entry.term, result)
      this.router.register(result.id, data => entry.term.write(data))
      this.$store.commit('terminalUpdate', { key: session.key, id: result.id, status: 'running' })
      this.fit(entry, true)
      entry.term.focus()
    },
    closeSession(session) {
      const entry = this.terms.get(session.key)
      if (entry) {
        // 실행 중이면 끝내고, 끝난 세션이면 main이 다시 접속용으로 기억해 둔 요청을 잊게 한다.
        if (entry.id !== null) window.preload.terminal.close(entry.id)
        if (entry.id !== null) this.router.unregister(entry.id)
        entry.term.dispose()
        this.terms.delete(session.key)
      }
      this.$store.commit('terminalRemove', session.key)
      // 닫기 단추가 사라져도 키보드 포커스가 갈 곳이 있게, 남은 활성 터미널로 옮긴다.
      this.$nextTick(() => this.fitActive(true))
    },
    // 지워진 item들의 터미널을 모두 닫는다. (item이 없으면 다시 볼 길이 없다)
    closeOwners(owners) {
      this.allSessions.filter(x => owners.includes(x.owner)).forEach(x => this.closeSession(x))
    },
    activate(key) {
      this.$store.commit('terminalActivate', key)
    },
    fit(entry, force = false) {
      if (!entry || !entry.term.element || entry.term.element.offsetParent === null) return

      const before = [entry.term.cols, entry.term.rows]
      entry.fit.fit()
      if (entry.id !== null && (force || before[0] !== entry.term.cols || before[1] !== entry.term.rows)) {
        window.preload.terminal.resize(entry.id, entry.term.cols, entry.term.rows)
      }
    },
    fitActive(focus = false) {
      const entry = this.terms.get(this.activeKey)
      this.fit(entry)
      if (focus) entry?.term.focus()
    },
    startResize(event) {
      const startY = event.clientY
      // 보이는 높이에서 시작한다: 창이 낮아 줄어든 패널이나 최대화한 패널을 끌어도 튀지 않는다.
      const startHeight = this.$el.getBoundingClientRect().height
      const chosen = this.height
      const move = e => {
        const { maximized, height } = panelDrag(startHeight + startY - e.clientY, this.available)
        if (maximized !== this.isMaximized) this.$store.commit('terminalMaximize', maximized)
        if (!maximized) this.height = height
      }
      const up = () => {
        // 끌어 올려서 최대화했으면 끌기 전의 높이를 남긴다: 내렸을 때 캔버스가 좁은 띠로 남지 않는다.
        if (this.isMaximized) this.height = chosen
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    }
  }
}
</script>

<style lang="scss" scoped>
.terminal-panel {
  position: relative;
  display: flex;
  flex: none;
  flex-direction: column;
  border-top: 4px solid transparent;
  border-image: var(--js-bands) 1;
  background: var(--js-bg);

  // 최대화: 캔버스 영역은 높이 없이 접히고(views/Layout.vue) 패널이 #workspace를 다 차지한다.
  // 위의 색 띠는 헤더의 띠와 같은 자리에 겹친다.
  &.is-maximized {
    flex: 1;
    min-height: 0;
  }
}

.terminal-resize {
  position: absolute;
  top: -4px;
  right: 0;
  left: 0;
  height: 8px;
  cursor: ns-resize;
  z-index: 1;
}

.terminal-body {
  position: relative;
  flex: 1;
  min-height: 0;
}

.terminal-screen {
  position: absolute;
  inset: 6px 4px 4px 10px;
}
</style>
