<template>
  <section
    v-show="isOpen && sessions.length > 0"
    class="terminal-panel"
    :style="{ height: `${height}px` }"
    aria-label="Terminals"
  >
    <!-- 위쪽 가장자리를 끌어서 높이를 바꾼다 -->
    <div
      class="terminal-resize"
      title="Drag to resize"
      @mousedown.prevent="startResize"
    />

    <div
      class="terminal-tabs"
      role="tablist"
    >
      <div
        v-for="session in sessions"
        :key="session.key"
        class="terminal-tab"
        :class="{ active: session.key === activeKey, [`is-${session.status}`]: true }"
        role="tab"
        :aria-selected="session.key === activeKey ? 'true' : 'false'"
        tabindex="0"
        :title="statusText(session)"
        @click="activate(session.key)"
        @keydown.enter="activate(session.key)"
      >
        <span
          class="terminal-status"
          aria-hidden="true"
        />
        <span class="terminal-tab-title">{{ session.title }}</span>
        <button
          type="button"
          class="terminal-tab-close"
          :aria-label="`Close ${session.title}`"
          title="Close"
          @click.stop="closeSession(session)"
        >
          <b-icon
            icon="x"
            aria-hidden="true"
          />
        </button>
      </div>

      <button
        type="button"
        class="terminal-hide ml-auto"
        aria-label="Hide terminals"
        title="Hide terminals (they keep running)"
        @click="$store.commit('terminalPanel', false)"
      >
        <b-icon
          icon="chevron-down"
          aria-hidden="true"
        />
      </button>
    </div>

    <div class="terminal-body">
      <div
        v-for="session in sessions"
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
import { createOutputRouter } from '@/utils/terminal-sessions'

const MIN_HEIGHT = 140

// 터미널 색: 지금 고른 테마(assets/theme.scss의 CSS 변수)에서 읽는다.
function terminalTheme() {
  const style = getComputedStyle(document.documentElement)
  const color = name => style.getPropertyValue(name).trim()

  return {
    background: color('--js-bg'),
    foreground: color('--js-text'),
    cursor: color('--js-primary'),
    cursorAccent: color('--js-bg'),
    selectionBackground: color('--js-line'),
    red: color('--js-danger'),
    green: '#3dff8a',
    yellow: color('--js-sun'),
    blue: '#5aa9ff',
    magenta: color('--js-primary'),
    cyan: color('--js-secondary'),
    white: color('--js-text'),
    brightBlack: color('--js-text-muted')
  }
}

