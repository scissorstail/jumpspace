<template>
  <!-- header-menu의 flex 항목으로 그대로 이어지도록 wrapper는 레이아웃에 참여하지 않는다 -->
  <div class="forward-menu">
    <!-- 켜져 있는 포워딩을 바로 시작한다 -->
    <span
      v-if="activeCount > 0"
      class="menu-item forward-start"
    >
      <button
        type="button"
        class="menu-button"
        :class="{ 'menu-button-off': !plan.mode }"
        :aria-label="startTitle"
        :title="startTitle"
        :aria-disabled="plan.mode ? null : 'true'"
        @click="start"
      >
        <b-icon
          icon="arrow-left-right"
          font-scale="2"
          aria-hidden="true"
        />
      </button>
      <b-badge
        class="forward-badge"
        pill
        variant="primary"
        aria-hidden="true"
      >
        {{ activeCount }}
      </b-badge>
    </span>

    <!-- 포워딩 목록 -->
    <span class="menu-item">
      <v-popover
        ref="popover"
        placement="auto-end"
        @apply-show="onPopoverShow"
        @hide="onPopoverHide(); $emit('hide')"
      >
        <button
          type="button"
          class="menu-button"
          aria-label="Port forwarding"
          title="Port forwarding"
          aria-haspopup="dialog"
          @click="onTriggerClick"
        >
          <b-icon
            icon="link45deg"
            font-scale="2"
            aria-hidden="true"
          />
        </button>
        <template slot="popover">
          <div class="forward-panel p-3">
            <div class="forward-title">
              Port forwarding
            </div>
            <div
              class="forward-hint"
              :class="{ 'forward-hint-blocked': !plan.mode }"
            >
              {{ hint }}
            </div>

            <div
              v-if="value.length > 0"
              class="forward-list"
            >
              <div class="forward-row forward-labels">
                <span />
                <span>Local port</span>
                <span />
                <span>Target host</span>
                <span />
                <span>Port</span>
                <span />
              </div>
              <div
                v-for="(forward, index) in value"
                :key="index"
                class="forward-row"
              >
                <b-form-checkbox
                  :checked="forward.checked"
                  class="forward-check"
                  :aria-label="`Enable forward ${index + 1}`"
                  :title="`Enable forward ${index + 1}`"
                  :disabled="disabled"
                  @change="change(index, { checked: $event })"
                />
                <b-form-input
                  :value="forward.from"
                  trim
                  maxlength="5"
                  placeholder="8080"
                  aria-label="Local port"
                  :state="portState(forward.from, forward.checked)"
                  size="sm"
                  :disabled="disabled"
                  @update="change(index, { from: $event })"
                />
                <b-icon
                  class="forward-arrow"
                  :style="{ opacity: forward.checked ? 1 : 0.3 }"
                  icon="arrow-right"
                />
                <b-form-input
                  :value="forward.host"
                  trim
                  :placeholder="plan.defaultHost"
                  aria-label="Target host"
                  size="sm"
                  :disabled="disabled"
                  @update="change(index, { host: $event })"
                />
                <span class="forward-colon">:</span>
                <b-form-input
                  :value="forward.to"
                  trim
                  maxlength="5"
                  placeholder="80"
                  aria-label="Target port"
                  :state="portState(forward.to, forward.checked)"
                  size="sm"
                  :disabled="disabled"
                  @update="change(index, { to: $event })"
                />
                <b-button
                  size="sm"
                  variant="outline-secondary"
                  aria-label="Remove forward"
                  title="Remove forward"
                  :disabled="disabled"
                  @click="remove(index)"
                >
                  <b-icon icon="dash" />
                </b-button>
              </div>
            </div>
            <div
              v-else
              class="forward-empty"
            >
              No forwards yet. A forward opens a port on this computer that leads to a host and port behind {{ plan.mode === 'target' ? 'the previous node' : 'this node' }}.
            </div>

            <div
              v-if="disabled"
              class="forward-locked"
            >
              <b-icon
                icon="lock"
                class="mr-1"
              />Unlock the editor to change the list.
            </div>

            <div class="forward-actions">
              <b-button
                size="sm"
                variant="outline-secondary"
                title="Add a forward"
                :disabled="disabled"
                @click="add"
              >
                <b-icon
                  icon="plus"
                  class="mr-1"
                />Add
              </b-button>
              <b-button
                size="sm"
                variant="primary"
                class="ml-auto"
                :title="startTitle"
                :disabled="!canStart"
                @click="start"
              >
                <b-icon
                  icon="play-fill"
                  class="mr-1"
                />Start<template v-if="activeCount > 0">
                  ({{ activeCount }})
                </template>
              </b-button>
            </div>
          </div>
        </template>
      </v-popover>
    </span>
  </div>
