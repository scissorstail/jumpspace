<template>
  <!-- 최대화하면 높이를 정하지 않는다: 캔버스 자리까지 #workspace를 다 차지한다 (.is-maximized).
       최소화하면(owner, 2026-10-12) 탭 줄만 창 아래쪽에 남는다 (.is-minimized): 높이는 탭 줄의 것이고, 화면과 끄는 가장자리는 없다. -->
  <section
    v-show="sessions.length > 0"
    class="terminal-panel"
    :class="{ 'is-maximized': isMaximized, 'is-minimized': !isOpen }"
    :style="isMaximized || !isOpen ? null : { height: `${shownHeight}px` }"
    aria-label="Terminals"
  >
    <!-- 위쪽 가장자리를 끌어서 높이를 바꾼다. 헤더 가까이 끌어 올리면 최대화하고, 최대화한 것을 끌어 내리면 풀린다. -->
    <div
      v-show="isOpen"
      class="terminal-resize"
      :title="isMaximized ? 'Drag down to lower' : 'Drag to resize, up to the header to maximize'"
      @mousedown.prevent="startResize"
    />

    <terminal-tabs
      :sessions="sessions"
      :active-key="activeKey"
      :side-key="sideKey"
      :is-maximized="isMaximized"
      :is-minimized="!isOpen"
      @activate="activate"
      @close="closeSession"
      @reorder="$store.commit('terminalReorder', $event)"
      @split="$store.commit('terminalSplit', $event)"
      @maximize="maximize"
      @hide="$store.commit('terminalPanel', false)"
      @show="$store.commit('terminalPanel', true)"
    />

    <!-- 화면은 모든 item의 세션 것을 둔다: 다른 item으로 갔다 와도 내용이 남는다. 탭 줄은 지금 item의 것만 보여준다.
         좌우로 나눈 동안에는 두 탭의 화면이 반씩 보인다 (.is-left, .is-right). 가운데 줄과, 고른 칸 위의 줄이 그것을 알린다. -->
    <div
      v-show="isOpen"
      class="terminal-body"
      :class="{ 'is-split': isSplit }"
    >
      <div
        v-for="session in allSessions"
        v-show="session.key === panes.left || session.key === panes.right"
        :key="session.key"
        :ref="`term-${session.key}`"
        class="terminal-screen"
        :class="{ 'is-left': isSplit && session.key === panes.left, 'is-right': isSplit && session.key === panes.right }"
        @focusin="activate(session.key)"
      />
      <div
        v-show="isSplit"
        class="terminal-divider"
        aria-hidden="true"
      />
      <div
        v-show="isSplit"
        class="terminal-pane-mark"
        :class="activeKey === panes.right ? 'is-right' : 'is-left'"
        aria-hidden="true"
      />
      <!-- 지나간 출력에서 찾기 (Ctrl+Shift+F): 고른 탭의 화면 위에 뜬다. -->
      <terminal-search
        v-if="search.isOpen"
        ref="search"
        v-model="search.text"
        :class="{ 'is-left': isSplit && activeKey === panes.left }"
        :is-missing="search.isMissing"
        @input="find('first')"
        @find="find"
        @close="closeSearch"
      />
    </div>
  </section>
</template>

<script>
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { mapGetters } from 'vuex'
import { canReconnect, createOutputRouter, endedByUser, rightClickAction, terminalShortcut } from '@/utils/terminal-sessions'
import { endedLine, errorLine, nextFontSize, panelDrag, panelHeight, RECONNECTING_LINE, searchSeed, terminalTheme } from '@/utils/terminal-view'
import { CONNECTED_DATA, CONNECTED_OSC } from '../../../../shared/terminal-marker.js'
import { MAX_WRITE } from '../../../../shared/terminal-input.js'
import { toastError } from '@/utils/notify'
import TerminalSearch from './terminal-search'
import TerminalTabs from './terminal-tabs'

// 터미널의 글꼴. 앞의 것은 앱에 들어 있다 (assets/theme.scss), 나머지는 그것을 읽지 못했을 때의 것이다.
const FONT = '"JetBrains Mono"'
const FONT_FAMILY = `${FONT}, Consolas, "Cascadia Mono", "DejaVu Sans Mono", monospace`

