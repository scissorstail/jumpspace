<template>
  <div
    class="terminal-tabs"
    :class="{ 'is-minimized': isMinimized }"
  >
    <!-- 탭이 많으면 이 목록만 옆으로 넘긴다. 오른쪽 끝의 패널 단추(최대화, 최소화 또는 다시 보이기)는 늘 보인다.
         탭을 끌면 순서가 바뀐다 (닫기 단추에서는 끌리지 않는다). -->
    <draggable
      ref="tabList"
      :value="sessions"
      tag="div"
      class="terminal-tab-list"
      role="tablist"
      direction="horizontal"
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
        :class="{ active: session.key === activeKey && !isMinimized, 'is-side': session.key === sideKey && !isMinimized, [`is-${session.status}`]: true, 'is-connecting': session.status === 'running' && !session.connected, 'has-error': session.status === 'exited' && !!session.exitCode }"
        role="tab"
        :aria-selected="session.key === activeKey && !isMinimized ? 'true' : 'false'"
        tabindex="0"
        :title="`${label(session)}: ${statusText(session)}${routeText(session)}`"
        @click="$emit('activate', session.key)"
        @mousedown.middle.prevent
        @auxclick.middle="$emit('close', session)"
        @keydown.enter.self="$emit('activate', session.key)"
        @keydown.space.self.prevent="$emit('activate', session.key)"
      >
        <span
          class="terminal-status"
          aria-hidden="true"
        />
        <span class="terminal-tab-title">{{ session.title }}</span>
        <!-- 이름이 같은 탭의 번호. 이름이 잘려도(말줄임) 번호는 남는다. -->
        <span
          v-if="numbers.has(session.key)"
          class="terminal-tab-number"
        >({{ numbers.get(session.key) }})</span>
        <!-- 가운데 단추(휠)로 눌러도 닫힌다, 브라우저의 탭처럼. 누를 때 Windows의 자동 스크롤이 시작되지 않게 막는다. -->
        <!-- 닫기는 탭 오른쪽 끝에 둔다. 끝난 세션은 터미널에서 Enter로 다시 연결한다 (단추는 두지 않는다). -->
        <span class="terminal-tab-actions">
          <button
            type="button"
            class="terminal-tab-button"
            :aria-label="`Close ${label(session)}`"
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

    <!-- 좌우로 나누기 (owner, 2026-10-12): 고른 탭 옆에 다른 탭 하나를 함께 보여준다. 탭이 둘은 있어야 한다.
         최소화한 동안에는 나눌 화면이 없으므로 단추도 없다. -->
    <button
      v-if="!isMinimized"
      type="button"
      class="terminal-split"
      :aria-label="isSplit ? 'Show one terminal' : 'Split terminals left and right'"
      :title="splitTitle"
      :aria-pressed="isSplit ? 'true' : 'false'"
      :disabled="!canSplit"
      @click="$emit('split', !isSplit)"
    >
      <b-icon
        icon="layout-split"
        aria-hidden="true"
      />
    </button>
    <!-- 창의 단추처럼: 헤더 아래까지 올리기(최대화한 동안에는 내리기)와 최소화(탭 줄만 아래쪽에 남는다).
         최소화한 동안에는 최소화 단추가 다시 보이기 단추다 (같은 자리: 두 번 누르면 원래대로다). 탭을 눌러도 다시 보인다. -->
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
      :aria-label="isMinimized ? 'Show terminals' : 'Minimize terminals'"
      :title="isMinimized ? 'Show terminals' : 'Minimize terminals (they keep running)'"
      @click="$emit(isMinimized ? 'show' : 'hide')"
    >
      <!-- 줄의 길이를 옆 단추의 가로줄에 맞춘다 (dash는 그대로 두면 짧다) -->
      <b-icon
        :icon="isMinimized ? 'chevron-up' : 'dash'"
        :scale="isMinimized ? 1 : 1.4"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<script>
import draggable from 'vuedraggable'
import { duplicateNumbers, numberedTitle } from '@/utils/terminal-sessions'
import { revealScrollLeft, sessionRouteText, sessionStatusText } from '@/utils/terminal-view'

// 터미널 패널 위쪽의 탭 줄. 탭이 많으면 좁아졌다가 목록만 옆으로 넘어가고, 활성 탭은 늘 보이게 한다.
// 탭을 고르기, 닫기, 끌어서 바꾼 순서, 좌우로 나누기/합치기, 패널 최대화/내리기, 패널 최소화/다시 보이기는
// 이벤트(activate, close, reorder, split, maximize, hide, show)로 패널에 알린다.
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
    // 좌우로 나눈 동안 다른 칸에 보이는 탭 (없으면 null: 나누지 않았다)
    sideKey: {
      type: Number,
      default: null
    },
    // 패널이 헤더 아래까지 올라가 있는지 (최대화 단추가 내리기 단추로 바뀐다)
    isMaximized: {
      type: Boolean,
      default: false
    },
    // 패널을 최소화해서 이 탭 줄만 남았는지 (고른 탭을 표시하지 않고, 최소화 단추가 다시 보이기 단추로 바뀐다)
    isMinimized: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    isSplit() {
      return this.sideKey !== null
    },
    // 나누려면 탭이 둘은 있어야 한다. (나눈 것을 합치는 것은 늘 된다)
    canSplit() {
      return this.isSplit || this.sessions.length >= 2
    },
    // 누를 수 없을 때는 왜인지 말한다: 흐린 단추만으로는 탭을 하나 더 열어야 한다는 것을 알 수 없다.
    splitTitle() {
      if (this.isSplit) return 'Show one terminal'
      return this.canSplit ? 'Split: show two terminals side by side' : 'Split needs a second terminal'
    },
    // 이름이 같은 탭들의 번호 (key -> 번호)
    numbers() {
      return duplicateNumbers(this.sessions)
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
    routeText: sessionRouteText,
    label(session) {
      return numberedTitle(session.title, this.numbers.get(session.key))
    },
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

  // 최소화한 동안에는 아래에 터미널이 없다: 줄은 창 아래 가장자리에 붙어서 아무것도 나누지 않는다.
  // 자리는 남긴다 (탭 줄의 높이가 그대로여야 캔버스 높이가 바뀌지 않는다).
  &.is-minimized {
    border-bottom-color: transparent;
  }
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

  // 좌우로 나눈 동안 다른 칸에 보이는 탭: 고른 탭(분홍 바탕)의 빈 모양으로, 같은 색의 테두리만 두른다.
  // (아래에 줄만 그었더니 탭 줄 아래의 같은 색 테두리와 붙어서 보이지 않았다)
  &.is-side {
    color: var(--js-text);
    box-shadow: inset 0 0 0 2px var(--js-primary);
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

// 번호는 줄어들지 않는다: 탭이 좁아지면 이름만 잘린다. (이름과의 간격은 낱말 사이만큼)
.terminal-tab-number {
  flex: none;
  margin-left: -2px;
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
.terminal-split,
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

// 나눈 동안에는 눌린 단추로 보인다. 탭이 하나뿐이면 누를 수 없다.
.terminal-split {
  &[aria-pressed='true'] {
    color: var(--js-primary);
  }

  &:disabled {
    background: transparent;
    color: var(--js-text-muted);
    opacity: 0.4;
    cursor: default;
  }
}

// 분홍 바탕의 활성 탭 위에서는 어둡게 눌러 보인다.
.terminal-tab.active .terminal-tab-button:hover {
  background: rgba(0, 0, 0, 0.25);
  color: var(--js-on-primary);
}
</style>
