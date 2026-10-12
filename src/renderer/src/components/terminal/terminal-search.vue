<template>
  <!-- 터미널에 지나간 출력에서 찾기 (Ctrl+Shift+F). 고른 탭의 화면 오른쪽 위에 뜬다.
       Enter는 위로(지난 쪽으로), Shift+Enter는 아래로 간다: 새 출력이 아래에 있어서 찾는 것은 대개 위에 있다. Esc는 닫는다. -->
  <div
    class="terminal-search"
    role="search"
    @keydown.esc.stop.prevent="$emit('close')"
  >
    <input
      ref="input"
      type="text"
      class="terminal-search-input"
      :class="{ 'is-missing': isMissing }"
      :value="value"
      placeholder="Find in terminal"
      aria-label="Find in terminal"
      :aria-invalid="isMissing ? 'true' : 'false'"
      spellcheck="false"
      autocomplete="off"
      @input="$emit('input', $event.target.value)"
      @keydown.enter.exact.prevent="$emit('find', 'previous')"
      @keydown.enter.shift.exact.prevent="$emit('find', 'next')"
    >
    <span
      v-show="isMissing"
      class="terminal-search-missing"
      role="status"
    >No match</span>
    <button
      type="button"
      class="terminal-search-button"
      aria-label="Previous match"
      title="Previous match (Enter)"
      :disabled="value === ''"
      @click="$emit('find', 'previous')"
    >
      <b-icon
        icon="chevron-up"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      class="terminal-search-button"
      aria-label="Next match"
      title="Next match (Shift+Enter)"
      :disabled="value === ''"
      @click="$emit('find', 'next')"
    >
      <b-icon
        icon="chevron-down"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      class="terminal-search-button"
      aria-label="Close find"
      title="Close (Esc)"
      @click="$emit('close')"
    >
      <b-icon
        icon="x"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<script>
export default {
  name: 'TerminalSearch',
  props: {
    value: { type: String, required: true },
    // 찾는 글이 터미널에 없다
    isMissing: { type: Boolean, default: false }
  },
  methods: {
    // 열 때와, 열린 채로 Ctrl+Shift+F를 다시 눌렀을 때: 바로 고쳐 칠 수 있게 전부 고른다.
    focus() {
      this.$refs.input.focus()
      this.$refs.input.select()
    }
  }
}
</script>

<style lang="scss" scoped>
.terminal-search {
  position: absolute;
  top: 6px;
  right: 18px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--js-line);
  background: var(--js-surface);
  color: var(--js-text-muted);
  font-size: 13px;

  // 좌우로 나눈 동안 왼쪽 칸에서 찾을 때
  &.is-left {
    right: calc(50% + 13px);
  }
}

.terminal-search-input {
  width: 180px;
  padding: 2px 6px;
  border: 1px solid var(--js-line);
  border-radius: 0;
  background: var(--js-bg);
  color: var(--js-text);
  font: inherit;

  &:focus {
    border-color: var(--js-sun);
    outline: 0;
  }

  &.is-missing {
    border-color: var(--js-danger);
  }
}

.terminal-search-missing {
  padding: 0 4px;
  color: var(--js-danger);
  white-space: nowrap;
}

.terminal-search-button {
  flex: none;
  padding: 3px 5px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  line-height: 1;

  &:hover:not(:disabled) {
    background: var(--js-hover);
    color: var(--js-text);
  }

  &:focus-visible {
    outline: 2px solid var(--js-sun);
    outline-offset: -2px;
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}
</style>