// 터미널 색은 지금 고른 테마(assets/theme.scss의 CSS 변수)에서 읽고, 설정의 단계(terminalColors)만큼 낮춘다.
function currentTerminalTheme(level) {
  const style = getComputedStyle(document.documentElement)
  return terminalTheme(name => style.getPropertyValue(name).trim(), level)
}

// 하단의 터미널 패널. 탭마다 xterm.js 화면을 하나씩 두고, main의 pty와 키 입력/출력을 주고받는다.
// 터미널은 그것을 연 다이어그램(item)의 것이다. sessions는 지금 열린 item의 세션(탭 줄), allSessions는 전부이다.
// 다른 item의 세션은 보이지 않을 뿐 계속 돌고, 그 item을 다시 열면 나타난다.
export default {
  name: 'TerminalPanel',
  components: { TerminalSearch, TerminalTabs },
  data() {
    return {
      // 사용자가 정한 높이. 창이 낮으면 보이는 높이(shownHeight)만 줄어든다. 최대화한 동안에도 남아서, 내리면 이 높이로 돌아온다.
      height: 280,
      // 캔버스와 패널이 나눠 쓰는 높이 (#workspace). 창 크기가 바뀌면 다시 잰다.
      available: Infinity,
      // 지나간 출력에서 찾기 (Ctrl+Shift+F). 찾는 글은 닫아도 남는다.
      search: { isOpen: false, text: '', isMissing: false }
    }
  },
  computed: {
    // 창이 낮아도 캔버스가 남도록 줄인 높이
    shownHeight() {
      return panelHeight(this.height, this.available)
    },
    // 터미널 색을 정하는 두 설정: 색 묶음과, 그 색을 얼마나 낮추는지
    colorSetting() {
      const { theme, terminalColors } = this.$store.getters.setting

      return `${theme} ${terminalColors}`
    },
    // 터미널 글꼴 크기 (설정). 터미널에서 Ctrl +/-/0으로 바꾼다.
    fontSize() {
      return this.$store.getters.setting.terminalFontSize
    },
    // 좌우로 나눴는지 (다른 칸에 보이는 탭이 있다)
    isSplit() {
      return this.sideKey !== null
    },
    // 보이는 화면과 고른 탭: 하나라도 바뀌면 크기를 다시 맞추고 포커스를 옮긴다.
    shownKeys() {
      return `${this.panes.left} ${this.panes.right} ${this.activeKey}`
    },
    ...mapGetters({ sessions: 'terminalSessions', allSessions: 'allTerminalSessions', activeKey: 'activeTerminalKey', panes: 'terminalPanes', sideKey: 'terminalSideKey', isOpen: 'isTerminalPanelOpen', isMaximized: 'isTerminalPanelMaximized' })
  },
  watch: {
    // 색 묶음이나 색의 단계를 바꾸면 열린 터미널의 색도 바꾼다. (색 묶음의 CSS 변수는 다음 그리기에 바뀐다)
    colorSetting() {
      this.$nextTick(() => {
        for (const [, entry] of this.terms) entry.term.options.theme = this.colors()
      })
    },
    // 보이는 터미널의 글꼴을 바꾸고 크기를 다시 맞춘다. 보이지 않는 터미널은 다시 보일 때 맞춘다 (fit).
    fontSize() {
      this.fitActive()
    },
    // 새 탭: 화면을 만들고 main에 세션을 연다.
    allSessions(list) {
      this.$nextTick(() => list.filter(x => x.request && !this.terms.has(x.key)).forEach(x => this.start(x)))
    },
    shownKeys() {
      this.$nextTick(() => this.fitActive(true))
    },
    // 찾는 칸은 그것을 연 탭의 것이다: 다른 탭을 고르면(새 터미널도) 닫힌다. 찾던 글은 남는다.
    activeKey() {
      this.search.isOpen = false
      this.search.isMissing = false
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
    // key -> 그 탭의 화면: xterm(term)과 그 애드온(fit, search, webgl), main의 세션 번호(id), 그리고 start()가 두는 상태
    this.terms = new Map()
    this.router = createOutputRouter()
  },
  mounted() {
    this.stopData = window.preload.terminal.onData((id, data) => this.router.push(id, data))
    this.stopExit = window.preload.terminal.onExit((id, exitCode) => this.onExit(id, exitCode))
    this.observer = new ResizeObserver(() => this.fitActive())
    this.observer.observe(this.$el)
    this.spaceObserver = new ResizeObserver(([entry]) => { this.available = entry.contentRect.height })
    this.spaceObserver.observe(this.$el.parentElement)
    this.loadFonts()
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
    // 아직 열리는 중인 세션은 답이 왔을 때 start()와 reconnect()가 닫는다: 여기에 없는 탭의 세션을 닫는 것이 그들의 일이다.
    this.terms.clear()
  },
  methods: {
    // 터미널 글꼴의 보통 굵기와 굵은 굵기를 미리 읽는다. 브라우저는 글꼴 파일을 처음 쓰일 때 읽는데, 굵은 것은 터미널의
    // 굵은 글자가 처음이다: 그때 xterm.js(WebGL)는 아직 없는 글꼴 대신 다른 글꼴로 글자를 그려서 간직하고, 뒤에 그린 글자와
    // 섞인다 (프롬프트의 굵은 이름이 두 글꼴로 보였다). 읽기 전에 그린 글자가 있으면 버리고 다시 그리게 한다.
    async loadFonts() {
      try {
        await Promise.all(['400', '700'].map(weight => document.fonts.load(`${weight} ${this.fontSize}px ${FONT}`)))
      } catch (e) {
        console.warn('The terminal font could not be loaded', e)
        return
      }
      for (const [, entry] of this.terms) entry.webgl?.clearTextureAtlas()
    },
    // 지금의 색 묶음과 설정의 단계로 만든 터미널 색
    colors() {
      return currentTerminalTheme(this.$store.getters.setting.terminalColors)
    },
    async start(session) {
      const { kind, payload } = session.request
      // 요청(비밀번호 포함)은 main에 넘기면 store에서 지운다.
      this.$store.commit('terminalUpdate', { key: session.key, request: null })

      const term = new Terminal({
        // 깜빡이지 않는다: 로딩 표시처럼 화면을 빠르게 다시 그리는 프로그램에서 커서가 번쩍거렸다.
        cursorBlink: false,
        fontFamily: FONT_FAMILY,
        fontSize: this.fontSize,
        scrollback: 5000,
        theme: this.colors()
      })
      const fit = new FitAddon()
      const search = new SearchAddon()
      term.loadAddon(fit)
      term.loadAddon(search)
      const entry = { term, fit, search, webgl: null, id: null, ended: false, reconnecting: false, interruptedAt: null }
      this.terms.set(session.key, entry)

      const el = this.$refs[`term-${session.key}`]?.[0]
      term.open(el)
      this.drawWithWebgl(entry)
      this.fit(entry)
      term.focus()

      term.onData(data => this.typed(session.key, entry, data))
      this.enableShortcuts(term, el)
      // 로그인하면 ssh가 보이지 않는 표시를 보낸다 (main의 ssh.js). 받으면 캔버스의 경로가 "연결됨"이 된다.
      term.parser.registerOscHandler(CONNECTED_OSC, data => {
        if (data === CONNECTED_DATA) this.$store.commit('terminalUpdate', { key: session.key, connected: true })
        return true
      })

      const result = await window.preload.terminal.open(kind, payload, { cols: term.cols, rows: term.rows })
      // 기다리는 동안 탭이 닫혔으면 방금 열린 세션도 닫는다. closeSession은 아직 번호가 없는 세션을 끝낼 수 없어서,
      // 그 세션이 탭 없이 main에서 계속 돌았다: ssh는 로그인까지 가고, 서버에는 보는 화면 없이 접속한 채로 남는다.
      if (this.terms.get(session.key) !== entry) {
        if (result.ok) window.preload.terminal.close(result.id)
        return
      }
      if (!result.ok) {
        term.write(errorLine(result.error))
        this.$store.commit('terminalUpdate', { key: session.key, status: 'failed' })
        return
      }

      this.attach(session, entry, result)
    },
    // 터미널에 친 것(붙여 넣은 것도)을 세션으로 보낸다. 끝난 세션에서는 Enter만 받는다: 다시 접속이다.
    typed(key, entry, data) {
      if (entry.ended) {
        if (data === '\r') this.reconnect(this.allSessions.find(x => x.key === key))
        return
      }
      // main은 한 번에 MAX_WRITE까지만 쓴다. 그보다 긴 붙여넣기는 보내지 않고 그렇다고 알린다 (#220: 말없이 버려졌다).
      // 나눠 보내지도 않는다: Windows에서 Git의 ssh는 긴 붙여넣기를 읽는 몇 분 동안 아무것도 하지 않는다 (terminal-input.js).
      if (data.length > MAX_WRITE) {
        toastError(this, 'Paste not sent', `The text is ${data.length.toLocaleString('en-US')} characters long, and a terminal takes at most ${MAX_WRITE.toLocaleString('en-US')} at once. Paste it in parts, or copy a file with scp.`)
        return
      }
      // Ctrl+C를 누른 때를 기억한다: 포워딩(ssh -N)은 Ctrl+C로 끝내도 오류(255)로 끝난다.
      if (data.includes('\x03')) entry.interruptedAt = Date.now()
      if (entry.id !== null) window.preload.terminal.write(entry.id, data)
    },
    // 선과 블록 문자(─ │ █ 등)를 xterm.js가 칸에 꼭 맞게 직접 그리게 한다 (owner, 2026-10-11: Claude Code의 선 사이에
    // 틈이 보였다). 기본 그리기(DOM)는 그 문자를 글꼴로 그려서, 화면 배율에 따라 줄과 줄, 칸과 칸 사이가 끊긴다.
    // WebGL을 쓸 수 없거나 브라우저가 그 컨텍스트를 거두면(동시에 16개쯤까지) 기본 그리기로 돌아간다.
    drawWithWebgl(entry) {
      try {
        const webgl = new WebglAddon()
        webgl.onContextLoss(() => {
          webgl.dispose()
          entry.webgl = null
        })
        entry.term.loadAddon(webgl)
        entry.webgl = webgl
      } catch (e) {
        console.warn('WebGL terminal renderer is not available', e)
      }
    },
    // main이 연 세션(result: { id, windowsPty })을 탭의 화면에 잇는다. 처음 열 때와 다시 접속할 때 같다.
    // Windows의 pty(ConPTY)는 크기가 바뀔 때 화면을 스스로 맞춘다. xterm.js도 그에 맞춰야 한다 (main의 windowsPtyInfo):
    // 모르면 패널이 높아질 때 지난 출력을 화면으로 끌어내리고, ConPTY가 그 줄들을 빈 줄로 덮어써서 사라진다.
    // 그래서 출력을 받기 전에(router.register 앞에서) 정한다.
    attach(session, entry, { id, windowsPty }) {
      entry.id = id
      if (windowsPty) entry.term.options.windowsPty = windowsPty
      this.router.register(id, data => entry.term.write(data))
      this.$store.commit('terminalUpdate', { key: session.key, id, status: 'running' })
      // 여는 동안 패널 크기가 바뀌었을 수 있다.
      this.fit(entry, true)
    },
    // Windows 터미널처럼. 복사: 선택하고 Ctrl+C (또는 Ctrl+Shift+C, Ctrl+Insert). 고른 글자가 없는 Ctrl+C는 그대로 중단이다.
    // 붙여넣기: Ctrl+V (또는 Ctrl+Shift+V; Shift+Insert는 브라우저가 처리). 오른쪽 클릭: 선택한 글자가 있으면 복사, 없으면 붙여넣기.
    // 프로그램이 마우스를 받는 동안의 오른쪽 클릭은 프로그램의 것이다 (rightClickAction).
    // 글꼴 크기: Ctrl +/-/0 (changeFontSize). 지나간 출력에서 찾기: Ctrl+Shift+F (openSearch).
    enableShortcuts(term, el) {
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
        if (shortcut.startsWith('font-')) {
          this.changeFontSize(shortcut)
        } else if (shortcut === 'find') {
          this.openSearch()
        } else if (shortcut === 'paste') {
          paste()
        } else if (copySelection() && !event.shiftKey && event.code === 'KeyC') {
          // Ctrl+C로 복사했으면 선택을 푼다: 다음 Ctrl+C는 중단이다.
          term.clearSelection()
        }
        return false
      })
      el.addEventListener('contextmenu', async event => {
        event.preventDefault()
        const action = rightClickAction({ mouseTracking: term.modes.mouseTrackingMode, shiftKey: event.shiftKey, hasSelection: term.hasSelection() })
        if (action === 'copy') {
          copySelection()
          term.clearSelection()
        } else if (action === 'paste') {
          await paste()
          term.focus()
        }
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

      entry.ended = false
      entry.interruptedAt = null
      this.attach(session, entry, result)
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
    // 탭을 누르거나, 나눈 패널의 다른 칸을 눌렀다(화면이 포커스를 받는다). 이미 고른 탭이면 할 일이 없다:
    // 포커스를 줄 때마다 store를 건드리면 패널을 다시 여는 것(terminalActivate)까지 따라온다.
    activate(key) {
      if (key === this.activeKey && this.isOpen) return

      this.$store.commit('terminalActivate', key)
    },
    // 최소화한 탭 줄에서 최대화를 누르면 패널도 다시 보인다.
    maximize(isMaximized) {
      this.$store.commit('terminalMaximize', isMaximized)
      this.$store.commit('terminalPanel', true)
    },
    // 글꼴 크기를 바꾼다 (모든 터미널이 함께 쓰는 설정). 바뀐 값은 잠시 뒤에 저장된다 (store의 settingChange).
    changeFontSize(shortcut) {
      const terminalFontSize = nextFontSize(this.fontSize, shortcut)
      if (terminalFontSize !== this.fontSize) this.$store.dispatch('settingChange', { terminalFontSize })
    },
    // 찾는 칸을 열고(열려 있으면 그대로) 거기로 포커스를 준다. 터미널에서 한 줄 안의 글을 골라 두었으면 그것을 찾는다.
    openSearch() {
      const entry = this.terms.get(this.activeKey)
      const seed = searchSeed(entry?.term.getSelection())
      if (seed) {
        this.search.text = seed
        this.search.isMissing = false
        // 고른 그 자리를 찾은 것으로 해 둔다: 그래야 다음 Enter가 같은 자리에 머물지 않고 넘어간다.
        entry.search.findNext(seed)
      }
      this.search.isOpen = true
      this.$nextTick(() => this.$refs.search?.focus())
    },
    // 닫으면 터미널로 돌아간다. 찾은 글은 고른 채로 남는다 (Ctrl+C로 복사할 수 있다).
    closeSearch() {
      this.search.isOpen = false
      this.search.isMissing = false
      this.terms.get(this.activeKey)?.term.focus()
    },
    // 고른 탭의 터미널에서 찾는다. 찾으면 xterm.js가 그 글을 고르고 그 줄로 넘긴다.
    // first: 글을 칠 때마다, 맨 아래(가장 새 출력)에서 위로. previous와 next: 지금 고른 곳에서 위로, 아래로.
    find(direction) {
      const entry = this.terms.get(this.activeKey)
      if (!entry) return

      const { text } = this.search
      if (direction === 'first') entry.term.clearSelection()
      const found = text !== '' && (direction === 'next' ? entry.search.findNext(text) : entry.search.findPrevious(text))
      this.search.isMissing = text !== '' && !found
    },
    fit(entry, force = false) {
      if (!entry || !entry.term.element || entry.term.element.offsetParent === null) return

      // 글꼴 크기는 보이는 화면에서만 바꾼다: 여기는 보이는 화면만 지나가고, 숨은 화면은 다시 보일 때 여기로 온다.
      // (xterm.js가 글자 크기를 화면에서 재는 경우, 숨은 화면에서는 잴 수 없어서 옛 크기가 남는다)
      if (entry.term.options.fontSize !== this.fontSize) entry.term.options.fontSize = this.fontSize

      const before = [entry.term.cols, entry.term.rows]
      entry.fit.fit()
      if (entry.id !== null && (force || before[0] !== entry.term.cols || before[1] !== entry.term.rows)) {
        window.preload.terminal.resize(entry.id, entry.term.cols, entry.term.rows)
      }
    },
    // 보이는 화면(나눈 동안에는 둘)의 크기를 맞추고, focus이면 고른 탭의 터미널에 포커스를 준다.
    fitActive(focus = false) {
      for (const key of [this.panes.left, this.panes.right]) this.fit(this.terms.get(key))
      if (focus) this.terms.get(this.activeKey)?.term.focus()
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

  // 좌우로 나눈 동안: 반씩, 가운데 줄에서 같은 여백을 두고
  &.is-left {
    right: calc(50% + 5px);
  }

  &.is-right {
    left: calc(50% + 11px);
  }
}

// 두 칸 사이의 줄
.terminal-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(50% - 1px);
  width: 2px;
  background: var(--js-line);
}

// 고른 칸(키 입력을 받는다) 위의 줄
.terminal-pane-mark {
  position: absolute;
  top: 0;
  width: 50%;
  height: 2px;
  background: var(--js-secondary);

  &.is-left {
    left: 0;
  }

  &.is-right {
    left: 50%;
  }
}
</style>
