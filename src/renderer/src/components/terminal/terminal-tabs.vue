<template>
  <div class="terminal-tabs">
    <!-- 탭이 많으면 이 목록만 옆으로 넘긴다. 숨기기 단추는 늘 보인다. -->
    <div
      ref="tabList"
      class="terminal-tab-list"
      role="tablist"
      @wheel="scrollTabs"
    >
      <div
        v-for="session in sessions"
        :key="session.key"
        :ref="`tab-${session.key}`"
        class="terminal-tab"
        :class="{ active: session.key === activeKey, [`is-${session.status}`]: true, 'is-connecting': session.status === 'running' && !session.connected, 'has-error': session.status === 'exited' && !!session.exitCode }"
        role="tab"
        :aria-selected="session.key === activeKey ? 'true' : 'false'"
        tabindex="0"
        :title="`${session.title}: ${statusText(session)}`"
        @click="$emit('activate', session.key)"
        @keydown.enter.self="$emit('activate', session.key)"
        @keydown.space.self.prevent="$emit('activate', session.key)"
      >
        <span
          class="terminal-status"
          aria-hidden="true"
        />
        <span class="terminal-tab-title">{{ session.title }}</span>
        <!-- 다시 연결과 닫기는 붙여서 탭 오른쪽 끝에 둔다 -->
        <span class="terminal-tab-actions">
          <button
            v-if="canReconnect(session)"
            type="button"
            class="terminal-tab-button"
            :aria-label="`Reconnect ${session.title}`"
            title="Reconnect (or press Enter in the terminal)"
            @click.stop="$emit('reconnect', session)"
          >
            <b-icon
              icon="arrow-clockwise"
              class="terminal-reconnect-icon"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            class="terminal-tab-button"
            :aria-label="`Close ${session.title}`"
            title="Close"
            @click.stop="$emit('close', session)"
          >
            <b-icon
              icon="x"
              aria-hidden="true"
            />
          </button>
        </span>
      </div>
    </div>

    <button
      type="button"
      class="terminal-hide"
      aria-label="Hide terminals"
      title="Hide terminals (they keep running)"
      @click="$emit('hide')"
    >
      <b-icon
        icon="chevron-down"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<script>
import { canReconnect } from '@/utils/terminal-sessions'
import { revealScrollLeft, sessionStatusText } from '@/utils/terminal-view'

// 터미널 패널 위쪽의 탭 줄. 탭이 많으면 좁아졌다가 목록만 옆으로 넘어가고, 활성 탭은 늘 보이게 한다.
// 탭을 고르기, 다시 연결, 닫기, 패널 숨기기는 이벤트(activate, reconnect, close, hide)로 패널에 알린다.
export default {
  name: 'TerminalTabs',
  props: {
    sessions: {
      type: Array,
      required: true
    },
    activeKey: {
      type: Number,
      default: null
    }
  },
  watch: {
    activeKey() {
      this.$nextTick(() => this.reveal())
    }
  },
  mounted() {
    // 창 크기가 바뀌거나 숨겨 둔 패널이 다시 보일 때도 활성 탭을 보이게 한다.
    this.observer = new ResizeObserver(() => this.reveal())
    this.observer.observe(this.$el)
  },
  beforeDestroy() {
    this.observer?.disconnect()
  },
  methods: {
    canReconnect,
    statusText: sessionStatusText,
    // 넘치는 탭 목록은 세로 휠로도 옆으로 넘긴다.
    scrollTabs(event) {
      const list = this.$refs.tabList
      if (!list || event.deltaX || !event.deltaY || list.scrollWidth <= list.clientWidth) return
      list.scrollLeft += event.deltaY
      event.preventDefault()
    },
    // 탭이 많아 목록이 넘칠 때 활성 탭이 보이게 넘긴다.
    reveal() {
      const list = this.$refs.tabList
      const tab = this.$refs[`tab-${this.activeKey}`]?.[0]
      if (!list || !tab) return

      const listRect = list.getBoundingClientRect()
      const tabRect = tab.getBoundingClientRect()
      list.scrollLeft = revealScrollLeft(
        { scrollLeft: list.scrollLeft, width: list.clientWidth },
        { left: tabRect.left - listRect.left + list.scrollLeft, width: tabRect.width }
      )
    }
  }
}
</script>

<style lang="scss" scoped>
.terminal-tabs {
  display: flex;
  align-items: stretch;
  gap: 4px;
  min-height: 34px;
  padding: 3px 8px 0 14px;
  background: var(--js-bg-raised);
  border-bottom: 2px solid var(--js-primary);
}

// 탭이 많으면 먼저 좁아지고(min-width까지), 그래도 넘치면 이 목록만 옆으로 넘긴다.
.terminal-tab-list {
  display: flex;
  flex: 1;
  align-items: stretch;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
  // 스크롤바가 생기면 탭 높이가 줄어 글자가 움직이므로 숨긴다. 휠로 넘기고, 활성 탭과 포커스한 탭은 저절로 보인다.
  scrollbar-width: none;
}

.terminal-tab {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 8px;
  min-width: 150px;
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

  // 끝난 탭에는 다시 연결 단추가 하나 더 붙는다. 그만큼 넓혀서 제목이 더 짧게 잘리지 않게 한다.
  &.is-exited {
    min-width: 172px; // 150px + 다시 연결 단추(22px)
    max-width: 242px; // 220px + 다시 연결 단추
  }

  &:focus-visible {
    outline: 2px solid var(--js-secondary);
    outline-offset: -2px;
  }
}

.terminal-tab-title {
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-status {
  flex: none;
  width: 8px;
  height: 8px;
  background: var(--js-line);

  .is-running & {
    background: var(--js-live);
  }

  // 시작 중이거나, 실행 중이지만 아직 로그인하지 않았다 (캔버스의 연결 중과 같은 노랑)
  .is-starting &,
  .is-running.is-connecting & {
    background: var(--js-connecting);
  }

  .is-failed &,
  .has-error & {
    background: var(--js-danger);
  }

  // 활성 탭의 분홍 바탕은 오류 빨강과 거의 같은 색이라, 점에 어두운 테두리를 둘러 구분한다.
  .active & {
    box-shadow: 0 0 0 2px var(--js-on-primary);
  }
}

.terminal-tab-actions {
  display: flex;
  flex: none;
  align-items: center;
  margin-left: auto;
}

// 탭의 단추 아이콘은 글자보다 작게, 둘이 같은 크기로 보이게 한다.
// (x는 그림 둘레에 여백이 많아서 같은 글꼴 크기면 다시 연결 화살표보다 작게 그려진다)
.terminal-tab-actions .terminal-tab-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  font-size: 22px;

  // 글자 기준선 대신 단추 가운데에 놓는다
  .b-icon {
    display: block;
  }
}

.terminal-reconnect-icon {
  font-size: 11px;
}

.terminal-tab-button,
.terminal-hide {
  flex: none;
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
.terminal-tab.active .terminal-tab-button:hover {
  background: rgba(0, 0, 0, 0.25);
  color: var(--js-on-primary);
}
</style>