// 하단의 터미널 패널. 탭마다 xterm.js 화면을 하나씩 두고, main의 pty와 키 입력/출력을 주고받는다.
export default {
  name: 'TerminalPanel',
  data() {
    return {
      height: 280
    }
  },
  computed: {
    ...mapGetters({ sessions: 'terminalSessions', activeKey: 'activeTerminalKey', isOpen: 'isTerminalPanelOpen' })
  },
  watch: {
    // 테마를 바꾸면 열린 터미널의 색도 바꾼다.
    '$store.getters.setting.theme'() {
      this.$nextTick(() => {
        for (const [, entry] of this.terms) entry.term.options.theme = terminalTheme()
      })
    },
    // 새 탭: 화면을 만들고 main에 세션을 연다.
    sessions(list) {
      this.$nextTick(() => list.filter(x => x.request && !this.terms.has(x.key)).forEach(x => this.start(x)))
    },
    activeKey() {
      this.$nextTick(() => this.fitActive(true))
    },
    isOpen(open) {
      if (open) this.$nextTick(() => this.fitActive(true))
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
  },
  beforeDestroy() {
    this.stopData?.()
    this.stopExit?.()
    this.observer?.disconnect()
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
        cursorBlink: true,
        fontFamily: '"JetBrains Mono", Consolas, "Cascadia Mono", "DejaVu Sans Mono", monospace',
        fontSize: 13,
        scrollback: 5000,
        theme: terminalTheme()
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      const entry = { term, fit, id: null }
      this.terms.set(session.key, entry)

      const el = this.$refs[`term-${session.key}`]?.[0]
      term.open(el)
      this.fit(entry)
      term.focus()

      term.onData(data => entry.id !== null && window.preload.terminal.write(entry.id, data))

      const result = await window.preload.terminal.open(kind, payload, { cols: term.cols, rows: term.rows })
      if (!result.ok) {
        term.write(`\x1b[31m${String(result.error).replace(/\n/g, '\r\n')}\x1b[0m\r\n`)
        this.$store.commit('terminalUpdate', { key: session.key, status: 'failed' })
        return
      }

      entry.id = result.id
      this.router.register(result.id, data => term.write(data))
      this.$store.commit('terminalUpdate', { key: session.key, id: result.id, status: 'running' })
      // 여는 동안 패널 크기가 바뀌었을 수 있다.
      this.fit(entry, true)
    },
    onExit(id, exitCode) {
      const session = this.sessions.find(x => x.id === id)
      if (!session) return

      const entry = this.terms.get(session.key)
      entry?.term.write(`\r\n\x1b[90m[session ended${exitCode ? `, exit status ${exitCode}` : ''}]\x1b[0m\r\n`)
      this.router.unregister(id)
      this.$store.commit('terminalUpdate', { key: session.key, status: 'exited', exitCode })
    },
    closeSession(session) {
      const entry = this.terms.get(session.key)
      if (entry) {
        if (entry.id !== null && session.status === 'running') window.preload.terminal.close(entry.id)
        if (entry.id !== null) this.router.unregister(entry.id)
        entry.term.dispose()
        this.terms.delete(session.key)
      }
      this.$store.commit('terminalRemove', session.key)
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
    statusText(session) {
      return {
        starting: 'Starting',
        running: 'Running',
        exited: session.exitCode ? `Ended (exit status ${session.exitCode})` : 'Ended',
        failed: 'Could not start'
      }[session.status]
    },
    startResize(event) {
      const startY = event.clientY
      const startHeight = this.height
      const max = () => Math.max(MIN_HEIGHT, (this.$el.parentElement?.clientHeight || 600) - 80)
      const move = e => { this.height = Math.min(max(), Math.max(MIN_HEIGHT, startHeight + startY - e.clientY)) }
      const up = () => {
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

.terminal-tabs {
  display: flex;
  align-items: stretch;
  gap: 4px;
  min-height: 34px;
  padding: 3px 8px 0 14px;
  overflow-x: auto;
  background: var(--js-bg-raised);
  border-bottom: 2px solid var(--js-primary);
}

.terminal-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 220px;
  padding: 0 8px 0 14px;
  background: var(--js-surface);
  color: var(--js-text-muted);
  font-family: var(--js-font-display);
  font-size: 1.3rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  user-select: none;

  &:hover {
    color: var(--js-text);
  }

  &.active {
    background: var(--js-primary);
    color: var(--js-on-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--js-secondary);
    outline-offset: -2px;
  }
}

.terminal-tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-status {
  flex: none;
  width: 8px;
  height: 8px;
  background: var(--js-line);

  .is-starting & {
    background: var(--js-sun);
  }

  .is-running & {
    background: var(--js-live);
  }

  .is-failed & {
    background: var(--js-danger);
  }
}

.terminal-tab-close,
.terminal-hide {
  padding: 2px 6px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  line-height: 1;

  &:hover {
    background: var(--js-hover);
    color: var(--js-text);
  }

  &:focus-visible {
    outline: 2px solid var(--js-sun);
    outline-offset: -2px;
  }
}

// 분홍 바탕의 활성 탭 위에서는 어둡게 눌러 보인다.
.terminal-tab.active .terminal-tab-close:hover {
  background: rgba(0, 0, 0, 0.25);
  color: var(--js-on-primary);
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
