<template>
  <div
    class="icon-picker"
    role="radiogroup"
    aria-label="Node icon"
    :aria-disabled="disabled ? 'true' : null"
    @keydown="onKeydown"
  >
    <button
      v-for="(icon, index) in options"
      :key="icon || 'none'"
      type="button"
      role="radio"
      class="icon-picker-item"
      :class="{ 'icon-picker-selected': icon === selected }"
      :aria-checked="icon === selected ? 'true' : 'false'"
      :aria-label="label(index)"
      :title="label(index)"
      :tabindex="icon === selected ? 0 : -1"
      :disabled="disabled"
      @click="$emit('input', icon)"
    >
      <img
        v-if="icon"
        :src="base + icon"
        alt=""
        draggable="false"
        width="28"
        height="28"
        loading="lazy"
      >
      <span
        v-else
        class="icon-picker-none"
        aria-hidden="true"
      >-</span>
    </button>
  </div>
</template>

<script>
import { cycle } from '@/utils/cycle'

// 노드 이미지를 목록에서 보고 고른다. 라디오 그룹처럼 동작하고, 방향키/Home/End로 옮길 수 있다.
export default {
  name: 'IconPicker',
  props: {
    // 선택한 이미지 파일 이름 (없으면 null)
    value: {
      type: String,
      default: null
    },
    // 고를 수 있는 이미지 파일 이름들
    icons: {
      type: Array,
      default: () => []
    },
    // 이미지 파일이 있는 주소 (파일 이름 앞에 붙는다)
    base: {
      type: String,
      default: ''
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    // 맨 앞은 "이미지 없음"
    options() {
      return [null, ...this.icons]
    },
    selected() {
      return this.options.includes(this.value) ? this.value : null
    }
  },
  methods: {
    // 뒤쪽 이미지를 골라 둔 경우에도 보이도록 스크롤한다. 팝오버가 열린 뒤에 불러야 크기를 알 수 있다.
    scrollToSelected() {
      const selected = this.$el.querySelector('[aria-checked="true"]')
      if (selected) {
        this.$el.scrollTop = Math.max(0, selected.offsetTop - this.$el.offsetTop - this.$el.clientHeight / 2)
      }
    },
    label(index) {
      return index === 0 ? 'No icon' : `Icon ${index}`
    },
    onKeydown(event) {
      const steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
      let next
      if (event.key in steps) {
        next = cycle(this.options, this.selected, steps[event.key])
      } else if (event.key === 'Home') {
        next = this.options[0]
      } else if (event.key === 'End') {
        next = this.options[this.options.length - 1]
      } else {
        return
      }

      event.preventDefault()
      if (this.disabled) return

      this.$emit('input', next)
      this.$nextTick(() => {
        const button = this.$el.querySelector('[aria-checked="true"]')
        if (button) {
          button.focus()
        }
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.icon-picker {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
  max-height: 136px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--js-line);
  background: var(--js-bg);
}

.icon-picker-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0;
  border: 2px solid transparent;
  background: transparent;

  img {
    filter: invert(1) brightness(0.85);
  }

  &:hover:not(:disabled) {
    background: var(--js-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--js-secondary);
    outline-offset: 1px;
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  &.icon-picker-selected {
    border-color: var(--js-primary);
    background: var(--js-primary-soft);
    box-shadow: 2px 2px 0 var(--js-shadow);
  }
}

.icon-picker-none {
  color: var(--js-text-muted);
}
</style>
