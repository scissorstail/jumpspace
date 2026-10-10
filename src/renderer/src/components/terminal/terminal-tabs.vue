<template>
  <div class="terminal-tabs">
    <!-- 탭이 많으면 이 목록만 옆으로 넘긴다. 오른쪽 끝의 패널 단추(최대화, 최소화)는 늘 보인다.
         탭을 끌면 순서가 바뀐다 (닫기 단추에서는 끌리지 않는다). -->
    <draggable
      ref="tabList"
      :value="sessions"
      tag="div"
      class="terminal-tab-list"
      role="tablist"
      direction="horizontal"
      :animation="120"
      filter=".terminal-tab-button"
      :prevent-on-filter="false"
      ghost-class="terminal-tab-ghost"
      @input="$emit('reorder', $event.map(x => x.key))"
      @wheel.native="scrollTabs"
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
        <!-- 닫기는 탭 오른쪽 끝에 둔다. 끝난 세션은 터미널에서 Enter로 다시 연결한다 (단추는 두지 않는다). -->
        <span class="terminal-tab-actions">
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
    </draggable>

    <!-- 창의 단추처럼: 헤더 아래까지 올리기(최대화한 동안에는 내리기)와 최소화(패널을 숨긴다, 헤더의 터미널 단추로 다시 연다) -->
    <button
      type="button"
      class="terminal-maximize"
      :aria-label="isMaximized ? 'Lower terminals' : 'Maximize terminals'"
      :title="isMaximized ? 'Lower terminals (show the diagram)' : 'Maximize terminals (up to the header)'"
      @click="$emit('maximize', !isMaximized)"
    >
      <b-icon
        :icon="isMaximized ? 'chevron-bar-down' : 'chevron-bar-up'"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      class="terminal-hide"
      aria-label="Minimize terminals"
      title="Minimize terminals (they keep running)"
      @click="$emit('hide')"
    >
      <!-- 줄의 길이를 옆 단추의 가로줄에 맞춘다 (dash는 그대로 두면 짧다) -->
      <b-icon
        icon="dash"
        scale="1.4"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<script>
import draggable from 'vuedraggable'
import { revealScrollLeft, sessionStatusText } from '@/utils/terminal-view'

// 터미널 패널 위쪽의 탭 줄. 탭이 많으면 좁아졌다가 목록만 옆으로 넘어가고, 활성 탭은 늘 보이게 한다.
// 탭을 고르기, 닫기, 끌어서 바꾼 순서, 패널 최대화/내리기, 패널 숨기기는 이벤트(activate, close, reorder, maximize, hide)로 패널에 알린다.
export default {
  name: 'TerminalTabs',
  components: { draggable },
  props: {
    sessions: {
      type: Array,
      required: true
    },
    activeKey: {
      type: Number,
      default: null
    },
    // 패널이 헤더 아래까지 올라가 있는지 (최대화 단추가 내리기 단추로 바뀐다)
    isMaximized: {
      type: Boolean,
      default: false
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
    statusText: sessionStatusText,
    // 넘치는 탭 목록은 세로 휠로도 옆으로 넘긴다.
    scrollTabs(event) {
      const list = this.$refs.tabList?.$el
      if (!list || event.deltaX || !event.deltaY || list.scrollWidth <= list.clientWidth) return
      list.scrollLeft += event.deltaY
      event.preventDefault()
    },
    // 탭이 많아 목록이 넘칠 때 활성 탭이 보이게 넘긴다.
    reveal() {
      const list = this.$refs.tabList?.$el
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
  // 폭은 제목 길이에 맞춘다. 탭이 많으면 min-width까지 줄어들고(제목은 말줄임), 그래도 넘치면 목록이 넘어간다.
  min-width: 132px;
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

// 끄는 동안 탭이 놓일 자리: 윤곽만 남긴다.
.terminal-tab-ghost {
  outline: 2px dashed var(--js-secondary);
  outline-offset: -2px;
  opacity: 0.45;
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

// 탭의 단추 아이콘은 글자보다 작게 한다. (x는 그림 둘레에 여백이 많아서 글꼴 크기보다 작게 그려진다)
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

.terminal-tab-button,
.terminal-maximize,
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