</template>

<script>
import { closePopoverOnEscape } from '@/utils/dismiss'
import { activeForwards, portState } from '@/utils/forward'

// 노드의 포트포워딩 목록(v-model)과 시작 버튼. 목록은 항상 새 배열로 바꿔서 부모에게 돌려준다.
export default {
  name: 'ForwardMenu',
  mixins: [closePopoverOnEscape],
  props: {
    // [{ checked, from, host, to }]
    value: {
      type: Array,
      default: () => []
    },
    // 목록을 수정할 수 없는 상태(에디터 잠금)
    disabled: {
      type: Boolean,
      default: false
    },
    // forwardPlan()의 결과: { mode, defaultHost, reason }
    plan: {
      type: Object,
      required: true
    },
    // 창 위쪽에 보여줄 설명
    hint: {
      type: String,
      default: ''
    }
  },
  computed: {
    activeCount() {
      return activeForwards(this.value).length
    },
    canStart() {
      return Boolean(this.plan.mode) && this.activeCount > 0
    },
    startTitle() {
      if (!this.plan.mode) return this.plan.reason
      if (this.activeCount === 0) return 'Turn on at least one forward.'
      return `Open ${this.activeCount} tunnel${this.activeCount === 1 ? '' : 's'}`
    }
  },
  methods: {
    portState,
    change(index, patch) {
      this.$emit('input', this.value.map((x, i) => (i === index ? { ...x, ...patch } : x)))
    },
    add() {
      this.$emit('input', [...this.value, { checked: false, from: null, host: null, to: null }])
    },
    remove(index) {
      this.$emit('input', this.value.filter((x, i) => i !== index))
    },
    start() {
      if (!this.canStart) return

      this.$emit('start')

      // 창에서 눌렀다면 닫는다.
      const popover = this.$refs.popover
      if (popover && popover.isOpen) {
        popover.hide()
      }
    }
  }
}
</script>

<style lang="scss">
.forward-menu {
  display: contents;
}

.forward-start {
  position: relative;
}

.forward-badge {
  position: absolute;
  top: -3px;
  right: -7px;
  font-size: 0.65rem;
  pointer-events: none;
}

// 팝오버는 body 아래에 그려지므로 scoped를 쓰지 않고 클래스 접두사로 범위를 좁힌다.
.forward-panel {
  width: 440px;

  .forward-title {
    font-weight: 600;
  }

  .forward-hint {
    margin-bottom: 0.75rem;
    font-size: 0.8rem;
    color: #565e64;

    &.forward-hint-blocked {
      color: #8a5a00;
    }
  }

  .forward-row {
    display: grid;
    grid-template-columns: 26px 78px 18px minmax(0, 1fr) 8px 78px 32px;
    gap: 6px;
    align-items: center;
    margin-bottom: 6px;
  }

  .forward-labels {
    margin-bottom: 2px;
    font-size: 0.7rem;
    color: #565e64;
  }

  .forward-check {
    // 표 칸 안에서 위아래 여백 없이 가운데에 맞춘다.
    min-height: 0;
    margin: 0;
    padding-left: 1.5rem;
  }

  .forward-arrow {
    justify-self: center;
  }

  .forward-colon {
    text-align: center;
    color: #565e64;
  }

  .forward-empty {
    padding: 0.5rem 0;
    font-size: 0.8rem;
    color: #565e64;
  }

  .forward-locked {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #565e64;
  }

  .forward-actions {
    display: flex;
    margin-top: 0.5rem;
  }
}
</style>
